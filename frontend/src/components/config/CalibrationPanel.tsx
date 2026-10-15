import { useState } from 'react';
import { Card } from '../common/Card';
import { useNodes } from '../../context/NodesContext';
import { ALL_NODE_IDS, RELAY_NODE_IDS } from '../../types';

type CalibrationFormValues = {
  rawDistanceAt0PctMm: string;
  rawDistanceAt100PctMm: string;
};

const EMPTY_FORM_VALUES: CalibrationFormValues = {
  rawDistanceAt0PctMm: '',
  rawDistanceAt100PctMm: '',
};

function nodeLabel(nodeId: number): string {
  const kind = (RELAY_NODE_IDS as readonly number[]).includes(nodeId) ? 'Relay' : 'Sensor LoRa';
  return `Node ${nodeId} (${kind})`;
}

export function CalibrationPanel() {
  const { calibrations, latest, saveCalibration } = useNodes();
  const [formByNode, setFormByNode] = useState<Record<number, CalibrationFormValues>>({});
  const [errorByNode, setErrorByNode] = useState<Record<number, string>>({});
  const [savingNodeId, setSavingNodeId] = useState<number | null>(null);

  // Form value falls back to the stored calibration until the user types.
  // After a successful save the context re-renders with the new values,
  // so the inputs keep showing what was just saved.
  function formValuesFor(nodeId: number): CalibrationFormValues {
    const edited = formByNode[nodeId];
    if (edited) return edited;
    const stored = calibrations[nodeId];
    return stored
      ? {
          rawDistanceAt0PctMm: String(stored.raw_distance_at_0_pct_mm),
          rawDistanceAt100PctMm: String(stored.raw_distance_at_100_pct_mm),
        }
      : EMPTY_FORM_VALUES;
  }

  function setFormValue(nodeId: number, field: keyof CalibrationFormValues, value: string) {
    setFormByNode((prev) => ({
      ...prev,
      [nodeId]: { ...formValuesFor(nodeId), [field]: value },
    }));
  }

  function rawDistanceNow(nodeId: number): number | null {
    const reading = latest[nodeId];
    if (!reading) return null;
    if (reading.source === 'sensor') return reading.water_distance_mm;
    return reading.distance_mm;
  }

  async function handleSave(nodeId: number) {
    const form = formValuesFor(nodeId);
    const rawDistanceAt0PctMm = Number(form.rawDistanceAt0PctMm);
    const rawDistanceAt100PctMm = Number(form.rawDistanceAt100PctMm);

    if (
      !Number.isInteger(rawDistanceAt0PctMm) ||
      !Number.isInteger(rawDistanceAt100PctMm) ||
      rawDistanceAt0PctMm < 0 ||
      rawDistanceAt0PctMm > 65535 ||
      rawDistanceAt100PctMm < 0 ||
      rawDistanceAt100PctMm > 65535
    ) {
      setErrorByNode((prev) => ({ ...prev, [nodeId]: 'Nilai harus bilangan bulat 0–65535' }));
      return;
    }
    if (rawDistanceAt0PctMm <= rawDistanceAt100PctMm) {
      setErrorByNode((prev) => ({
        ...prev,
        [nodeId]: 'Nilai 0% (tangki kosong) harus lebih besar dari nilai 100% (tangki penuh)',
      }));
      return;
    }

    setSavingNodeId(nodeId);
    setErrorByNode((prev) => ({ ...prev, [nodeId]: '' }));
    try {
      await saveCalibration(nodeId, { raw_distance_at_0_pct_mm: rawDistanceAt0PctMm, raw_distance_at_100_pct_mm: rawDistanceAt100PctMm });
      setFormByNode((prev) => ({ ...prev, [nodeId]: EMPTY_FORM_VALUES }));
    } catch (err) {
      setErrorByNode((prev) => ({
        ...prev,
        [nodeId]: err instanceof Error ? err.message : 'Gagal menyimpan kalibrasi',
      }));
    } finally {
      setSavingNodeId(null);
    }
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Kalibrasi Level Air</h2>
        <p className="text-sm text-ink-faint">
          Masukkan jarak mentah (mm) saat tangki kosong (0%) dan penuh (100%) untuk setiap node.
          Level air % = (nilai 0% − jarak mentah) / (nilai 0% − nilai 100%) × 100.
        </p>
      </div>

      <div className="space-y-4">
        {ALL_NODE_IDS.map((nodeId) => {
          const form = formValuesFor(nodeId);
          const stored = calibrations[nodeId];
          const currentRaw = rawDistanceNow(nodeId);
          const saving = savingNodeId === nodeId;
          const error = errorByNode[nodeId];

          return (
            <div key={nodeId} className="rounded-3xl bg-canvas p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{nodeLabel(nodeId)}</p>
                  <p className="text-xs text-ink-faint">
                    {currentRaw !== null
                      ? `Jarak mentah saat ini: ${currentRaw} mm`
                      : 'Belum ada data masuk'}
                  </p>
                </div>
                {stored ? (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-ok-soft text-ok font-medium">
                    Terkalibrasi
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-warn-soft text-warn font-medium">
                    Belum dikalibrasi
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-ink-faint">Nilai 0% (mm — tangki kosong)</span>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    inputMode="numeric"
                    value={form.rawDistanceAt0PctMm}
                    onChange={(e) => setFormValue(nodeId, 'rawDistanceAt0PctMm', e.target.value)}
                    placeholder={stored ? String(stored.raw_distance_at_0_pct_mm) : 'mis. 950'}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-ink-faint">Nilai 100% (mm — tangki penuh)</span>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    inputMode="numeric"
                    value={form.rawDistanceAt100PctMm}
                    onChange={(e) => setFormValue(nodeId, 'rawDistanceAt100PctMm', e.target.value)}
                    placeholder={stored ? String(stored.raw_distance_at_100_pct_mm) : 'mis. 120'}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </label>
              </div>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(nodeId)}
                  className="rounded-2xl bg-ok px-4 py-2 text-sm font-semibold text-white transition hover:bg-ok-dark disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : 'Simpan Kalibrasi'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
