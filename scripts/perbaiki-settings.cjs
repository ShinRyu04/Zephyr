/*
 * Perbaiki settings.json: path proyek sebelumnya rusak karena `\a` dan `\t`
 * diterjemahkan jadi karakter kontrol oleh shell heredoc. Skrip ini menulis
 * ulang dengan path yang benar, memakai JSON.stringify sehingga backslash
 * tetap utuh.
 */
const fs = require('fs');
const path = require('path');

const p = path.join(process.env.APPDATA, 'zephyr', 'settings.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

// Path nyata: D:\DevEnv\www\<nama>
const akar = 'D:\\DevEnv\\www';
j.devenv.projects = [
  {
    nama: 'api-service',
    path: akar + '\\api-service',
    php: 'global',
    node: 'global',
    url: 'http://api-service.test',
    composer: true,
    package: true,
  },
  {
    nama: 'toko-online',
    path: akar + '\\toko-online',
    php: 'global',
    node: 'global',
    url: 'http://toko-online.test',
    composer: true,
    package: true,
  },
];

fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');

console.log('  ✅ path proyek diperbaiki');
console.log('');
for (const x of j.devenv.projects) {
  const ada = fs.existsSync(x.path);
  console.log(`    ${ada ? '✅' : '❌'} ${x.nama}`);
  console.log(`       path : ${x.path}`);
  console.log(`       url  : ${x.url}`);
}
