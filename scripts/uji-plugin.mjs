/**
 * uji-plugin.mjs — PROMPT 4: sistem plugin Zephyr, diuji END-TO-END.
 *
 * Bukan uji unit. Yang diperiksa adalah jalur yang benar-benar dijalani user:
 * tombol di pane Plugins -> store frontend -> command Tauri -> berkas di disk
 * dan settings. Karena itu verifikasinya berlapis:
 *
 *   lapis 1  laporan command (written/skipped/hooks/agents/mcp)
 *   lapis 2  DISK nyata diperiksa oleh Node (fs.existsSync), bukan dipercaya
 *            dari laporan Rust
 *   lapis 3  pane yang seharusnya ikut berubah (Skills, Hooks, Personas)
 *            dibaca dari store pemiliknya
 *
 * Yang diuji:
 *   P1  bridge plugin ada
 *   P2  install paket bawaan -> daftar + flag marketplace + folder paket di disk
 *   P3  enable -> berkas tertulis (ada di disk), skill masuk pane, agent masuk
 *       Personas, hook belum ada (paket ini tak punya)
 *   P4  KONFLIK: berkas user dengan nama sama TIDAK ditimpa, dilaporkan skipped
 *   P5  enable paket ber-hook -> hook muncul di agentExtras dengan enabled:false
 *   P6  disable -> berkas hilang dari disk, hook & skill hilang dari pane
 *   P7  enable dua kali berturut-turut tidak menyebut berkasnya sendiri skipped
 *   P8  remove -> folder paket hilang, daftar bersih, tak ada sisa di workspace
 *
 *   node scripts/uji-plugin.mjs [port]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('plugin end-to-end (install/enable/disable/remove)');

/* Path Windows di dalam ekspresi CDP: jangan tulis backslash literal di
   template literal (pernah jadi SyntaxError halaman — lihat catatan lama). */
const BS = String.fromCharCode(92);
const native = (p) => String(p).split(BS).join('/');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const PL = (fn) => `window.__ZEPHYR_PLUGINS__.usePlugins.getState().${fn}`;

const adaBr = await cdp.json(
  `return JSON.stringify(!!(window.__ZEPHYR_PLUGINS__ && window.__ZEPHYR_PLUGINS__.usePlugins))`,
);
if (!adaBr) {
  console.log('     BERHENTI: bridge plugin belum ada di halaman ini (app perlu di-reload).');
  await cdp.close();
  process.exit(2);
}

/* ── helper ─────────────────────────────────────────────────────────────── */

/** Daftar plugin terpasang, marketplace, dan pane yang seharusnya ikut berubah. */
async function keadaan() {
  return await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PLUGINS__;
  const st = P.usePlugins.getState();
  return {
    daftar: st.daftar,
    pasar: st.pasar,
    catatan: st.catatan,
    galat: st.galat,
    hooks: P.hooks(),
    skills: await P.skills(),
    instructions: await P.instructions(),
    personas: await P.personas(),
  };
})())`);
}

const namaBerkas = (p) => path.basename(native(p));

/**
 * Resolve one entry of a toggle report against the root it was reported
 * against. `written`/`skipped` are relative on purpose (the panel shows
 * `skills/code-review`, not a wall of AppData), so `scopeRoot` is what makes
 * them checkable — and it is the same root the backend used to shorten them.
 */
const abs = (catatan, p) => (String(p).includes(':') ? native(p) : `${native(catatan.scopeRoot)}/${native(p)}`);

/** Entries of a report that are NOT on disk — the honest sign of a lie. */
function hitungAda(catatan, list) {
  const hilang = (list ?? []).filter((p) => !fs.existsSync(abs(catatan, p)));
  return { n: (list ?? []).length, hilang };
}

/* ── P2 — install paket bawaan ──────────────────────────────────────────── */

const idPaket = 'code-reviewer';
const idHook = 'conventional-commits';

/* Bersihkan dulu: sisa run sebelumnya (mis. enable yang tak sempat di-disable)
   membuat `aktifkan` jadi no-op, dan kegagalan berikutnya jadi palsu. */
const bersih = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  if (!st.daftar.length) await st.muat();
  const ada = window.__ZEPHYR_PLUGINS__.usePlugins.getState().daftar.map((x) => x.name);
  for (const nama of ${JSON.stringify([idPaket, idHook])}) {
    if (ada.includes(nama)) await window.__ZEPHYR_PLUGINS__.usePlugins.getState().hapus(nama);
  }
  return { sebelum: ada };
})())`, 120000);
if (bersih.sebelum.length) console.log(`     (bersih dulu: ${bersih.sebelum.join(', ')})`);

