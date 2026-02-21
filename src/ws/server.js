import { WebSocket, WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }

  matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return;

  subscribers.delete(socket);

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

function cleanSubscribtions(socket) {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
  wss.clients.forEach((client) => {
    sendJson(client, payload);
  });
}

function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers || !subscribers.size === 0) return;

  subscribers.forEach((socket) => {
    sendJson(socket, payload);
  });
}

function handleMessage(socket, data) {
  let message;

  try {
    message = JSON.parse(data.toString());
  } catch (e) {
    sendJson(socket, { type: 'error', message: 'Invalid JSON' });
  }

  const matchId = message?.matchId;
  const messageType = message?.type;
  const isValidMatchId = Number.isSafeInteger(matchId);

  if (messageType === 'subscribe' && isValidMatchId) {
    subscribe(matchId, socket);
    socket.subscriptions.add(matchId);
    sendJson(socket, { type: 'subscribed', matchId: matchId });
    return;
  }

  if (messageType === 'unsubscribe' && isValidMatchId) {
    unsubscribe(matchId, socket);
    socket.subscriptions.delete(matchId);
    sendJson(socket, { type: 'unsubscribed', matchId: matchId });
    return;
  }
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true, path: '/ws', maxPayload: 1024 * 1024 });
  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    if (pathname !== '/ws') {
      return;
    }

    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);

        if (decision.isDenied()) {
          if (decision.reason.isRateLimit()) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
          } else {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          }
          socket.destroy();
          return;
        }
      } catch (e) {
        console.error('WS upgrade protection error', e);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (socket, req) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.subscriptions = new Set();

    sendJson(socket, { type: 'welcome' });

    socket.on('message', (data) => handleMessage(socket, data));

    socket.on('error', () => {
      socket.terminate();
    });

    socket.on('close', () => {
      cleanSubscribtions(socket);
    });

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
      broadcastToAll(wss, { type: 'match_created', data: match });
    } catch (error) {
      console.error('Error broadcasting match created:', error);
    }
  }

  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, { type: 'commentary', data: comment });
  }

  return {
    broadcastMatchCreated,
    broadcastCommentary,
  };
}
