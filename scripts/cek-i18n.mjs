import fs from 'fs';
const files = ['src/lib/i18n.ts', 'src/lib/i18n-extra.ts'];
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const heads = [...s.matchAll(/const\s+([A-Z]{2,3})\s*(?::\s*[A-Za-z<>, ]+)?\s*=\s*\{/g)];
  const dicts = {};
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : s.length;
    const body = s.slice(start, end);
    const keys = new Map();
    const kre = /(?:^|\n)\s{2}(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:/g;
    let m;
    while ((m = kre.exec(body))) {
      const k = m[1] ?? m[2];
      keys.set(k, (keys.get(k) || 0) + 1);
    }
    dicts[heads[i][1]] = keys;
  }
  const en = dicts.EN;
  /* Kamus EN adalah acuan paritas: satu kunci yang tidak ada di EN jatuh ke
     kunci mentahnya (`translate` berakhir `?? key`), jadi pengguna EN melihat
     teks kunci itu apa adanya - Indonesia bila kuncinya berbahasa Indonesia.
     Kalau kamus EN tidak ketemu, tidak ada acuan: itu bukan "0 galat". */
  if (!en) {
    console.log(`TIDAK BERLAKU: kamus EN tidak ketemu di ${f} (pola 'const EN ... = {' tidak cocok).`);
    process.exit(2);
  }
  console.log(`\n== ${f} == EN keys: ${en.size}`);
  for (const n of Object.keys(dicts)) {
    const d = dicts[n];
    const dups = [...d].filter(([, c]) => c > 1).map(([k]) => k);
    const missing = [...en.keys()].filter((k) => !d.has(k));
    const extra = [...d.keys()].filter((k) => !en.has(k));
    const flag = missing.length || extra.length || dups.length ? ' <-- ISSUE' : '';
    console.log(`  ${n} size=${d.size} missing=${missing.length} extra=${extra.length} dups=${dups.length}${flag}`);
    if (missing.length) { console.log('     MISSING:', missing.slice(0, 8)); bad++; }
    if (extra.length) { console.log('     EXTRA:', extra.slice(0, 8)); bad++; }
    if (dups.length) { console.log('     DUPS:', dups.slice(0, 8)); bad++; }
  }
}
process.exit(bad ? 1 : 0);
