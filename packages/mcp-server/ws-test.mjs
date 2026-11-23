import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] || 47815);
const wss = new WebSocketServer({ port });
wss.on('connection', (ws) => {
  console.log('client connected on', port);
  ws.on('message', (d) => {
    const s = (Array.isArray(d) ? Buffer.concat(d) : Buffer.from(d)).toString();
    if (s.startsWith('{')) {
      const msg = JSON.parse(s);
      if (msg.type === 'request') {
        ws.send(
          JSON.stringify({
            type: 'response',
            id: msg.id,
            ok: true,
            data: { pong: true },
          }),
        );
      }
    }
  });
});
console.log('ws server on', port);
