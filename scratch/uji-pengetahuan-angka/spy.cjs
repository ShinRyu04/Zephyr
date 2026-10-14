/* spy jaringan uji-pengetahuan-angka.mjs - dipasang lewat node --require */
const daftar = [];
globalThis.__JARINGAN = daftar;
const bungkus = (obj, nama) => {
  if (!obj || typeof obj[nama] !== 'function') return;
  const asli = obj[nama];
  obj[nama] = function (...a) { daftar.push(nama); return asli.apply(this, a); };
};
bungkus(globalThis, 'fetch');
bungkus(globalThis, 'WebSocket');
bungkus(globalThis, 'XMLHttpRequest');
for (const nama of ['http', 'https', 'net', 'dns', 'tls', 'http2']) {
  try {
    const m = require('node:' + nama);
    bungkus(m, 'request'); bungkus(m, 'get'); bungkus(m, 'connect');
    bungkus(m, 'createConnection'); bungkus(m, 'lookup'); bungkus(m, 'resolve');
    bungkus(m.promises, 'lookup'); bungkus(m.promises, 'resolve');
    if (m.Socket && m.Socket.prototype) bungkus(m.Socket.prototype, 'connect');
  } catch { /* modul tidak ada di node ini */ }
}
