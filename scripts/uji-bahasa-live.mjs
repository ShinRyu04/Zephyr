/*
 * uji-bahasa-live.mjs — apa EFEK NYATA paket BAHASA/GRAMMAR bawaan?
 *
 * Dua mode dalam satu berkas:
 *
 *   (bawaan, tanpa argumen) ANALISIS STATIS CAKUPAN — tidak butuh aplikasi
 *   hidup, bisa jalan di CI. Menjawab: dari 88 paket bahasa yang ditawarkan
 *   katalog bawaan (src-tauri/src/ext_bundled.rs), mana yang benar-benar
 *   mengubah apa yang dilihat pemakai, dan mana yang cuma masuk daftar?
 *     1. daftar paket bahasa (id + nama + ekstensi + mode/grammar yang disebut);
 *     2. cocokkan ke sumber kebenaran bahasa native: `src/lib/cmLegacyModes.ts`
 *        (MODE_IMPORTER = allow-list mode legacy), `src/lib/lang.ts` (BY_EXT +
 *        grammar @codemirror/lang-* + mode legacy yang dipakai `build()`), dan
 *        `src/lib/extLoader.ts` (PAKET_DIIZINKAN);
 *     3. klasifikasi tiap paket: EFEKTIF / NO-OP / GAGAL;
 *     4. rekap angka + daftar nama paket NO-OP;
 *     5. exit 1 HANYA kalau ada paket yang menyebut mode tak ada di mana pun.
 *
 *   (`--live`) UJI CDP — butuh aplikasi hidup di :9223. Pertanyaan yang dijawab,
 *   dan yang tidak bisa dijawab `cargo test` atau `tsc`: setelah sebuah paket
 *   bahasa dipasang, apakah editornya benar-benar menghighlight, dan apakah
 *   berhenti menghighlight saat paketnya dicabut?
 *
 *   Sampai sekarang jawabannya BELUM BISA ya untuk jalur legacy, dan itu gagal
 *   senyap: `muatCmBahasa` merakit specifier
 *   `import('@codemirror/legacy-modes/mode/${legacyMode}')` pada saat jalan.
 *   Vite tidak me-rewrite specifier rakitan seperti itu, jadi setiap paket
 *   bahasa terpasang, tampil di daftar, dan tidak menghighlight apa pun - tanpa
 *   satu pun pesan. Lihat scripts/laporan-cakupan-bahasa.md.
 *
 *   Berkas uji `.mrc`: Zephyr bawaan tidak mengenal `.mrc` (`detectLang` ->
 *   plain), jadi satu-satunya sumber highlight yang mungkin adalah paketnya.
 *   Kontrolnya ada di dua sisi: sebelum dipasang DAN sesudah dicabut.
 *
 * IZIN: skrip ini READ-ONLY untuk src/** dan src-tauri/**. Ia hanya membaca.
 *
 * Pemakaian:  node scripts/uji-bahasa-live.mjs [--json] [--live] [--paket zephyr.lang-mirc]
 * Keluar kode 1 kalau ada paket bermode hantu (statis) atau highlight tidak
 * muncul/hilang sebagaimana mestinya (live).
 */
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const baca = (rel) => readFileSync(`${ROOT}/${rel}`, 'utf8');

// =====================================================================
// BAGIAN 1 — ANALISIS STATIS CAKUPAN
// =====================================================================

// ---------------------------------------------------------------- sumber data
const rs = baca('src-tauri/src/ext_bundled.rs');
const rsExtra = baca('src-tauri/src/ext_bundled_extra.rs');
const legacyTsc = baca('src/lib/cmLegacyModes.ts');
const langTsc = baca('src/lib/lang.ts');
const extLoaderTsc = baca('src/lib/extLoader.ts');
const pkg = JSON.parse(baca('package.json'));

const potongBlok = (teks, mulai, selesai) => {
  const a = teks.indexOf(mulai);
  if (a < 0) return '';
  const b = teks.indexOf(selesai, a);
  return teks.slice(a, b < 0 ? undefined : b);
};

