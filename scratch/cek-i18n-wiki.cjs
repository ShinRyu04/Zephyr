// Periksa bahwa kunci i18n baru ada di kesepuluh kamus.
const fs = require('fs');
const s = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const KUNCI = [
  'Repo Wiki',
  'Knowledge Card',
  'Generate Your Repo Wiki',
  'Outline',
  'Timeline',
  'Create With Plan',
];
let gagal = 0;
for (const k of KUNCI) {
  const pola = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':", 'g');
  const n = (s.match(pola) ?? []).length;
  const ok = n >= 10;
  if (!ok) gagal++;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${k}: ${n} kamus`);
}
process.exit(gagal ? 1 : 0);