const p2 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  if (!st.pasar.length) await st.muat();
  const dipasang = await st.pasangBawaan(${JSON.stringify(idPaket)});
  const st2 = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  return { dipasang, gagal: st2.galat, daftar: st2.daftar, pasar: st2.pasar };
})())`, 120000);

const entry2 = p2.daftar.find((x) => x.name === idPaket);
const pasar2 = p2.pasar.find((x) => x.id === idPaket);
const paketAda = entry2 ? fs.existsSync(native(entry2.path)) : false;
R.check(
  'P2',
  !!entry2 && p2.dipasang === true && pasar2?.installed === true && paketAda &&
    fs.existsSync(path.join(native(entry2?.path ?? ''), 'plugin.json')),
  `install ${idPaket}: daftar=${!!entry2} enabled=${entry2?.enabled} pasar.installed=${pasar2?.installed} plugin.json=${paketAda}`,
);

if (!entry2) {
  console.log('     BERHENTI: paket tidak terpasang — sisa uji tak bermakna.');
  await cdp.close();
  process.exit(1);
}

/* ── P3 — enable: berkas di disk + skill + agent ────────────────────────── */

const p3 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  await st.aktifkan(${JSON.stringify(idPaket)}, true);
  const st2 = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  return { catatan: st2.catatan, hooks: window.__ZEPHYR_PLUGINS__.hooks(),
           skills: await window.__ZEPHYR_PLUGINS__.skills(),
           personas: await window.__ZEPHYR_PLUGINS__.personas() };
})())`, 120000);

const t3 = p3.catatan ?? {};
const ada3 = hitungAda(t3, t3.written ?? []);
const skill3 = p3.skills.some((s) => (s.name ?? '').includes('code-review'));
const persona3 = (p3.personas ?? []).find((x) => x.id === `plugin:${idPaket}:reviewer`);
R.check(
  'P3',
  t3.enabled === true && (t3.written?.length ?? 0) > 0 && ada3.hilang.length === 0 && skill3 &&
    !!persona3 && persona3.plugin === idPaket && persona3.bawaan === false &&
    !!t3.scopeRoot && t3.written.every((p) => !p.includes(':')),
  `enable ${idPaket}: written=${t3.written?.length} berkas_hilang=${ada3.hilang.length} akar=${t3.scopeRoot} skill=${skill3} agent=${persona3?.nama ?? '-'} tag=${persona3?.plugin ?? '-'}`,
);

/* ── P4 — konflik nama: berkas user tidak ditimpa ───────────────────────── */

