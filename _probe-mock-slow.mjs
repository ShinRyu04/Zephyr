// Uji langsung ke mock: apakah token SLOW benar-benar datang ~400ms terpisah?
// Tanpa app, tanpa browser - hanya ukur waktu kedatangan tiap event SSE.
import { spawn } from 'node:child_process';

const PORT = 8098;
const child = spawn(process.execPath, ['scripts/mock-ai.mjs', String(PORT)], {
  cwd: 'D:/Zephyr',
  stdio: 'ignore',
  detached: false,
});
await new Promise((r) => setTimeout(r, 700));

const t0 = Date.now();
const res = await fetch(`http://127.0.0.1:${PORT}/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': 'K' },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'sapa saya SLOW' }] }],
  }),
});
console.log('status', res.status, 'ctype', res.headers.get('content-type'));
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
const jejak = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const blok = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const m = /data: (.*)/.exec(blok);
    if (m) {
      let teks = '';
      try {
        const j = JSON.parse(m[1]);
        teks = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      } catch {}
      jejak.push({ t: Date.now() - t0, teks });
    }
  }
}
console.log('total event:', jejak.length);
console.log('jejak (ms, teks):');
console.log(jejak.map((e) => `${e.t}:${JSON.stringify(e.teks)}`).join(' | '));
const jarak = jejak.slice(1).map((e, i) => e.t - jejak[i].t);
console.log('jarak antar event (ms):', jarak.join(', '));
console.log('total teks:', jejak.map((e) => e.teks).join('').length, 'char');
child.kill();
process.exit(0);
