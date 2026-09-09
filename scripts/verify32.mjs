// verify32.mjs — verifikasi sandbox ekstensi (shim CommonJS + vscode).
//
// Pakai:  node scripts/verify32.mjs   (murni unit test — app tidak perlu jalan)
//
// Latar: bundle ekstensi dari marketplace (Open VSX) adalah keluaran
// esbuild/rollup untuk Node — berisi `module.exports`, `exports`, dan
// `require("vscode")`. Dijalankan mentah di Web Worker sandbox, itu meledak
// dengan "Uncaught ReferenceError: module is not defined". Runner sandbox
// (src/lib/extRunner.ts) menyediakan shim CommonJS + API vscode minimal
// sehingga bundle bisa dimuat; modul sistem (fs/child_process/...) melempar
// error yang jelas kalau benar-benar dipakai.
//
// V1 exports.activate + zephyr.registerCommand → command terdaftar
// V2 module.exports = { activate } + vscode.commands.registerCommand → terdaftar
// V3 require("vscode") + window.showInformationMessage → notify info ke app
// V4 require("fs") yang dipakai → error JELAS (bukan ReferenceError)
// V5 require() modul tak dikenal → error JELAS (bukan ReferenceError)

import { skripEkstensi } from '../src/lib/extRunner.ts';

/** Jalankan skrip seolah-olah di Worker (fake self/postMessage). */
function jalankan(script) {
  const messages = [];
  const self = { postMessage: (m) => messages.push(m) };
  const fn = new Function('self', 'setTimeout', 'console', script);
  fn(self, setTimeout, console);
  return messages;
}

const ringkas = (msgs) =>
  msgs.map((m) => {
    if (m.type === 'register') return `register:${m.id}`;
    if (m.type === 'notify') return `notify[${m.severity}]:${m.message}`;
    return JSON.stringify(m);
  });

let gagal = 0;
const cek = (nama, kond, detail) => {
  console.log(`${kond ? 'PASS' : 'FAIL'}  ${nama}${kond ? '' : '  → ' + detail}`);
  if (!kond) gagal++;
};

// V1
let m = jalankan(
  skripEkstensi(`exports.activate = function (ctx) { zephyr.registerCommand('test.hello', 'Hello', function () { return 'hi'; }); };`),
);
cek(
  'V1 exports.activate + zephyr.registerCommand → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'test.hello'),
  ringkas(m),
);

// V2
m = jalankan(
  skripEkstensi(`module.exports = { activate: function (ctx) { vscode.commands.registerCommand('a.b', function () { return 42; }); } };`),
);
cek(
  'V2 module.exports.activate + vscode.commands → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'a.b'),
  ringkas(m),
);

// V3
m = jalankan(skripEkstensi(`const v = require('vscode'); v.window.showInformationMessage('hai dunia');`));
cek(
  'V3 require("vscode") + showInformationMessage → notify info',
  m.some((x) => x.type === 'notify' && x.severity === 'info' && x.message === 'hai dunia'),
  ringkas(m),
);

// V4 — modul sistem yang dipakai harus error JELAS, bukan ReferenceError.
m = jalankan(skripEkstensi(`const fs = require('fs'); fs.readFileSync('x');`));
cek(
  'V4 require("fs") dipakai → error jelas (tertahan, bukan ReferenceError)',
  m.some((x) => x.type === 'notify' && /fs\.readFileSync tidak didukung/.test(x.message)),
  ringkas(m),
);

