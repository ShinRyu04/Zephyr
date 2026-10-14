/**
 * uji-aturan-tool.mjs - bukti aturan izin per-tool dievaluasi dengan benar.
 *
 * Kenapa ini penting: ini GERBANG KEAMANAN. Aturan yang salah arah berarti
 * perintah berbahaya jalan tanpa konfirmasi, atau perintah jinak terus-menerus
 * mengganggu. Dua hal yang paling mudah salah:
 *
 *   1. URUTAN. Aturan pertama yang cocok menang. Sebuah `deny` di BAWAH `allow`
 *      yang cocok tidak akan pernah menyala.
 *   2. REGEX RUSAK. Kalau pola yang salah ketik dianggap "cocok semua", sebuah
 *      `allow` yang typo akan menyetujui setiap panggilan tool itu. Harus
 *      dianggap cocok TIDAK ADA.
 *
 * Yang diuji:
 *   1. aturan pertama yang cocok menang, bukan yang paling spesifik
 *   2. regex rusak cocok tidak ada (fail closed)
 *   3. `*` cocok semua tool; nama persis case-sensitive
 *   4. pola kosong = aturan seluruh-tool
 *   5. tanpa aturan cocok -> `confirm` (jatuh ke mode persetujuan biasa)
 *   6. `bash_background` diperlakukan sebagai `bash_run` untuk aturan
 *   7. aturan yang disabled dilewati
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-aturan-tool.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('aturan izin per-tool');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

function kompilasi(rules) {
  return rules.map((rule) => {
    const pola = (rule.match ?? '').trim();
    if (!pola) return { rule, rusak: false, rx: null, semua: true };
    try {
      return { rule, rusak: false, rx: new RegExp(pola, 'i'), semua: false };
    } catch {
      return { rule, rusak: true, rx: null, semua: false };
    }
  });
}

function teksArgumen(args) {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args);
  } catch {
    return '';
  }
}

function evaluasiAturan(rules, tool, args) {
  if (!rules || rules.length === 0) return { action: 'confirm', rule: null };
  const teks = teksArgumen(args);
  for (const { rule, rusak, rx, semua } of kompilasi(rules)) {
    if (rule.enabled === false) continue;
    if (rule.tool !== '*' && rule.tool !== tool) continue;
    if (semua) return { action: rule.action, rule };
    if (rusak || !rx) continue;
    if (rx.test(teks)) return { action: rule.action, rule };
  }
  return { action: 'confirm', rule: null };
}

function namaUntukAturan(tool) {
  return tool === 'bash_background' || tool === 'bash_kill' || tool === 'bash_logs'
    ? 'bash_run'
    : tool;
}

const mk = (id, tool, match, action, extra = {}) => ({ id, tool, match, action, ...extra });

/* ── 1. Urutan: yang PERTAMA menang ───────────────────────────────────── */

const urutan = [
  mk('a', 'bash_run', 'cargo\\s+(test|clippy)', 'allow'),
  mk('b', 'bash_run', 'cargo', 'confirm'),
];
const u1 = evaluasiAturan(urutan, 'bash_run', { command: 'cargo test --lib' });
R.check('A1', u1.action === 'allow' && u1.rule.id === 'a', `allow menang karena di atas (${u1.action}/${u1.rule?.id})`);

/* Dibalik: confirm sekarang menang. Inilah arti "first match wins". */
const dibalik = [urutan[1], urutan[0]];
const u2 = evaluasiAturan(dibalik, 'bash_run', { command: 'cargo test --lib' });
R.check('A2', u2.action === 'confirm' && u2.rule.id === 'b', `dibalik, confirm menang (${u2.action}/${u2.rule?.id})`);

/*
 * `deny` di BAWAH `allow` yang cocok TIDAK menyala. Ini keputusan desain yang
 * disengaja, dan uji ini mengunci perilakunya supaya tidak berubah diam-diam.
 */
const denyBawah = [
  mk('a', '*', '', 'allow'),
  mk('z', 'bash_run', 'rm\\s+-rf', 'deny'),
];
const u3 = evaluasiAturan(denyBawah, 'bash_run', { command: 'rm -rf /' });
R.check('A3', u3.action === 'allow', `deny di bawah allow tidak menyala (${u3.action}) - perilaku terkunci`);

/* `deny` di ATAS menyala. */
const denyAtas = [denyBawah[1], denyBawah[0]];
const u4 = evaluasiAturan(denyAtas, 'bash_run', { command: 'rm -rf /' });
R.check('A4', u4.action === 'deny', `deny di atas menyala (${u4.action})`);

/* ── 2. Regex rusak = cocok TIDAK ADA (fail closed) ───────────────────── */

const rusak = [mk('x', 'bash_run', '([unclosed', 'allow')];
const u5 = evaluasiAturan(rusak, 'bash_run', { command: 'apa saja' });
R.check('A5', u5.action === 'confirm' && u5.rule === null, `regex rusak TIDAK menyetujui apa pun (${u5.action})`);

