import { WebSocket, WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
  wss.clients.forEach((client) => {
    sendJson(client, payload);
  });
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

  wss.on('connection', async (socket, req) => {
    socket.on('upgrade', async (req, socket, head) => {
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);

      if (pathname !== '/ws') {
        return;
      }

      if (wsArcjet) {
        try {
          const decision = await wsArcjet.protect(req);

          if (decision.isDenied()) {
            const isRateLimit = decision.reason.isRateLimit();
            const code = isRateLimit ? 1013 : 1008;
            const reason = isRateLimit ? 'Rate limit exceeded' : 'Access denied';

            socket.close(code, reason);
            return;
          }
        } catch (error) {
          console.error('WS connection error', error);
          socket.close(1011, 'Server security error');
          return;
        }
      }
    });

    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    sendJson(socket, { type: 'welcome' });

    socket.on('error', console.error);
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  function broadcastMatchCreated(match) {
    try {
      broadcast(wss, { type: 'match_created', data: match });
    } catch (error) {
      console.error('Error broadcasting match created:', error);
    }
  }

  return {
    broadcastMatchCreated,
  };
}