// (1) manifest paket bahasa: `const LANG_X: &str = r##"{ ... }"##;`
const paketBahasa = [];
for (const m of rs.matchAll(/const (LANG_[A-Z0-9_]+)\s*:\s*&str\s*=\s*r##"([\s\S]*?)"##;/g)) {
  let j;
  try {
    j = JSON.parse(m[2]);
  } catch (e) {
    console.error(`manifest tak bisa di-parse: ${m[1]} — ${e.message}`);
    continue;
  }
  const c = j.contributes ?? {};
  const langs = Array.isArray(c.languages) ? c.languages : [];
  const exts = [];
  for (const l of langs) for (const e of l.extensions ?? []) exts.push(String(e).toLowerCase().replace(/^\./, ''));
  const grammars = Array.isArray(c.grammars) ? c.grammars : [];
  paketBahasa.push({
    id: String(j.id ?? m[1]),
    nama: String(j.name ?? ''),
    langId: langs[0]?.id ?? '',
    label: langs[0]?.label ?? '',
    banyakBahasa: langs.length,
    exts,
    legacyMode: langs[0]?.legacyMode ?? '',
    cmLang: langs[0]?.cmLang ?? '',
    grammarsTextmate: grammars.length,
  });
}

// urutan pemuatan = urutan di PAKET_BAHASA (yang lebih dulu menang atas ekstensi)
const urutan = [...potongBlok(rs, 'const PAKET_BAHASA', 'const PAKET:')
  .matchAll(/"zephyr\.lang-[a-z0-9.-]+"/g)].map((x) => x[0].slice(1, -1));
const bobot = (id) => {
  const i = urutan.indexOf(id);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};
paketBahasa.sort((a, b) => bobot(a.id) - bobot(b.id));

const paketNonBahasa = [
  ...potongBlok(rs, 'const PAKET: &[Paket] = &[', '\n];').matchAll(/"zephyr\.[a-z0-9.-]+"/g),
].length;
const extraLanguages = (rsExtra.match(/"languages":/g) ?? []).length;

// (2) sumber kebenaran bahasa native
const MODE_TERSEDIA = new Set(
  [...legacyTsc.matchAll(/^\s*'([a-z0-9.-]+)':\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]),
);

const BY_EXT = new Map();
for (const m of potongBlok(langTsc, 'const BY_EXT: Record<string, LangId> = {', '};')
  .matchAll(/^\s*([a-zA-Z0-9_]+):\s*'([a-z0-9]+)',?\s*$/gm)) {
  BY_EXT.set(m[1].toLowerCase(), m[2]);
}
const BY_NAME = new Map();
for (const m of potongBlok(langTsc, 'const BY_NAME: Record<string, LangId> = {', '};')
  .matchAll(/^\s*'?([\w.]+)'?:\s*'([a-z0-9]+)',?\s*$/gm)) {
  BY_NAME.set(m[1].toLowerCase(), m[2]);
}

const NATIVE_LANGS = new Set(
  [...potongBlok(langTsc, 'export const LANG_LABEL', '};').matchAll(/^\s*([a-z0-9]+):\s*'/gm)].map((m) => m[1]),
);
const MODE_DIPAKAI_NATIVE = new Set(
  [...langTsc.matchAll(/legacy-modes\/mode\/([a-z0-9.-]+)/g)].map((m) => m[1]),
);

// (3) jalur paket yang diizinkan loader (cmLang -> @codemirror/lang-*)
const PAKET_DIIZINKAN = new Set(
  [...extLoaderTsc.matchAll(/'(@codemirror\/lang-[a-z0-9-]+)':/g)].map((m) => m[1]),
);

const depsCmLang = Object.keys(pkg.dependencies ?? {}).filter((k) => k.startsWith('@codemirror/lang-'));
const depLegacyModes = (pkg.dependencies ?? {})['@codemirror/legacy-modes'] ?? null;

// grammarTersedia() — cermin dari src/lib/extLoader.ts
const grammarTersedia = (p) =>
  (p.cmLang && PAKET_DIIZINKAN.has(p.cmLang)) || (!!p.legacyMode && MODE_TERSEDIA.has(p.legacyMode));

// ------------------------------------------------------------------ klasifikasi
// Simulasi `extLangUntuk` (src/lib/lang.ts): ekstensi native menang, lalu paket
// pertama yang mengklaim sebuah ekstensi yang belum ada pemiliknya.
const diklaimPaket = new Map(); // ext -> id paket
for (const p of paketBahasa) {
  const extsNative = [];
  const extsDirebut = [];
  const extsBaru = [];
  for (const e of p.exts) {
    if (BY_EXT.has(e)) { extsNative.push(e); continue; }
    if (diklaimPaket.has(e)) { extsDirebut.push(`${e}<:${diklaimPaket.get(e)}`); continue; }
    diklaimPaket.set(e, p.id);
    extsBaru.push(e);
  }
  p.extsNative = extsNative;
  p.extsDirebut = extsDirebut;
  p.extsBaru = extsBaru;
  p.langNative = NATIVE_LANGS.has(p.langId);
  p.modeNative = MODE_DIPAKAI_NATIVE.has(p.legacyMode);
  p.grammarTersedia = grammarTersedia(p);

  if (p.grammarsTextmate > 0) {
    p.status = 'NO-OP';
    p.sebab = `menyumbang ${p.grammarsTextmate} grammar TextMate, tetapi Zephyr belum punya mesin TextMate — terpasang, nol efek`;
  } else if (!p.grammarTersedia) {
    p.status = 'GAGAL';
    p.sebab = `mode "${p.legacyMode || '-'}" tidak ada di MODE_TERSEDIA (cmLegacyModes.ts) maupun PAKET_DIIZINKAN (extLoader.ts)`;
  } else if (p.extsBaru.length > 0) {
    p.status = 'EFEKTIF';
    p.sebab = `menambah highlight untuk: ${p.extsBaru.map((e) => '.' + e).join(', ')}`;
  } else {
    p.status = 'NO-OP';
    const sebab = [];
    if (p.extsNative.length) sebab.push(`ekstensi sudah native (${p.extsNative.map((e) => '.' + e).join(', ')})`);
    if (p.extsDirebut.length) sebab.push(`ekstensi sudah dipegang paket lain (${p.extsDirebut.join(', ')})`);
    p.sebab = sebab.join('; ') || 'tidak menyumbang ekstensi apa pun';
  }
  if (p.status === 'EFEKTIF' && p.langNative) p.sebab += ` — CATATAN: bahasa "${p.langId}" sudah didukung bawaan`;
  if (p.status === 'EFEKTIF' && p.modeNative) p.sebab += ` — mode "${p.legacyMode}" juga dipakai bahasa bawaan`;
}

const modeDipakaiPaket = new Set(paketBahasa.map((p) => p.legacyMode));
const modeYatim = [...MODE_TERSEDIA].filter((m) => !modeDipakaiPaket.has(m)).sort();

// ------------------------------------------------------------------- rekap angka
const n = paketBahasa.length;
const hitung = (s) => paketBahasa.filter((p) => p.status === s).length;
const nEfektif = hitung('EFEKTIF');
const nNoop = hitung('NO-OP');
const nGagal = hitung('GAGAL');
const pct = (x) => ((x / n) * 100).toFixed(1);
const redundanNative = paketBahasa.filter((p) => p.langNative || p.modeNative);
const namaPendek = (id) => id.replace(/^zephyr\.lang-/, '');

console.log(`== uji bahasa: efek nyata ${n} paket bahasa bawaan ==\n`);

console.log('[a] daftar paket bahasa (src-tauri/src/ext_bundled.rs)');
console.log(`    ${n} paket bahasa  (+ ${paketNonBahasa} paket non-bahasa; extra languages: ${extraLanguages})`);
console.log(`    ${'id'.padEnd(34)} ${'bahasa'.padEnd(20)} ${'ekstensi'.padEnd(30)} mode`);
for (const p of paketBahasa) {
  const exts = p.exts.map((e) => '.' + e).join(',') || '-';
  const mode = p.cmLang ? `cmLang:${p.cmLang}` : p.legacyMode ? `legacy:${p.legacyMode}` : p.grammarsTextmate ? `textmate:${p.grammarsTextmate}` : '-';
  console.log(`    ${p.id.padEnd(34)} ${(p.label || p.langId).padEnd(20)} ${exts.padEnd(30)} ${mode}`);
}

console.log(`\n[b] sumber kebenaran bahasa native`);
console.log(`    cmLegacyModes.ts MODE_IMPORTER : ${MODE_TERSEDIA.size} mode legacy bisa dimuat`);
console.log(`    lang.ts BY_EXT (ekstensi)      : ${BY_EXT.size} ekstensi -> ${NATIVE_LANGS.size} bahasa native`);
console.log(`    lang.ts BY_NAME                : ${BY_NAME.size} nama berkas`);
console.log(`    lang.ts mode dipakai build()   : ${[...MODE_DIPAKAI_NATIVE].sort().join(', ')}`);
console.log(`    extLoader.ts PAKET_DIIZINKAN   : ${[...PAKET_DIIZINKAN].join(', ')}`);
console.log(`    package.json @codemirror/lang-*: ${depsCmLang.length} paket; legacy-modes: ${depLegacyModes ?? '-'}`);

console.log(`\n[c] klasifikasi`);
console.log(`    EFEKTIF : ${nEfektif} (${pct(nEfektif)}%)`);
console.log(`    NO-OP   : ${nNoop} (${pct(nNoop)}%)`);
console.log(`    GAGAL   : ${nGagal} (${pct(nGagal)}%)`);

console.log(`\n[d] rekap`);
console.log(`    total paket bahasa : ${n}`);
console.log(`    % efektif          : ${pct(nEfektif)}%`);
console.log(`    % no-op            : ${pct(nNoop)}%`);
console.log(`    mode yatim (ada di MODE_IMPORTER, tak dipakai paket): ${modeYatim.length}`);
console.log(`      ${modeYatim.join(', ')}`);

const daftarNoop = paketBahasa.filter((p) => p.status === 'NO-OP');
console.log(`\n    NAMA paket NO-OP (${daftarNoop.length}) — kandidat kalimat "sudah didukung bawaan"/"terpasang tetapi belum ada efek":`);
for (const p of daftarNoop) console.log(`      - ${namaPendek(p.id)} (${p.label || p.langId}) -> ${p.sebab}`);

console.log(`\n    paket yang bahasanya/modenya sudah native (${redundanNative.length}) — kandidat "sudah didukung bawaan":`);
for (const p of redundanNative) console.log(`      - ${namaPendek(p.id)} (${p.label || p.langId}) -> ${p.sebab}`);

if (nGagal) {
  console.log(`\n[e] GAGAL (mode tak ada di mana pun):`);
  for (const p of paketBahasa.filter((x) => x.status === 'GAGAL')) console.log(`      - ${p.id}: ${p.sebab}`);
} else {
  console.log(`\n[e] tidak ada paket bahasa bermode hantu — semua mode bisa dimuat (MODE_TERSEDIA/PAKET_DIIZINKAN).`);
}

console.log(`\n[temuan warna] paket bahasa TIDAK membawa warna. Lihat scripts/laporan-cakupan-bahasa.md.`);

if (process.argv.includes('--json')) {
  console.log('\n' + JSON.stringify({ n, nEfektif, nNoop, nGagal, modeYatim, paketBahasa }, null, 2));
}

// `--md` mencetak tabel markdown ke stdout supaya laporan bisa dibuat tanpa
// menulis berkas perantara (skill ini diizinkan membuat dua berkas saja).
if (process.argv.includes('--md')) {
  console.log('\n| paket | bahasa | mode | eks. baru | status | catatan |');
  console.log('|---|---|---|---|---|---|');
  for (const p of paketBahasa) {
    const mode = p.cmLang ? `cmLang:${p.cmLang}` : p.legacyMode ? `legacy:${p.legacyMode}` : p.grammarsTextmate ? `textmate:${p.grammarsTextmate}` : '-';
    const baru = p.extsBaru.map((e) => '.' + e).join(', ') || '—';
    console.log(`| \`${namaPendek(p.id)}\` | ${p.label || p.langId} | \`${mode}\` | ${baru} | **${p.status}** | ${p.sebab} |`);
  }
}

console.log(
  nGagal === 0
    ? `\nLULUS: ${n} paket bahasa diklasifikasikan; ${nEfektif} efektif (${pct(nEfektif)}%), ${nNoop} no-op, 0 gagal.`
    : `\nGAGAL: ${nGagal} paket bahasa menyebut mode yang tak bisa dimuat siapa pun.`,
);

if (process.argv.includes('--live')) {
  await live();
} else if (nGagal > 0) {
  process.exitCode = 1;
}

// =====================================================================
// BAGIAN 2 — UJI CDP LIVE (butuh aplikasi di :9223)
// =====================================================================
async function live() {

const PORT = 9223;
const BERKAS = 'D:/Zephyr/.uji-bahasa-live/coba-mirc.mrc';
const NAMA = 'coba-mirc.mrc';
const DIR = 'D:/Zephyr/.uji-bahasa-live';

const argPaket = process.argv.indexOf('--paket');
const PAKET = argPaket > 0 ? process.argv[argPaket + 1] : 'zephyr.lang-mirc';

const KONTEN = `; contoh skrip mIRC
on *:TEXT:*:#: {
  if ($nick == $me) { return }
  msg $chan Halo $nick dari $network
}
alias halo {
  echo -a $timestamp $+(Halo, dunia)
}
`;

mkdirSync(DIR, { recursive: true });
writeFileSync(BERKAS, KONTEN, 'utf8');

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const target = list.find((t) => /zephyr/i.test(t.title ?? '')) ?? list[0];
if (!target) {
  console.error(`tidak ada target CDP di port ${PORT} — jalankan aplikasinya dulu`);
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 1;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) =>
  new Promise((r) => { const id = seq++; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d.exception?.description ?? d.text ?? 'gagal mengevaluasi');
  }
  return r.result?.result?.value;
};
await send('Runtime.enable');

/*
 * Satu pengukuran = buka berkas dari nol, aktifkan tabnya, lalu hitung token di
 * DOM. Label status bar ikut dibaca: highlight yang jalan sementara labelnya
 * bilang "Plain Text" tetap salah, karena itu yang dilihat pemakai.
 */
const UKUR = `(async () => {
  const st = window.__ZEPHYR__.getState();
  st.setSettingsOpen(false);
  for (const t of st.tabs.filter((x) => x.name === ${JSON.stringify(NAMA)})) st.forceCloseTab(t.id);
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().openPath(${JSON.stringify(BERKAS)}, { preview: false });
  await new Promise((r) => setTimeout(r, 1400));
  const st2 = window.__ZEPHYR__.getState();
  const tab = st2.tabs.find((t) => t.name === ${JSON.stringify(NAMA)});
  if (!tab) throw new Error('tab tidak terbuka: ' + st2.statusMessage);
  st2.setActiveTab(tab.id);
  await new Promise((r) => setTimeout(r, 2000));
  const v = window.__ZEPHYR_CM__();
  const spans = [...document.querySelectorAll('.cm-content .cm-line span')];
  const kel = [...new Set(spans.map((s) => s.className))];
  const sb = [...document.querySelectorAll('.sb-item')].map((e) => e.textContent.trim());
  return JSON.stringify({
    tabLang: tab.lang,
    viewAda: !!v,
    baris: document.querySelectorAll('.cm-content .cm-line').length,
    spanToken: spans.length,
    kelasUnik: kel.length,
    labelStatusBar: sb.find((x) => /plain|mirc/i.test(x)) ?? null,
    contoh: spans.slice(0, 6).map((s) => s.textContent.slice(0, 14) + '::' + s.className),
  });
})()`;

const terpasangKode = (paket) => `(async () => {
  const before = window.__ZEPHYR_EXT19__.terpasang().some((m) => m.id === ${JSON.stringify(paket)});
  return before;
})()`;

const bersihkanTab = `(() => {
  const st = window.__ZEPHYR__.getState();
  for (const t of st.tabs.filter((x) => x.name === ${JSON.stringify(NAMA)})) st.forceCloseTab(t.id);
  return true;
})()`;

const hasil = [];
const catat = (nama, v) => { hasil.push({ nama, v }); console.log(`   ${nama}: ${v}`); };

console.log(`== uji bahasa live: ${PAKET} ==`);
const sudahTerpasang = await ev(terpasangKode(PAKET));
if (sudahTerpasang) {
  console.log(`catatan: ${PAKET} sudah terpasang sebelumnya — dilepas dulu supaya kontrolnya bersih`);
  await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('[1] sebelum dipasang');
const sebelum = JSON.parse(await ev(UKUR));
catat('tabLang', sebelum.tabLang);
catat('spanToken', sebelum.spanToken);
catat('kelasUnik', sebelum.kelasUnik);
catat('labelStatusBar', sebelum.labelStatusBar);

console.log('[2] pasang lewat jalur marketplace');
console.log('    installKatalog ->', await ev(`window.__ZEPHYR_EXT19__.installKatalog(${JSON.stringify(PAKET)})`));
await new Promise((r) => setTimeout(r, 2500));
catat('terpasang', await ev(`JSON.stringify(window.__ZEPHYR_EXT19__.terpasang().map((m) => m.id))`));

console.log('[3] sesudah dipasang');
const sesudah = JSON.parse(await ev(UKUR));
catat('tabLang', sesudah.tabLang);
catat('spanToken', sesudah.spanToken);
catat('kelasUnik', sesudah.kelasUnik);
catat('labelStatusBar', sesudah.labelStatusBar);
catat('contohToken', JSON.stringify(sesudah.contoh));

console.log('[4] cabut lagi (kontrol sisi kedua)');
console.log('    uninstall ->', await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`));
await new Promise((r) => setTimeout(r, 2500));
const dicabut = JSON.parse(await ev(UKUR));
catat('spanToken', dicabut.spanToken);
catat('kelasUnik', dicabut.kelasUnik);

await ev(bersihkanTab);
rmSync(DIR, { recursive: true, force: true });
ws.close();

const gagal = [];
if (!sesudah.viewAda || sesudah.baris === 0) gagal.push('editor tidak memasang berkasnya ke DOM');
if (!(sesudah.spanToken > sebelum.spanToken)) {
  gagal.push(`token tidak bertambah: sebelum ${sebelum.spanToken}, sesudah ${sesudah.spanToken} (paket terpasang tapi tidak dipakai)`);
}
if (!(sesudah.kelasUnik > sebelum.kelasUnik)) {
  gagal.push(`ragam token tidak bertambah: sebelum ${sebelum.kelasUnik}, sesudah ${sesudah.kelasUnik}`);
}
if (sesudah.labelStatusBar && !/mirc/i.test(sesudah.labelStatusBar)) {
  gagal.push(`status bar masih bilang "${sesudah.labelStatusBar}" padahal berkasnya dihighlight paket`);
}
if (!(dicabut.spanToken <= sebelum.spanToken)) {
  gagal.push(`highlight tidak hilang setelah dicabut: ${dicabut.spanToken} > ${sebelum.spanToken}`);
}

console.log('');
if (gagal.length) {
  console.log('GAGAL:');
  for (const g of gagal) console.log('  - ' + g);
  process.exitCode = 1;
} else {
  console.log(`LULUS: highlight nyala (${sebelum.spanToken} -> ${sesudah.spanToken} token, ${sebelum.kelasUnik} -> ${sesudah.kelasUnik} ragam) dan padam lagi setelah dicabut (${dicabut.spanToken}).`);
  }
}
