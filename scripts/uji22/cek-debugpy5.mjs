// Dump EVERY frame the adapter sends after `launch`, without filtering, so a
// mismatched or unexpected response shape cannot hide the answer.
import { spawn } from 'node:child_process';

const anak = spawn('python', ['-m', 'debugpy.adapter'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek' });
let buf = Buffer.alloc(0);
let seq = 1;

const frames = [];

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
    frames.push(body);
  }
});
anak.stderr.on('data', (d) => frames.push('STDERR:' + d.toString().split('\n').slice(0, 2).join(' / ').slice(0, 200)));

function kirim(command, args) {
  const s = seq++;
  const body = JSON.stringify({ seq: s, type: 'request', command, arguments: args });
  anak.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  return s;
}

kirim('initialize', { clientID: 'zephyr', clientName: 'Zephyr', adapterID: 'python', locale: 'en-us', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path' });
await new Promise((r) => setTimeout(r, 800));
const evi = JSON.stringify({ seq: seq++, type: 'event', event: 'initialized', params: {} });
anak.stdin.write(`Content-Length: ${Buffer.byteLength(evi)}\r\n\r\n${evi}`);
await new Promise((r) => setTimeout(r, 500));

const launchSeq = kirim('launch', { name: 'Uji', type: 'python', request: 'launch', program: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py', cwd: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek', stopOnEntry: false });
console.log('launch dikirim dengan seq', launchSeq);
await new Promise((r) => setTimeout(r, 12000));

console.log('--- semua frame (' + frames.length + ') ---');
for (const f of frames) {
  if (f.startsWith('STDERR:')) { console.log(f); continue; }
  try {
    const j = JSON.parse(f);
    const ringkas = j.type === 'response'
      ? `response cmd=${j.command} seq=${j.request_seq} ok=${j.success}`
      : j.type === 'event' ? `event ${j.event}` : j.type;
    console.log(ringkas + ' ' + JSON.stringify(j.body || j.message || {}).slice(0, 160));
  } catch {
    console.log('RAW ' + f.slice(0, 160));
  }
}
anak.kill();
process.exit(0);
