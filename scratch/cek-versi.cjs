// Cek versi terkunci di ketiga tempat yang harus sama.
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const t = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const c = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargo = (c.match(/^version = "(.+)"$/m) ?? [])[1];

console.log('package.json     :', p.version);
console.log('tauri.conf.json  :', t.version);
console.log('Cargo.toml       :', cargo);
console.log('ketiganya sama   :', p.version === t.version && p.version === cargo ? 'YA' : 'TIDAK');
console.log('target rilis     : 1.1.14');
console.log('sesuai target    :', p.version === '1.1.14' ? 'YA' : 'TIDAK');
