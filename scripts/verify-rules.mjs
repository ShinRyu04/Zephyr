/*
 * Verifikasi mesin aturan.
 *
 * Dijalankan TANPA app hidup: `esbuild` mengubah modul TypeScript menjadi satu
 * berkas sementara, lalu Node mengimpornya. Alasannya bukan kepraktisan - mesin
 * aturan adalah fungsi murni atas teks, dan mengujinya lewat UI hanya menambah
 * lapisan yang bisa gagal sendiri tanpa menambah bukti apa pun.
 *
 * Setiap aturan diuji DUA ARAH, dan arah kedua yang penting:
 *
 *   1. contoh POSITIF - pola yang harus ditangkap, beserta nomor barisnya
 *   2. contoh NEGATIF - teks yang mirip tetapi SAH, yang tidak boleh ditangkap
 *
 * Aturan yang menangkap segalanya lebih buruk daripada tidak ada aturan: ia
 * memblokir tulisan yang benar dan membuat orang mematikan seluruh mesinnya.
 * Karena itu jumlah contoh negatif sengaja dibuat banyak.
 *
 * Uji juga menolak katalog yang KOSONG - detektor yang melaporkan "semua aman"
 * karena tidak memuat apa pun harus dicurigai lebih dulu daripada kodenya.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sementara = path.join(os.tmpdir(), `zephyr-rules-${Date.now()}.mjs`);

await build({
  entryPoints: ['src/lib/rulesEngine.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: sementara,
  logLevel: 'silent',
});

const eng = await import('file://' + sementara.replace(/\\/g, '/'));
const { compileRules, checkText, shouldBlock, blockMessage, bahasaDariPath } = eng;

/* Katalog dibaca dari sumbernya, bukan disalin ke sini. Uji yang menyalin daftar
   tetap lulus saat katalognya berubah - ia mengunci kesalahan, bukan mencegahnya. */
