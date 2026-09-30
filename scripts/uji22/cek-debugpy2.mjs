// Single run against debugpy with the full stderr kept, so the launch
// timeout can be read from the adapter's own log instead of guessed at.
import { spawn } from 'node:child_process';

const anak = spawn('python', ['-m', 'debugpy.adapter'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: 'D:/Zephyr' });
let buf = Buffer.alloc(0);
let seq = 1;
const pending = new Map();
const semuaErr = [];

anak.stdout.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const he = buf.indexOf('\r\n\r\n');
    if (he < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, he).toString('ascii'));
    if (!m) return;
    const len = Number(m[1]);
    if (buf.length < he + 4 + len) return;
    const body = buf.slice(he + 4, he + 4 + len).toString('utf8');
    buf = buf.slice(he + 4 + len);
    let msg;
    try { msg = JSON.parse(body); } catch { continue; }
    if (msg.type === 'response' && pending.has(msg.request_seq)) {
      const p = pending.get(msg.request_seq);
      pending.delete(msg.request_seq);
      p(msg);
    }
    if (msg.type === 'event') semuaErr.push('EVENT ' + msg.event + ' ' + JSON.stringify(msg.body || {}).slice(0, 200));
  }
});
anak.stderr.on('data', (d) => semuaErr.push('[stderr] ' + d.toString()));

const send = (command, a, ms) => {
  const s = seq++;
  const body = JSON.stringify({ seq: s, type: 'request', command, arguments: a });
  return new Promise((res) => {
    pending.set(s, res);
    anak.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    setTimeout(() => { if (pending.has(s)) { pending.delete(s); res({ TIMEOUT: true }); } }, ms);
  });
};

await send('initialize', { clientID: 'zephyr', clientName: 'Zephyr', adapterID: 'python', locale: 'en-us', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path' }, 10000);
const ev = JSON.stringify({ seq: seq++, type: 'event', event: 'initialized', params: {} });
anak.stdin.write(`Content-Length: ${Buffer.byteLength(ev)}\r\n\r\n${ev}`);
await new Promise((r) => setTimeout(r, 400));

const l = await send('launch', { name: 'Uji Python', type: 'python', request: 'launch', program: 'D:/Zephyr/scripts/uji22/python-uji.py', cwd: 'D:/Zephyr', stopOnEntry: false }, 25000);
console.log('HASIL LAUNCH:', l.TIMEOUT ? 'TIMEOUT' : JSON.stringify(l).slice(0, 300));
console.log('--- stderr + event dari adapter ---');
console.log(semuaErr.join('\n').slice(0, 3000));
anak.kill();
process.exit(0);
