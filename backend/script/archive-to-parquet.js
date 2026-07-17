// Monthly archiver: SQLite history tables -> Parquet files.
//
// Design note / limitation: nodesensor_history mixes two different payload
// shapes (source: "relay" vs source: "sensor", see MQTT_DATA_REFERENCE.md),
// and parquetjs-lite requires one fixed schema per file. Rather than guess
// at a merged schema (and risk silently dropping fields if the firmware
// payload changes), this archiver stores `payload` as a raw JSON string
// column alongside the indexed fields (id, node_id/kind, received_at).
// Consumers reading the Parquet files need to json-parse that column
// themselves. If you want fully flattened per-source columns instead, that
// should be a deliberate downstream transform, not baked into archiving.
//
// Usage:
//   node script/archive-to-parquet.js            # archives last calendar month
//   node script/archive-to-parquet.js 2026-06     # archives a specific month

const path = require('path');
const fs = require('fs');
const parquet = require('parquetjs-lite');
const db = require('../db');
const config = require('../config');

const nodesensorSchema = new parquet.ParquetSchema({
  id: { type: 'INT64' },
  node_id: { type: 'INT32' },
  source: { type: 'UTF8' },
  payload: { type: 'UTF8' }, // raw original JSON message
  received_at: { type: 'INT64' },
});

const statusSchema = new parquet.ParquetSchema({
  id: { type: 'INT64' },
  kind: { type: 'UTF8' }, // 'heartbeat' | 'command_send_failed' | 'command_not_confirmed'
  payload: { type: 'UTF8' },
  received_at: { type: 'INT64' },
});

function monthBounds(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid month key "${yearMonth}", expected YYYY-MM`);
  }
  return {
    start: Date.UTC(y, m - 1, 1),
    end: Date.UTC(y, m, 1),
  };
}

function previousMonthKey(refDate = new Date()) {
  const prev = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function archiveTable({ table, schema, monthKey }) {
  const { start, end } = monthBounds(monthKey);
  const rows = db
    .prepare(`SELECT * FROM ${table} WHERE received_at >= ? AND received_at < ? ORDER BY received_at ASC`)
    .all(start, end);

  if (rows.length === 0) {
    console.log(`[archive] ${table} ${monthKey}: no rows, nothing to do`);
    return 0;
  }

  fs.mkdirSync(config.archive.outDir, { recursive: true });
  const outFile = path.join(config.archive.outDir, `${table}_${monthKey}.parquet`);

  const writer = await parquet.ParquetWriter.openFile(schema, outFile);
  try {
    for (const row of rows) {
      await writer.appendRow(row);
    }
  } finally {
    await writer.close();
  }

  console.log(`[archive] ${table} ${monthKey}: wrote ${rows.length} rows -> ${outFile}`);

  // Only delete after the Parquet file is fully written and closed.
  const ids = rows.map((r) => r.id);
  const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const deleteAll = db.transaction((idList) => {
    for (const id of idList) del.run(id);
  });
  deleteAll(ids);

  return rows.length;
}

async function run(monthKeyArg) {
  const monthKey = monthKeyArg || previousMonthKey();
  console.log(`[archive] archiving month ${monthKey}`);

  await archiveTable({ table: 'nodesensor_history', schema: nodesensorSchema, monthKey });
  await archiveTable({ table: 'status_history', schema: statusSchema, monthKey });

  console.log('[archive] done');
}

if (require.main === module) {
  run(process.argv[2])
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[archive] failed:', err);
      process.exit(1);
    });
}

module.exports = { run };
