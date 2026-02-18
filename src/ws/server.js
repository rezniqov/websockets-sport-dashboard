import { WebSocket, WebSocketServer } from 'ws';

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

   wss.on('connection', (socket) => {
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