// V4b — pola graceful-fs: klone objek fs (getOwnPropertyNames + Object.assign)
// dan intip fs.realpath.native saat load. Dengan fs berupa objek nyata,
// klon punya realpath → tidak crash "reading 'native'" (kasus
// vscjava.vscode-java-dependency).
m = jalankan(
  skripEkstensi(`const fs = require('fs');
// tiruan graceful-fs/fs-extra
const klon = {};
Object.getOwnPropertyNames(fs).forEach((k) => { klon[k] = fs[k]; });
Object.assign(klon, fs);
if (typeof klon.realpath.native === 'function') {
  klon.realpath.native = function () { return 'ok'; };
}
module.exports = { activate: function (ctx) {
  vscode.commands.registerCommand('gfs.load', function () { return 'gfs-ok'; });
} };`),
);
cek(
  'V4b graceful-fs (klone fs + realpath.native) dimuat tanpa crash',
  m.some((x) => x.type === 'register' && x.id === 'gfs.load') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V5 — modul tak dikenal: require saja TIDAK gagal (stub), baru error saat
// dipakai. Tidak ada "module is not defined".
m = jalankan(skripEkstensi(`const x = require('pkg-tidak-ada');`));
cek(
  'V5 require() modul tak dikenal saja → diam (stub)',
  m.length === 0,
  ringkas(m),
);
m = jalankan(skripEkstensi(`const x = require('pkg-tidak-ada'); x.halo();`));
cek(
  'V5b modul tak dikenal DIPAKAI → error jelas',
  m.some((x) => x.type === 'notify' && /tidak didukung di sandbox/.test(x.message)),
  ringkas(m),
);

// V5c — vscode.window.createOutputChannel tersedia (dipakai ekstensi LSP
// saat aktivasi, mis. meta.pyrefly).
m = jalankan(skripEkstensi(`exports.activate = function (ctx) {
  const ch = vscode.window.createOutputChannel('pyrefly');
  ch.appendLine('halo');
  vscode.commands.registerCommand('x.test', function () { return 1; });
};`));
cek(
  'V5c createOutputChannel tersedia saat aktivasi → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'x.test'),
  ringkas(m),
);

// V5d — require("constants") (node builtin) tersedia (dipakai
// ms-python.python saat load).
m = jalankan(skripEkstensi(`const c = require('constants'); exports.activate = function () { if (c.O_RDONLY === 0) vscode.commands.registerCommand('y.z', function () {}); };`));
cek(
  'V5d require("constants") tersedia → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'y.z'),
  ringkas(m),
);

// V5e — kode CJS polos tidak boleh meledak dengan ReferenceError apa pun.
m = jalankan(skripEkstensi(`module.exports = { ok: true };`));
cek(
  'V5e kode CJS polos dimuat tanpa ReferenceError',
  m.length === 0,
  ringkas(m),
);

// V6 — require RELATIF antar file ekstensi (mis. main yang memuat
// './dist/extension.bundle' seperti vscjava.vscode-java-dependency).
// Main ada di dist/main.js → require('./lib/helper') menyelesaikan relatif ke
// dist/ (semantik Node), jadi file-nya dist/lib/helper.js.
const FILES = {
  'dist/lib/helper.js': `module.exports = { fn: function () { return 'dari helper'; } };`,
  'dist/config.json': `{ "x": 7 }`,
};
m = jalankan(
  skripEkstensi(
    `const dep = require('./lib/helper');
     const cfg = require('./config.json');
     module.exports = { activate: function (ctx) {
       vscode.commands.registerCommand('rel.hello', function () { return dep.fn() + ':' + cfg.x; });
     } };`,
    FILES,
    'dist/main.js',
  ),
);
cek(
  'V6 require("./lib/helper") + require("./config.json") relatif → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'rel.hello') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V6b — require relatif dari SIBLING file (nested require): helper.js sendiri
// require('./helper2') — membuktikan __dirname ikut mengikuti file pemanggil.
m = jalankan(
  skripEkstensi(
    `const dep = require('./lib/helper');
     module.exports = { activate: function (ctx) {
       vscode.commands.registerCommand('rel.nested', function () { return dep.dalam(); });
     } };`,
    {
      'lib/helper.js': `const dalam = require('./helper2'); module.exports = { dalam: function () { return dalam.nilai(); } };`,
      'lib/helper2.js': `module.exports = { nilai: function () { return 'nested-ok'; } };`,
    },
    'main.js',
  ),
);
cek(
  'V6b require relatif bertingkat (sibling memuat sibling) → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'rel.nested') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V6c — require relatif file yang TIDAK ADA → error jelas tertahan,
// bukan "module is not defined".
m = jalankan(
  skripEkstensi(`require('./tidak-ada');`, { 'ada.js': 'x' }, 'main.js'),
);
cek(
  'V6c require relatif file hilang → error jelas "tidak ditemukan"',
  m.some((x) => x.type === 'notify' && /tidak ditemukan di dalam ekstensi/.test(x.message)),
  ringkas(m),
);

// V7 — kelas vscode NYATA: `class X extends vscode.CompletionItem` harus bisa
// dimuat (kasus ms-python.python: "Class extends value undefined").
m = jalankan(
  skripEkstensi(`const v = require('vscode');
class Item extends v.CompletionItem {
  constructor(label) { super(label, v.CompletionItemKind.Function); this.data = 1; }
}
class T extends v.TreeItem { constructor(l) { super(l, v.TreeItemCollapsibleState.Collapsed); } }
module.exports = { activate: function (ctx) {
  const it = new Item('halo');
  const t = new T('node');
  if (it.kind !== v.CompletionItemKind.Function) throw new Error('kind salah');
  vscode.commands.registerCommand('cls.ok', function () { return it.label + t.label; });
} };`),
);
cek(
  'V7 class extends vscode.CompletionItem/TreeItem → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'cls.ok') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V8 — Buffer global tersedia & berfungsi (kasus meta.pyrefly: "Buffer is
// not defined").
m = jalankan(
  skripEkstensi(`const b = Buffer.from('halo');
const b64 = Buffer.from(b.toString('base64'), 'base64');
const buf = require('buffer');
module.exports = { activate: function (ctx) {
  if (b.toString('utf8') !== 'halo') throw new Error('buffer salah');
  if (b64.toString('utf8') !== 'halo') throw new Error('base64 salah');
  if (!buf.Buffer.isBuffer(b)) throw new Error('isBuffer salah');
  vscode.commands.registerCommand('buf.ok', function () { return b.length; });
} };`),
);
cek(
  'V8 Buffer global + require("buffer") → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'buf.ok') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V9 — setImmediate/clearImmediate tersedia (kasus
// vscjava.vscode-java-dependency: "setImmediate is not defined").
m = jalankan(
  skripEkstensi(`module.exports = { activate: function (ctx) {
  let jalan = false;
  setImmediate(function () { jalan = true; });
  const id = setImmediate(function () {});
  clearImmediate(id);
  vscode.commands.registerCommand('imm.ok', function () { return jalan; });
} };`),
);
cek(
  'V9 setImmediate/clearImmediate tersedia → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'imm.ok') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

// V10 — require('events').EventEmitter nyata: subclass + on/emit jalan
// (banyak ekstensi men-subclass EventEmitter).
m = jalankan(
  skripEkstensi(`const { EventEmitter } = require('events');
class Em extends EventEmitter {}
module.exports = { activate: function (ctx) {
  const e = new Em();
  let d = '';
  e.on('x', function (v) { d = v; });
  e.emit('x', 'ok');
  if (d !== 'ok') throw new Error('event tidak jalan');
  vscode.commands.registerCommand('ev.ok', function () { return d; });
} };`),
);
cek(
  'V10 class extends require("events").EventEmitter → command terdaftar',
  m.some((x) => x.type === 'register' && x.id === 'ev.ok') &&
    !m.some((x) => x.type === 'notify'),
  ringkas(m),
);

console.log(gagal === 0 ? '\nSemua lulus.' : `\n${gagal} gagal.`);
process.exit(gagal ? 1 : 0);