const skillEntry = (t3.written ?? []).find((p) => !native(p).endsWith('.md')) ?? (t3.written ?? [])[0];
const skillPath = skillEntry ? abs(t3, skillEntry) : '';
let p4 = { skipped: [], sama: false, isi: '', ada: false };
if (skillPath) {
  const dir = skillPath;
  await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_PLUGINS__.usePlugins.getState().aktifkan(${JSON.stringify(idPaket)}, false);
  return 1;
})())`, 120000);
  // Berkas sendiri milik user di tempat yang sama: HARUS dilaporkan skipped.
  const SENTINEL = '# SKILL MILIK USER\n\njangan ditimpa plugin\n';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), SENTINEL, 'utf8');
  const p4raw = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  await st.aktifkan(${JSON.stringify(idPaket)}, true);
  return window.__ZEPHYR_PLUGINS__.usePlugins.getState().catatan;
})())`, 120000);
  const target = (p4raw.skipped ?? []).find((s) => abs(p4raw, s) === dir);
  p4 = {
    skipped: p4raw.skipped ?? [],
    bertanda: !!target,
    ada: fs.existsSync(path.join(dir, 'SKILL.md')),
    isi: fs.existsSync(path.join(dir, 'SKILL.md')) ? fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') : '',
    nulis: (p4raw.written ?? []).length,
  };
  p4.sama = p4.isi === SENTINEL;
  // Disable lagi: berkas milik user TIDAK boleh ikut terhapus — plugin hanya
  // menghapus apa yang memang dia tulis (daftar `written`).
  await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_PLUGINS__.usePlugins.getState().aktifkan(${JSON.stringify(idPaket)}, false);
  return 1;
})())`, 120000);
  p4.tetap = fs.existsSync(path.join(dir, 'SKILL.md'));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  R.check(
    'P4',
    p4.bertanda && p4.ada && p4.sama && p4.tetap,
    `konflik: skipped_lapor=${p4.skipped.length} ditandai=${p4.bertanda} isi_user_utuh=${p4.sama} tetap_ada_setelah_disable=${p4.tetap}`,
  );
} else {
  R.check('P4', false, 'konflik: tak ada path skill yang bisa diuji');
}

/* ── P5 — paket ber-hook: hook masuk DISABLED ───────────────────────────── */

const p5 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  await st.pasangBawaan(${JSON.stringify(idHook)});
  await st.aktifkan(${JSON.stringify(idHook)}, true);
  const st2 = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  return { catatan: st2.catatan, hooks: window.__ZEPHYR_PLUGINS__.hooks(),
           skills: await window.__ZEPHYR_PLUGINS__.skills(),
           instructions: await window.__ZEPHYR_PLUGINS__.instructions() };
})())`, 120000);

const t5 = p5.catatan ?? {};
const hk = (p5.hooks ?? []).find((h) => h.id === `plugin:${idHook}:commit-subject`);
const ada5 = hitungAda(t5, t5.written ?? []);
const ruleEntry = (t5.written ?? []).find((p) => native(p).endsWith('.md'));
const rule = ruleEntry ? abs(t5, ruleEntry) : '';
const skill5 = p5.skills.some((s) => (s.name ?? '').includes('conventional-commits'));
R.check(
  'P5',
  (t5.hooks?.length ?? 0) === 1 && !!hk && hk.enabled === false && hk.plugin === idHook &&
    ada5.hilang.length === 0 && !!rule && fs.existsSync(rule) && skill5,
  `hook tersimpan MATI: id=${hk?.id ?? '-'} enabled=${hk?.enabled} plugin=${hk?.plugin ?? '-'} written=${t5.written?.length} berkas_hilang=${ada5.hilang.length} skill=${skill5}`,
);

/* ── P7 — enable dua kali: berkas sendiri bukan "konflik" ───────────────── */

const p7 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  await st.aktifkan(${JSON.stringify(idHook)}, true);
  return window.__ZEPHYR_PLUGINS__.usePlugins.getState().catatan;
})())`, 120000);
R.check(
  'P7',
  (p7.skipped?.length ?? 0) === 0 && (p7.written?.length ?? 0) > 0,
  `enable ulang: skipped=${p7.skipped?.length ?? 0} (0 = berkasnya sendiri dikenali) written=${p7.written?.length}`,
);

/* ── P6 — disable: disk & pane bersih ───────────────────────────────────── */

const sisaPath = [
  ...(t3.written ?? []).map((p) => abs(t3, p)),
  ...(t5.written ?? []).map((p) => abs(t5, p)),
  ...(p7.written ?? []).map((p) => abs(p7, p)),
].filter((p) => fs.existsSync(native(p)));

const p6 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  await st.aktifkan(${JSON.stringify(idHook)}, false);
  await st.aktifkan(${JSON.stringify(idPaket)}, false);
  return { hooks: window.__ZEPHYR_PLUGINS__.hooks(),
           skills: await window.__ZEPHYR_PLUGINS__.skills(),
           personas: await window.__ZEPHYR_PLUGINS__.personas(),
           daftar: window.__ZEPHYR_PLUGINS__.usePlugins.getState().daftar };
})())`, 120000);

