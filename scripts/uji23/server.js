// Fixture server for verify23 V4: an isBackground task that prints
// "listening on http://localhost:8123" so deteksi_port in tasks.rs picks up
// 8123 and PortsStore creates the Ports entry automatically.
// Intent: the process stays alive so V5 can prove the port really serves
// HTTP 200 before it is stopped.

import { createServer } from 'node:http';

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('uji23\n');
});

server.on('error', (err) => {
  console.log('gagal listen: ' + err.message);
});

server.listen(8123, '127.0.0.1', () => {
  console.log('listening on http://localhost:8123');
});

setInterval(() => {}, 1 << 30);