const katalogTeks = fs.readFileSync('src/lib/rulesCatalog.ts', 'utf8');
const modulKatalog = path.join(os.tmpdir(), `zephyr-catalog-${Date.now()}.mjs`);
await build({
  entryPoints: ['src/lib/rulesCatalog.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: modulKatalog,
  logLevel: 'silent',
});
const { RULES_BAWAAN } = await import('file://' + modulKatalog.replace(/\\/g, '/'));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

console.log('== Mesin aturan ==\n');

const rules = compileRules(RULES_BAWAAN);
cek('katalog memuat aturan', rules.length >= 10, rules.length + ' aturan dari ' + RULES_BAWAAN.length + ' definisi');
cek('setiap definisi bisa dikompilasi', rules.length === RULES_BAWAAN.length,
  (RULES_BAWAAN.length - rules.length) + ' gagal');

/* Nol-discovery: kalau katalog tidak terbaca, berhenti dengan pesan jelas
   daripada melaporkan "semua aman" dan lulus palsu. */
if (!rules.length || rules.length !== RULES_BAWAAN.length) {
  console.log('\nBERHENTI: katalog tidak utuh - hasil berikutnya tidak bermakna.');
  fs.rmSync(sementara, { force: true });
  fs.rmSync(modulKatalog, { force: true });
  process.exit(1);
}

/* --- Setiap aturan: satu contoh positif, satu contoh negatif --- */
/* Kolom `lolos` = teks SAH yang tidak boleh ditangkap. Ini daftar yang paling
   berharga; tiap entri di sini berasal dari pola yang benar-benar pernah salah. */
const KASUS = {
  'hardcoded-secret': {
    positif: { bahasa: 'typescript', teks: 'const api_key = "sk-live-9f3a2b7c1d4e";' },
    lolos: [
      { bahasa: 'typescript', teks: 'const apiKey = process.env.API_KEY;' },
      { bahasa: 'typescript', teks: 'const token = import.meta.env.VITE_TOKEN;' },
      { bahasa: 'python', teks: 'token = os.environ["TOKEN"]' },
      { bahasa: 'typescript', teks: 'password: "your-password-here"' },
    ],
  },
  'ts-any': {
    positif: { bahasa: 'typescript', teks: 'function f(x: any) { return x; }' },
    lolos: [
      { bahasa: 'typescript', teks: 'function f(x: unknown) { return x; }' },
      { bahasa: 'typescript', teks: 'const anyOf = [1, 2];' },
    ],
  },
  'empty-catch': {
    positif: { bahasa: 'typescript', teks: 'try { risky(); } catch {}' },
    lolos: [
      { bahasa: 'typescript', teks: 'try { risky(); } catch (e) { log(e); }' },
    ],
  },
  'react-index-key': {
    positif: { bahasa: 'typescript', teks: 'items.map((it, i) => <Row key={i} />)' },
    lolos: [
      { bahasa: 'typescript', teks: 'items.map((it) => <Row key={it.id} />)' },
    ],
  },
  'dangerous-inner-html': {
    positif: { bahasa: 'typescript', teks: '<div dangerouslySetInnerHTML={{ __html: s }} />' },
    lolos: [
      { bahasa: 'typescript', teks: '<div>{text}</div>' },
    ],
  },
  'eval-call': {
    positif: { bahasa: 'typescript', teks: 'const v = eval(userInput);' },
    lolos: [
      { bahasa: 'typescript', teks: 'const v = JSON.parse(userInput);' },
      { bahasa: 'python', teks: 'value = ast.literal_eval(raw)' },
    ],
  },
  'destructive-rm': {
    positif: { bahasa: 'shell', teks: 'rm -rf /' },
    lolos: [
      { bahasa: 'shell', teks: 'rm -rf ./node_modules' },
      { bahasa: 'shell', teks: 'rm -f cache.json' },
    ],
  },
  'rust-unwrap': {
    positif: { bahasa: 'rust', teks: 'let v = map.get("k").unwrap();' },
    lolos: [
      { bahasa: 'rust', teks: 'let v = map.get("k").expect("config missing");' },
      { bahasa: 'rust', teks: 'let v = map.get("k").unwrap_or_default();' },
    ],
  },
  'python-bare-except': {
    positif: { bahasa: 'python', teks: 'try:\n    risky()\nexcept:\n    pass' },
    lolos: [
      { bahasa: 'python', teks: 'try:\n    risky()\nexcept ValueError:\n    log(e)' },
    ],
  },
  'leftover-console-log': {
    positif: { bahasa: 'typescript', teks: 'console.log("debug", nilai);' },
    lolos: [
      { bahasa: 'typescript', teks: 'logger.info("started");' },
    ],
  },
  'sql-string-concat': {
    positif: { bahasa: 'typescript', teks: 'const q = "SELECT * FROM users WHERE id = " + id;' },
    lolos: [
      { bahasa: 'typescript', teks: 'db.query("SELECT * FROM users WHERE id = ?", [id]);' },
    ],
  },
  'insecure-random-secret': {
    positif: { bahasa: 'typescript', teks: 'const sessionToken = Math.random().toString(36);' },
    lolos: [
      { bahasa: 'typescript', teks: 'const sessionToken = crypto.randomUUID();' },
    ],
  },
  'debugger-statement': {
    positif: { bahasa: 'typescript', teks: 'debugger;' },
    lolos: [
      { bahasa: 'typescript', teks: 'const debuggerName = "x";' },
    ],
  },
  'todo-without-owner': {
    positif: { bahasa: 'typescript', teks: '// TODO perbaiki ini' },
    lolos: [
      { bahasa: 'typescript', teks: '// TODO(alice): perbaiki ini' },
    ],
  },
};

console.log('\n-- setiap aturan menangkap contoh positifnya, tepat di barisnya --');
for (const rule of rules) {
  const kasus = KASUS[rule.id];
  const nama = 'rule ' + rule.id;
  if (!kasus) {
    cek(nama + ' punya contoh uji', false, 'TIDAK ADA kasus untuk aturan ini');
    continue;
  }
  const { bahasa, teks } = kasus.positif;
  /*
   * Tempel di baris 3 supaya nomor baris benar-benar diuji.
   *
   * Harapannya DIHITUNG dari teksnya, bukan dipaku ke 3: contoh multi-baris
   * (seperti `try/except`) menaruh polanya di baris kelima, dan uji yang
   * menuntut baris 3 melaporkan gagal pada mesin yang benar. Versi pertama
   * skrip ini melakukan tepat kesalahan itu.
   */
  const PREFIX = ['// pembuka', ''];
  /*
   * Harapan baris dihitung dari TEKSNYA, bukan dipaku.
   *
   * Untuk teks satu baris, polanya ada di baris pertama sesudah awalan. Untuk
   * teks multi-baris, polanya ada di baris pertama yang MEMUAT polanya - dan itu
   * harus dicari, bukan ditebak dari bentuk teksnya. Versi sebelumnya menebak
   * dengan "baris pertama yang bukan try:", dan karena `risky()` juga bukan
   * `try:`, ia mengharapkan baris 4 padahal `except:` ada di baris 5.
   */
  const barisTeks = teks.split('\n');
  let harap;
  if (barisTeks.length === 1) {
    harap = PREFIX.length + 1;
  } else {
    const polaUji = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
    const idx = barisTeks.findIndex((b) => polaUji.test(b));
    harap = PREFIX.length + (idx >= 0 ? idx : 0) + 1;
  }
  const berlapis = [...PREFIX, teks].join('\n');
  const temuan = checkText(berlapis, bahasa, rules).filter((f) => f.ruleId === rule.id);
  cek(nama, temuan.length > 0, temuan.length ? 'baris ' + temuan[0].baris : 'TIDAK tertangkap');
  if (temuan.length) cek(nama + ' barisnya benar', temuan[0].baris === harap, 'dapat ' + temuan[0].baris + ', harap ' + harap);
}

console.log('\n-- setiap aturan MELEWATKAN teks yang sah --');
for (const rule of rules) {
  const kasus = KASUS[rule.id];
  if (!kasus) continue;
  for (const [i, neg] of kasus.lolos.entries()) {
    const temuan = checkText(neg.teks, neg.bahasa, rules).filter((f) => f.ruleId === rule.id);
    cek(rule.id + ' lolos-contoh-' + (i + 1), temuan.length === 0,
      temuan.length ? 'SALAH TANGKAP: ' + temuan[0].cuplikan.slice(0, 50) : 'bersih');
  }
}

console.log('\n-- katalognya sendiri --');
cek('katalog tidak berisi pola yang gagal dikompilasi',
  RULES_BAWAAN.every((d) => eng.compileRule(d) !== null),
  RULES_BAWAAN.filter((d) => eng.compileRule(d) === null).map((d) => d.id).join(',') || 'semua sah');

cek('pola rusak dikembalikan null, bukan dilempar',
  eng.compileRule({ id: 'x', severity: 'warn', pattern: '([unclosed', pesan: 'x' }) === null);
cek('severity tak dikenal ditolak',
  eng.compileRule({ id: 'y', severity: 'fatal', pattern: 'a', pesan: 'x' }) === null);

console.log('\n-- keputusan menulis --');
const blok = checkText('const api_key = "sk-live-9f3a2b7c1d4e";', 'typescript', rules);
cek('rahasia keras MEMBLOKIR tulisan', shouldBlock(blok) === true, 'temuan=' + blok.length);
cek('pesan blokir menyebut baris dan aturan',
  /line 1/.test(blockMessage(blok)) && /hardcoded-secret/.test(blockMessage(blok)),
  blockMessage(blok).slice(0, 70));

const peringatan = checkText('function f(x: any) { return x; }', 'typescript', rules);
cek('peringatan saja TIDAK memblokir', shouldBlock(peringatan) === false, 'severity=' + peringatan.map((f) => f.severity).join(','));
cek('kode bersih tidak menghasilkan temuan',
  checkText('export const tambah = (a: number, b: number) => a + b;', 'typescript', rules).length === 0);

console.log('\n-- bahasa --');
cek('bahasa dari path .tsx', bahasaDariPath('src/App.tsx') === 'typescript', bahasaDariPath('src/App.tsx'));
cek('bahasa dari path .py', bahasaDariPath('a/b/c.py') === 'python', bahasaDariPath('a/b/c.py'));
cek('aturan khusus bahasa tidak jalan di bahasa lain',
  checkText('let v = x.unwrap();', 'typescript', rules).filter((f) => f.ruleId === 'rust-unwrap').length === 0);

fs.rmSync(sementara, { force: true });
fs.rmSync(modulKatalog, { force: true });

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
process.exit(lulus === total ? 0 : 1);
