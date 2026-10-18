// Cari backtick ganjil di dalam blok CDP.
const fs = require('fs');
const s = fs.readFileSync('scripts/verify-ikon-folder.mjs', 'utf8').split(/\r?\n/);
let dalam = false;
for (let i = 0; i < s.length; i++) {
  const baris = s[i];
  if (/cdp\.json\(/.test(baris)) dalam = true;
  if (dalam) {
    const n = (baris.match(/`/g) ?? []).length;
    if (n > 0) console.log((i + 1) + ' [' + n + ']: ' + baris.trim());
  }
  if (dalam && /^`,$/.test(baris.trim())) dalam = false;
}
