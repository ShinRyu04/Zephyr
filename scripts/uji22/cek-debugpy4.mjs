// Isolates the launch timeout: does it depend on cwd, on the program, or on
// stopOnEntry? The adapter binds its sockets but never answers `launch`.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('C:/Users/home/AppData/Local/Temp/opencode/dbgcek', { recursive: true });
writeFileSync(
  'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py',
  'import time\nprint("hello uji22", flush=True)\ntime.sleep(30)\n',
  'utf8',
);

const VARIANTS = [
  { nama: 'program kecil, cwd=D:/Zephyr', program: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py', cwd: 'D:/Zephyr', stopOnEntry: false },
  { nama: 'program kecil, cwd=temp', program: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py', cwd: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek', stopOnEntry: false },
  { nama: 'program kecil, cwd=temp, stopOnEntry', program: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py', cwd: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek', stopOnEntry: true },
  { nama: 'pakai console=internal', program: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek/hello.py', cwd: 'C:/Users/home/AppData/Local/Temp/opencode/dbgcek', stopOnEntry: false, console: 'internalConsole' },
];

async function coba(v) {
  const anak = spawn('python', ['-m', 'debugpy.adapter'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: v.cwd });
  let buf = Buffer.alloc(0);
  let seq = 1;
  const pending = new Map();
  const ev = [];

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
      } else if (msg.type === 'event') {
        ev.push(msg.event);
      }
    }
  });
  anak.stderr.on('data', (d) => {
    const s = d.toString();
    if (!s.includes('frozen modules')) ev.push('ERR:' + s.split('\n')[0].slice(0, 90));
  });

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
  const evi = JSON.stringify({ seq: seq++, type: 'event', event: 'initialized', params: {} });
  anak.stdin.write(`Content-Length: ${Buffer.byteLength(evi)}\r\n\r\n${evi}`);
  await new Promise((r) => setTimeout(r, 500));

  const args = { name: 'Uji', type: 'python', request: 'launch', program: v.program, cwd: v.cwd, stopOnEntry: v.stopOnEntry };
  if (v.console) args.console = v.console;
  const l = await send('launch', args, 20000);
  await send('configurationDone', {}, 4000);
  const hasil = l.TIMEOUT ? 'TIMEOUT' : l.success ? 'OK' : `FAIL ${(l.message || '').slice(0, 70)}`;
  anak.kill();
  return `${v.nama} -> ${hasil} | event: ${ev.slice(0, 8).join(',')}`;
}

for (const v of VARIANTS) {
  console.log(await coba(v));
  await new Promise((r) => setTimeout(r, 600));
}
process.exit(0);
