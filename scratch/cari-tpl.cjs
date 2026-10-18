// Cari `${` di dalam blok template literal CDP.
const fs = require('fs');
const s = fs.readFileSync('scripts/verify-ikon-folder.mjs', 'utf8').split(/\r?\n/);
let dalam = false;
const pola = '$' + '{';
for (let i = 0; i < s.length; i++) {
  if (/cdp\.json\(/.test(s[i])) dalam = true;
  if (dalam && s[i].includes(pola)) console.log((i + 1) + ': ' + s[i].trim());
  if (dalam && /^`,$/.test(s[i].trim())) dalam = false;
}