// `sisaPath` dihitung SEBELUM disable: setelah disable, tak satu pun boleh ada.
const sisa6 = sisaPath.filter((p) => fs.existsSync(native(p)));
const hook6 = (p6.hooks ?? []).some((h) => String(h.plugin ?? '').length > 0);
const skill6 = (p6.skills ?? []).some(
  (s) => (s.name ?? '').includes('conventional-commits') || (s.name ?? '').includes('code-review'),
);
const persona6 = (p6.personas ?? []).some((x) => String(x.plugin ?? '').length > 0);
const masihEnabled = (p6.daftar ?? []).some((p) => p.enabled);
R.check(
  'P6',
  sisa6.length === 0 && !hook6 && !skill6 && !persona6 && !masihEnabled,
  `disable: berkas_sisa=${sisa6.length}/${sisaPath.length} hook_plugin=${hook6} skill=${skill6} agent=${persona6} masih_enabled=${masihEnabled}`,
);

/* ── P8 — remove: paket & daftar bersih ─────────────────────────────────── */

const p8 = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  const dirs = st.daftar.map((p) => p.path);
  await st.hapus(${JSON.stringify(idHook)});
  await st.hapus(${JSON.stringify(idPaket)});
  const st2 = window.__ZEPHYR_PLUGINS__.usePlugins.getState();
  return { dirs, daftar: st2.daftar, pasar: st2.pasar, galat: st2.galat };
})())`, 120000);

const dirSisa = (p8.dirs ?? []).filter((d) => fs.existsSync(native(d)));
const pasar8 = p8.pasar ?? [];
const idPaketSisa = pasar8.filter((x) => [idPaket, idHook].includes(x.id) && x.installed);
R.check(
  'P8',
  (p8.daftar?.length ?? 0) === 0 && dirSisa.length === 0 && idPaketSisa.length === 0 && !p8.galat,
  `remove: daftar=${p8.daftar?.length ?? 0} folder_sisa=${dirSisa.length}/${p8.dirs?.length} pasar_masih_terpasang=${idPaketSisa.length} galat=${p8.galat ?? '-'}`,
);

/* ── P9 — tak ada sisa di workspace (sisa user sendiri dibersihkan di P4) ── */

const sisaAkhir = [
  ...(t3.written ?? []).map((p) => abs(t3, p)),
  ...(t5.written ?? []).map((p) => abs(t5, p)),
  ...(p7.written ?? []).map((p) => abs(p7, p)),
].filter((p) => fs.existsSync(native(p)));
R.check(
  'P9',
  sisaAkhir.length === 0,
  `sisa akhir: ${sisaAkhir.length} (${sisaAkhir.map(namaBerkas).join(', ') || 'bersih'})`,
);

/* Folder scope yang kita sendiri kosongkan tidak ditinggal begitu saja: sisa
   folder kosong di AppData bukan bagian dari hasil uji. */
for (const root of [t3.scopeRoot, t5.scopeRoot].filter(Boolean)) {
  for (const sub of ['skills', 'instructions']) {
    const d = `${native(root)}/${sub}`;
    if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  }
}

const ringkas = await keadaan();
console.log(
  `\n     akhir: daftar=${ringkas.daftar.length} hooks=${ringkas.hooks.length} skills=${ringkas.skills.length} instruksi=${ringkas.instructions.length} personas=${ringkas.personas.length}`,
);

const hasil = R.selesai();
await cdp.close();
process.exit(hasil.lulus === hasil.total ? 0 : 1);
