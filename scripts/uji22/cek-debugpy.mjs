// Narrows down why debugpy's `launch` never answers: the pre-launch
// setBreakpoints failure, the frozen-modules warning on Python 3.11, or
// something in the launch payload itself.
import { spawn } from 'node:child_process';

const SKENARIO = [
  { nama: 'tanpa -X, launch saja', args: ['-m', 'debugpy.adapter'],中間: false },
  { nama: 'tanpa -X, dengan setBreakpoints', args: ['-m', 'debugpy.adapter'],中間: true },
  { nama: '-Xfrozen_modules=off, launch saja', args: ['-Xfrozen_modules=off', '-m', 'debugpy.adapter'],中間: false },
  { nama: '-Xfrozen_modules=off, dengan setBreakpoints', args: ['-Xfrozen_modules=off', '-m', 'debugpy.adapter'],中間: true },
];

async function coba({ nama, args,中間 }) {
  const anak = spawn('python', args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: 'D:/Zephyr' });
  let buf = Buffer.alloc(0);
  let seq = 1;
  const pending = new Map();
  let inisialised = false;

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
      } else if (msg.type === 'event' && msg.event === 'initialized') {
        inisialised = true;
      }
    }
  });

  const send = (command, a, ms = 15000) => {
    const s = seq++;
    const body = JSON.stringify({ seq: s, type: 'request', command, arguments: a });
    return new Promise((res) => {
      pending.set(s, res);
      anak.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      setTimeout(() => { if (pending.has(s)) { pending.delete(s); res({ TIMEOUT: true }); } }, ms);
    });
  };

  const init = await send('initialize', {
    clientID: 'zephyr', clientName: 'Zephyr', adapterID: 'python',
    locale: 'en-us', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path',
  });
  if (init.TIMEOUT) { anak.kill(); return `${nama}: initialize TIMEOUT`; }
  const ev = JSON.stringify({ seq: seq++, type: 'event', event: 'initialized', params: {} });
  anak.stdin.write(`Content-Length: ${Buffer.byteLength(ev)}\r\n\r\n${ev}`);
  await new Promise((r) => setTimeout(r, 400));

  let bp = 'skip';
  if (中間) {
    const b = await send('setBreakpoints', {
      source: { path: 'D:/Zephyr/scripts/uji22/python-uji.py' },
      breakpoints: [{ line: 1 }],
    }, 6000);
    bp = b.TIMEOUT ? 'TIMEOUT' : b.success ? 'OK' : 'FAIL';
  }

  const l = await send('launch', {
    name: 'Uji Python', type: 'python', request: 'launch',
    program: 'D:/Zephyr/scripts/uji22/python-uji.py',
    cwd: 'D:/Zephyr', stopOnEntry: false,
  });
  anak.kill();
  const hasil = l.TIMEOUT ? 'launch TIMEOUT' : l.success ? 'launch OK' : `launch FAIL ${(l.message || JSON.stringify(l.body || '')).slice(0, 60)}`;
  return `${nama}: init=${init.success ? 'OK' : 'FAIL'} bp=${bp} ${hasil}`;
}

for (const s of SKENARIO) {
  console.log(await coba(s));
  await new Promise((r) => setTimeout(r, 700));
}
process.exit(0);
