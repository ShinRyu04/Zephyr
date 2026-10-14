import { writeFileSync } from 'node:fs';
import { FAKTA_INDEKS } from 'D:/Zephyr/src/lib/zephyrIndeks';
import { suntikanIndeks, kepalaSuntikanIndeks, jumlahEntri, versiFakta, petaIndeks } from 'D:/Zephyr/src/lib/zephyrCari';
const kepala = kepalaSuntikanIndeks();
const meta = 'Index ' + jumlahEntri() + ' entries, app ' + versiFakta().aplikasi + ', source hash ' + versiFakta().hashSumber + ' | categories: ' + petaIndeks();
const kandidat = FAKTA_INDEKS.map((e) => e[1]).filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k)).slice(0, 60);
const k0 = kandidat[0];
const blok1200 = suntikanIndeks(k0);
const blok300 = suntikanIndeks(k0, { batasKarakter: 300 });
const semua = kandidat.map((k) => suntikanIndeks(k));
writeFileSync(process.env.PROBE_KELUAR, JSON.stringify({
  kepalaLen: kepala.length, metaLen: meta.length, wajib2: kepala.length + meta.length + 2,
  kepala, meta,
  k0, blok1200Len: blok1200.length, blok300Len: blok300.length,
  maksTotal: Math.max(...semua.map((t) => t.length)),
  maksMetered: Math.max(...semua.map((t) => { const b = String(t).split('\n'); const p = b[b.length-1] ?? ''; return String(t).length - p.length - 1; })),
  penutupChar: (() => { const b = String(blok1200).split('\n'); return (b[b.length-1] ?? '').length; })(),
  blok300Dump: blok300,
}, null, 2));