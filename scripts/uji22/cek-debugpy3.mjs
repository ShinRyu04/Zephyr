// The launch request never answers, even though `python -m debugpy --listen`
// works. This isolates the DAP sequence: does launch need configurationDone
// first, or does it fail on the payload shape?
import { spawn } from 'node:child_process';

const VARIANTS = [
  { nama: 'launch langsung setelah initialized', pre: [] },
  { nama: 'configurationDone lalu launch', pre: ['configurationDone'] },
  { nama: 'setExceptionBreakpoints+configurationDone lalu launch', pre: ['setExceptionBreakpoints', 'configurationDone'] },
];

async function coba(v) {
  const anak = spawn('python', ['-m', 'debugpy.adapter'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: 'D:/Zephyr' });
  let buf = Buffer.alloc(0);
  let seq = 1;
  const pending = new Map();
  const log = [];

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
        log.push('EV ' + msg.event);
      }
    }
  });
  anak.stderr.on('data', (d) => log.push('ERR ' + d.toString().split('\n')[0].slice(0, 120)));

  const send = (command, a, ms) => {
    const s = seq++;
    const body = JSON.stringify({ seq: s, type: 'request', command, arguments: a });
    return new Promise((res) => {
      pending.set(s, res);
      anak.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      setTimeout(() => { if (pending.has(s)) { pending.delete(s); res({ TIMEOUT: true }); } }, ms);
    });
  };

  const init = await send('initialize', { clientID: 'zephyr', clientName: 'Zephyr', adapterID: 'python', locale: 'en-us', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path' }, 10000);
  const ev = JSON.stringify({ seq: seq++, type: 'event', event: 'initialized', params: {} });
  anak.stdin.write(`Content-Length: ${Buffer.byteLength(ev)}\r\n\r\n${ev}`);
  await new Promise((r) => setTimeout(r, 500));

  for (const cmd of v.pre) {
    const a = cmd === 'setExceptionBreakpoints' ? { filters: [] } : {};
    await send(cmd, a, 6000);
  }

  const l = await send('launch', { name: 'Uji Python', type: 'python', request: 'launch', program: 'D:/Zephyr/scripts/uji22/python-uji.py', cwd: 'D:/Zephyr', stopOnEntry: false }, 20000);
  const hasil = l.TIMEOUT ? 'TIMEOUT' : l.success ? 'OK' : `FAIL ${(l.message || '').slice(0, 70)}`;
  anak.kill();
  return `${v.nama} -> ${hasil} | event: ${log.filter((x) => x.startsWith('EV')).slice(0, 6).join(',')}`;
}

for (const v of VARIANTS) {
  console.log(await coba(v));
  await new Promise((r) => setTimeout(r, 600));
}
process.exit(0);
