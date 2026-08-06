const { WebSocketServer } = require('ws');

let wss = null;
const clients = new Set();

// Attaches a WS server to the same HTTP server Express is using (one port,
// path /ws), so the frontend doesn't need a second port/CORS story for it.
function initHub(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    clients.add(socket);
    console.log(`[ws] client connected (${clients.size} total)`);

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        // Echo heartbeat frames back to client
        if (msg.type === '__heartbeat__') {
          socket.send(JSON.stringify({ type: '__heartbeat__' }));
        }
      } catch (err) {
        // Silently ignore invalid JSON on heartbeat handler
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[ws] client disconnected (${clients.size} total)`);
    });
    socket.on('error', (err) => console.error('[ws] socket error:', err.message));
  });

  return wss;
}

// Message shape sent to clients: { type, data, ts }
// Types currently emitted: 'nodesensor' | 'heartbeat' | 'command_update' | 'status_event'
function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(msg);
  }
}

module.exports = { initHub, broadcast };