/* Dan aturan berikutnya masih dievaluasi setelah yang rusak. */
const rusakLaluBenar = [mk('x', 'bash_run', '([unclosed', 'deny'), mk('y', 'bash_run', 'cargo', 'allow')];
const u6 = evaluasiAturan(rusakLaluBenar, 'bash_run', { command: 'cargo test' });
R.check('A6', u6.action === 'allow' && u6.rule.id === 'y', `aturan setelah yang rusak tetap dievaluasi (${u6.action}/${u6.rule?.id})`);

/* ── 3. Wildcard dan case-sensitivity ─────────────────────────────────── */

const wild = [mk('w', '*', 'cargo', 'allow')];
R.check('A7', evaluasiAturan(wild, 'bash_run', { command: 'cargo build' }).action === 'allow', '`*` cocok tool apa pun');
R.check('A8', evaluasiAturan(wild, 'grep', { pattern: 'cargo' }).action === 'allow', '`*` cocok juga di tool lain');

/*
 * Nama tool Case-SENSITIVE. Kalau longgar, aturan untuk `grep` akan menyala
 * pada tool bernama lain yang kebetulan beda huruf besar-kecil.
 */
const cs = [mk('c', 'grep', '', 'allow')];
R.check('A9', evaluasiAturan(cs, 'grep', {}).action === 'allow', 'nama persis cocok');
R.check('A10', evaluasiAturan(cs, 'Grep', {}).action === 'confirm', 'nama beda huruf besar-kecil TIDAK cocok');

/* ── 4. Pola kosong = seluruh tool ────────────────────────────────────── */

const seluruh = [mk('s', 'write_file', '', 'deny')];
const u11 = evaluasiAturan(seluruh, 'write_file', { path: 'a.txt', content: 'x' });
R.check('A11', u11.action === 'deny', `pola kosong menolak semua argumen (${u11.action})`);

/* ── 5. Tidak ada yang cocok -> confirm ───────────────────────────────── */

R.check('A12', evaluasiAturan([], 'grep', {}).action === 'confirm', 'daftar kosong -> confirm');
R.check('A13', evaluasiAturan(undefined, 'grep', {}).action === 'confirm', 'undefined -> confirm');
R.check('A14', evaluasiAturan([mk('q', 'bash_run', 'cargo', 'allow')], 'grep', {}).action === 'confirm', 'tool lain -> confirm');

/* ── 6. bash_background diperlakukan sebagai bash_run ─────────────────── */

R.check('A15', namaUntukAturan('bash_background') === 'bash_run', 'bash_background -> bash_run');
R.check('A16', namaUntukAturan('bash_logs') === 'bash_run', 'bash_logs -> bash_run');
R.check('A17', namaUntukAturan('bash_kill') === 'bash_run', 'bash_kill -> bash_run');
R.check('A18', namaUntukAturan('grep') === 'grep', 'tool lain tidak diubah');

/*
 * Artinya: satu aturan "jangan tanya untuk cargo test" berlaku di kedua
 * transport shell. Pembaca menulis aturan tentang PERINTAH, bukan tentang
 * tool mana yang menjalankannya.
 */
const duaTransport = [mk('t', 'bash_run', 'cargo\\s+test', 'allow')];
R.check(
  'A19',
  evaluasiAturan(duaTransport, namaUntukAturan('bash_background'), { command: 'cargo test' }).action === 'allow',
  'satu aturan berlaku untuk bash_run DAN bash_background',
);

/* ── 7. Disabled dilewati ─────────────────────────────────────────────── */

const mati = [mk('d', 'bash_run', 'cargo', 'allow', { enabled: false }), mk('e', 'bash_run', 'cargo', 'deny')];
const u20 = evaluasiAturan(mati, 'bash_run', { command: 'cargo test' });
R.check('A20', u20.action === 'deny' && u20.rule.id === 'e', `aturan disabled dilewati (${u20.action}/${u20.rule?.id})`);

/* ── 8. Argumen non-objek tetap bisa dicocokkan ───────────────────────── */

R.check('A21', teksArgumen('cargo test') === 'cargo test', 'string diteruskan apa adanya');
R.check('A22', teksArgumen({ a: 1 }).includes('"a"'), 'objek di-JSON-kan');
R.check('A23', teksArgumen(null) === '', 'null -> string kosong');
R.check('A24', teksArgumen(undefined) === '', 'undefined -> string kosong');

/* ── 9. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/toolRules.ts', 'utf8');
  } catch {
    return '';
  }
})();
/*
 * The symbol is deliberately NOT exported — `evaluasiUntukPanggilan` is the
 * public entry point, and un-exporting the inner one keeps the module's surface
 * honest. So this checks that it EXISTS, not that it is exported; asserting on
 * `export` would fail the moment someone tidied the API, which is the opposite
 * of what the check is for.
 */
R.check('A25', /function evaluasiAturan\(/.test(src), 'evaluasiAturan ada di sumber');
R.check('A26', /rusak: true/.test(src), 'regex rusak ditandai, bukan dianggap cocok');
R.check('A27', /rule\.enabled === false/.test(src), 'aturan disabled dilewati di sumber');
R.check('A28', /rule\.tool !== '\*' && rule\.tool !== tool/.test(src), 'wildcard + nama persis di sumber');

console.log('\n  catatan: aturan di atas mencerminkan src/lib/toolRules.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
