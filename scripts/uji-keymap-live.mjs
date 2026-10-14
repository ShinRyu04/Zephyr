#!/usr/bin/env node
/*
 * scripts/uji-keymap-live.mjs — cakupan + pembuktian efek paket KEYMAP bawaan.
 *
 * CATATAN: berkas ini sebelumnya berisi uji live berbasis CDP (port 9223) yang
 * MENEKAN chord di aplikasi yang sedang jalan. Uji itu tidak bisa dijalankan di
 * jalur ini (aplikasi tidak boleh dinyalakan, CDP :9223 dilarang), jadi isi
 * lamanya dipindahkan ke salinan di
 *   C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/uji-keymap-live.cdp-backup.mjs
 * (berkas itu TIDAK dilacak git - simpan/commit sendiri kalau masih dipakai).
 *
 * Fungsi skrip ini sekarang:
 * (a) Mem-parse paket keymap dari berkas Rust tempat katalognya di-embed:
 *       src-tauri/src/ext_bundled_extra.rs (Vim, Emacs, JetBrains)
 *       src-tauri/src/ext_bundled.rs       (Sublime)
 *     Dibaca: raw string Rust `r##"..."##`, tabel bundel
 *     ("keymaps/vim.json", KEYMAP_VIM_JSON), lalu JSON di dalamnya.
 * (b) Mengumpulkan perintah Zephyr NYATA dari tiga sumber yang dipakai runtime:
 *       src/lib/commandRegistry.ts (registry kanonik `id: '...'`; didaftarkan
 *         ke COMMAND_IDS di baris ~2394)
 *       src/lib/keybindings.ts     (DEFAULT_BINDINGS; entri layer 'stub'
 *         dibuang karena keybindings.ts juga membuangnya saat mendaftar)
 *       src/lib/shortcuts.ts       (ACTIONS - resolver pintasan panel Settings)
 *     plus tabel alias VS Code -> Zephyr dari src/lib/keymapAlias.ts yang
 *     dipakai loader (extLoader.muatKeymap) SEBELUM validasi.
 * (c) Memetakan tiap chord -> perintah Zephyr; menghitung cakupan per paket.
 * (d) Keluar kode 1 bila ada chord yang menunjuk perintah yang tidak ada
 *     (kelas bug yang pernah kejadian: editor.copyLineDown, editor.moveLineUp,
 *      editor.moveLineDown, editor.splitRight).
 * (e) Mencetak perintah yang dipakai paket tapi tanpa padanan + tebakan
 *     padanan terdekat (mis. workbench.action.files.save -> file.save).
 * (f) Bila memungkinkan: membundel resolver ASLI (src/lib/keybindings.ts via
 *     esbuild) ke berkas sementara di folder scratch, mengimpornya, lalu
 *     membandingkan hasil mergeBindings SEBELUM vs SESUDAH memuat chord paket.
 *     Bagian ini boleh gagal; kalau gagal, skrip mengatakannya terang-terangan
 *     dan analisis statis tetap dijalankan.
 *
 * Pemakaian: node scripts/uji-keymap-live.mjs [root-repo]
 * Keluar   : 0 = semua chord punya padanan perintah nyata
 *            1 = ada chord tanpa padanan perintah (bug paket keymap)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(process.argv[2] ?? 'D:/Zephyr');
const SCRATCH = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'hermes', 'cache', 'scratch')
  : os.tmpdir();

const baca = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
const uniq = (xs) => [...new Set(xs)];

/* ───────────────────────── (a) parse paket keymap ───────────────────────── */

function rawConsts(src) {
  const out = new Map();
  const re = /(?:pub\(super\)\s+)?const\s+([A-Z0-9_]+)\s*:\s*&str\s*=\s*r##"([\s\S]*?)"##;/g;
  let m;
  while ((m = re.exec(src))) out.set(m[1], m[2]);
  return out;
}

function tabelBundel(src) {
  const out = new Map();
  const re = /\(\s*"([^"]+)"\s*,\s*(?:extra::)?([A-Z0-9_]+)\s*\)/g;
  let m;
  while ((m = re.exec(src))) if (!out.has(m[1])) out.set(m[1], m[2]);
  return out;
}

const RS_FILES = ['src-tauri/src/ext_bundled_extra.rs', 'src-tauri/src/ext_bundled.rs'];
const consts = new Map();
const asal = new Map();
const tabel = new Map();

for (const f of RS_FILES) {
  const src = baca(f);
  for (const [k, v] of rawConsts(src)) {
    consts.set(k, v);
    asal.set(k, f);
  }
  for (const [pth, c] of tabelBundel(src)) if (!tabel.has(pth)) tabel.set(pth, c);
}

const berkasChord = new Map();
const manifes = [];

for (const [nama, isi] of consts) {
  let json;
  try {
    json = JSON.parse(isi);
  } catch {
    continue;
  }
  if (Array.isArray(json)) {
    if (json.every((b) => b && typeof b === 'object' && 'key' in b && 'command' in b)) berkasChord.set(nama, json);
    continue;
  }
  if (json && json.contributes && Array.isArray(json.contributes.keymaps)) manifes.push({ nama, json });
}

const paket = [];
const catatanPaket = [];

for (const mf of manifes) {
  for (const km of mf.json.contributes.keymaps) {
    const pth = String(km.path ?? '').replace(/^\.\//, '');
    let target = tabel.get(pth);
    if (!target || !berkasChord.has(target)) target = `${mf.nama}_JSON`;
    const chords = berkasChord.get(target);
    if (!chords) {
      catatanPaket.push(`MANIFES ${mf.nama}: path ${pth} tidak ketemu berkas chord-nya`);
      continue;
    }
    paket.push({
      id: mf.json.id ?? mf.nama,
      nama: mf.json.name ?? mf.nama,
      label: km.label ?? '',
      path: pth,
      constManifes: mf.nama,
      constChord: target,
      berkas: asal.get(target) ?? asal.get(mf.nama) ?? '?',
      chords: chords.map((b) => ({ key: String(b.key), command: String(b.command) })),
    });
  }
}

for (const [nama, chords] of berkasChord) {
  if (paket.some((x) => x.constChord === nama)) continue;
  catatanPaket.push(`berkas chord ${nama} tidak dirujuk manifes mana pun`);
  paket.push({
    id: nama,
    nama: `(tanpa manifes) ${nama}`,
    label: '',
    path: '(?)',
    constManifes: '-',
    constChord: nama,
    berkas: asal.get(nama) ?? '?',
    chords: chords.map((b) => ({ key: String(b.key), command: String(b.command) })),
  });
}

/* ─────────────── (b) perintah Zephyr nyata + tabel alias ─────────────────── */

const idsReg = uniq([...baca('src/lib/commandRegistry.ts').matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]));

const kbindings = [...baca('src/lib/keybindings.ts').matchAll(/\bD\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'(\w+)'/g)].map((m) => ({
  chord: m[1],
  command: m[2],
  layer: m[3],
}));
const kbNyata = kbindings.filter((b) => b.layer !== 'stub');
const idsKb = uniq(kbNyata.map((b) => b.command));
const chordDefault = new Map();
for (const b of kbNyata) {
  const c = b.chord.split(/\s+/).filter(Boolean).join(' ');
  if (c && !chordDefault.has(c)) chordDefault.set(c, b.command);
}

const idsSc = uniq([...baca('src/lib/shortcuts.ts').matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]));

const alias = {};
for (const m of baca('src/lib/keymapAlias.ts').matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) alias[m[1]] = m[2];

const ids = new Set([...idsReg, ...idsKb, ...idsSc]);
const sumberId = (id) => {
  const s = [];
  if (idsReg.includes(id)) s.push('registry');
  if (idsKb.includes(id)) s.push('keybindings');
  if (idsSc.includes(id)) s.push('shortcuts');
  return s.join('+') || '-';
};
const aliasIdentitas = Object.entries(alias).filter(([k, v]) => k === v).map(([k]) => k);

/* ───────────────── (c)+(d) cakupan per paket & validasi ──────────────────── */

const hasil = [];
let totalChord = 0;
let totalOk = 0;
const takTerpetakan = new Map();

for (const pk of paket) {
  const ok = [];
  const gagal = [];
  for (const c of pk.chords) {
    const dialihkan = alias[c.command] !== undefined && alias[c.command] !== c.command;
    const resolved = alias[c.command] ?? c.command;
    const ada = ids.has(resolved);
    const bentrok = chordDefault.get(c.key.split(/\s+/).filter(Boolean).join(' '));
    const rec = {
      key: c.key,
      asli: c.command,
      resolved,
      dialihkan,
      ada,
      sumber: ada ? sumberId(resolved) : '-',
      bentrok: bentrok && bentrok !== resolved ? bentrok : null,
    };
    (ada ? ok : gagal).push(rec);
    if (!ada) {
      if (!takTerpetakan.has(resolved)) takTerpetakan.set(resolved, { asli: c.command, paket: [], chords: [] });
      const e = takTerpetakan.get(resolved);
      if (!e.paket.includes(pk.nama)) e.paket.push(pk.nama);
      e.chords.push(c.key);
    }
  }
  totalChord += pk.chords.length;
  totalOk += ok.length;
  hasil.push({ ...pk, ok, gagal });
}

const HINT_VSCODE = {
  'workbench.action.files.save': 'file.save',
  'workbench.action.files.saveAs': 'file.saveAs',
  'workbench.action.files.newFile': 'file.new',
  'workbench.action.files.openFile': 'file.open',
  'workbench.action.quickOpen': 'view.quickOpen',
  'workbench.action.quickOpenRecent': 'view.nextTab',
  'workbench.action.showCommands': 'view.palette',
  'workbench.action.closeActiveEditor': 'file.closeTab',
  'workbench.action.closeAllEditors': 'editor.closeAll',
  'workbench.action.toggleSidebar': 'view.sidebar',
  'workbench.action.togglePanel': 'view.panel',
  'workbench.action.splitEditorRight': 'view.splitEditorRight',
  'workbench.action.findInFiles': 'edit.findInFiles',
  'workbench.action.replaceInFiles': 'edit.replaceInFiles',
  'workbench.action.terminal.kill': 'terminal.kill',
  'workbench.action.terminal.focusFind': 'edit.find',
  'editor.action.formatDocument': 'editor.formatDocument',
  'editor.action.rename': 'editor.renameSymbol',
  'editor.copyLineDown': 'Zephyr belum punya perintah ini (dulu salah ikat)',
  'editor.moveLineUp': 'editor.line.moveUp',
  'editor.moveLineDown': 'editor.line.moveDown',
  'editor.splitRight': 'view.splitEditorRight',
};

const potong = (s) =>
  (s.match(/[A-Za-z0-9]+/g) ?? [])
    .flatMap((w) => w.split(/(?=[A-Z])/))
    .map((t) => t.toLowerCase())
    .filter(Boolean);

function tebakPadanan(cmd, maks = 2) {
  const segmen = cmd.split('.').pop() ?? cmd;
  const t1 = potong(cmd);
  const skor = [];
  for (const id of ids) {
    const t2 = potong(id);
    const set2 = new Set(t2);
    const share = t1.filter((t) => set2.has(t)).length;
    if (share === 0) continue;
    const seg2 = id.split('.').pop() ?? id;
    let s = share * 2 + ((2 * share) / (t1.length + t2.length)) * 3;
    if (seg2.toLowerCase() === segmen.toLowerCase()) s += 4;
    if (id.toLowerCase().includes(segmen.toLowerCase())) s += 2;
    if (id.toLowerCase().includes(cmd.toLowerCase()) || cmd.toLowerCase().includes(id.toLowerCase())) s += 3;
    s -= 0.3 * (t2.length - share);
    if (s > 2.4) skor.push([s, id]);
  }
  skor.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
  const out = skor.slice(0, maks).map(([s, id]) => `${id} (skor ${s.toFixed(1)})`);
  const hint = HINT_VSCODE[cmd];
  if (hint) out.unshift(`${hint} (hint manual)`);
  return out.length ? out : ['(tidak ada tebakan)'];
}

/* ─────────── (f) bukti efek nyata lewat resolver asli (esbuild) ──────────── */

function siapkanBundel() {
  const bin = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (!fs.existsSync(bin)) return { ok: false, alasan: `esbuild tidak ada di ${bin}` };
  for (const f of ['src/lib/keybindings.ts', 'src/lib/commandIds.ts', 'src/lib/shortcuts.ts']) {
    if (!fs.existsSync(path.join(ROOT, f))) return { ok: false, alasan: `berkas ${f} tidak ada` };
  }
  fs.mkdirSync(SCRATCH, { recursive: true });
  const rootFwd = ROOT.replace(/\\/g, '/');
  const entry = path.join(SCRATCH, 'entry-keymap-resolver.ts');
  const out = path.join(SCRATCH, 'keymap-resolver.bundle.mjs');
  fs.writeFileSync(
    entry,
    [
      `export { mergeBindings, DEFAULT_BINDINGS, normalizeChord } from '${rootFwd}/src/lib/keybindings.ts';`,
      `export { daftarkanCommandId, commandIdAda, COMMAND_IDS } from '${rootFwd}/src/lib/commandIds.ts';`,
      `export { ACTIONS, bindingMap } from '${rootFwd}/src/lib/shortcuts.ts';`,
      `export { perintahKeymap } from '${rootFwd}/src/lib/keymapAlias.ts';`,
      '',
    ].join('\n'),
  );
  /*
   * --banner menaruh `globalThis.self = globalThis` di BARIS PERTAMA bundel:
   * @xterm/addon-fit dipanggil di top-level dan membaca `self`, yang tidak ada
   * di Node. --define hanya mengganti `globalThis.self`, tidak `self` telanjang,
   * jadi banner ini yang benar-benar menyelamatkan impor.
   * --define import.meta.env meniru penggantian Vite (kode app membaca
   * import.meta.env.DEV; di Node import.meta.env kosong -> TypeError saat impor).
   */
  const arg = [
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--log-level=warning',
    '--banner:js=if (typeof globalThis.self === "undefined") globalThis.self = globalThis;',
    '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"production"}',
    `--outfile=${out}`,
  ];
  const r = spawnSync(process.execPath, [bin, ...arg], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) {
    const pesan = `${r.stderr || r.stdout || ''}`.trim().split('\n').slice(0, 6).join(' | ');
    return { ok: false, alasan: `esbuild gagal (status ${r.status}): ${pesan}` };
  }
  return { ok: true, entry, berkas: out };
}

async function buktiEfek() {
  const b = siapkanBundel();
  if (!b.ok) return { ok: false, alasan: b.alasan };
  let mod;
  try {
    mod = await import(pathToFileURL(b.berkas).href);
  } catch (e) {
    return { ok: false, alasan: `bundel dibuat tapi impor gagal: ${e.message}`, berkas: b.berkas };
  }
  const { mergeBindings, DEFAULT_BINDINGS, normalizeChord, bindingMap, COMMAND_IDS, ACTIONS, perintahKeymap } = mod;
  if (typeof mergeBindings !== 'function') return { ok: false, alasan: 'mergeBindings tidak diekspor bundel' };
  if (typeof normalizeChord !== 'function') return { ok: false, alasan: 'normalizeChord tidak diekspor bundel' };
  /* pakai fungsi alias ASLI yang dipakai mergeBindings, bukan tabel hasil parse statis */
  const aliasAsli = typeof perintahKeymap === 'function';
  const keId = (cmd) => (aliasAsli ? perintahKeymap(cmd) : alias[cmd] ?? cmd);

  /* chord -> himpunan perintah pemegangnya, chord dinormalkan oleh app sendiri */
  const keMap = (bs) => {
    const m = new Map();
    for (const x of bs) {
      const c = normalizeChord(String(x?.chord ?? ''));
      if (!c) continue;
      if (!m.has(c)) m.set(c, new Set());
      m.get(c).add(x.command);
    }
    return m;
  };

  const dasar = keMap(mergeBindings([], []));
  const panel = new Map(bindingMap({}));

  const deltaSatu = (pak) => {
    const ext = pak.chords.map((c) => ({ key: c.key, command: c.command, source: pak.id }));
    const after = keMap(mergeBindings([], ext));
    const mendarat = [];
    const ditolak = [];
    for (const c of pak.chords) {
      const chord = normalizeChord(c.key);
      const target = keId(c.command);
      const pemegang = after.get(chord);
      /* chord yang AKHIRNYA dipegang perintah ini setelah merge (bisa >1 utk default) */
      const chordCmd = [...after].filter(([, s]) => s.has(target)).map(([c]) => c);
      const rec = { key: c.key, chord, target, pemegang: pemegang ? [...pemegang] : [], chordCmd };
      if (pemegang && pemegang.has(target)) mendarat.push(rec);
      else ditolak.push(rec);
    }
    const baru = [];
    const timpa = [];
    for (const m of mendarat) {
      if (!dasar.has(m.chord)) baru.push(m);
      else if (!dasar.get(m.chord).has(m.target)) timpa.push({ ...m, dari: [...dasar.get(m.chord)] });
    }
    const hilang = [];
    for (const [chord, cmds] of dasar) {
      const now = after.get(chord);
      for (const cmd of cmds) if (!now || !now.has(cmd)) hilang.push({ chord, command: cmd });
    }
    /*
     * Lapisan panel Settings (shortcuts.ts bindingMap) adalah jalur tombol KEDUA.
     * Kalau chord yang sama dipegang perintah berbeda di sana, dua jalur bisa
     * memakan satu urutan tombol - kelas bug "toggle jalan dua kali".
     */
    const bedaPanel = mendarat
      .filter((m) => panel.has(m.chord) && panel.get(m.chord) !== m.target)
      .map((m) => ({ ...m, panelCommand: panel.get(m.chord) }));
    return { nama: pak.nama, id: pak.id, jumlah: pak.chords.length, mendarat, ditolak, baru, timpa, hilang, bedaPanel };
  };

  const perPaket = paket.map(deltaSatu);
  const semua = deltaSatu({
    nama: 'SEMUA PAKET SEKALIGUS',
    id: '(gabungan)',
    chords: paket.flatMap((p) => p.chords),
  });

  const hitungChord = {};
  for (const pk of paket) for (const c of pk.chords) hitungChord[c.key] = (hitungChord[c.key] ?? 0) + 1;
  const tabrakan = Object.entries(hitungChord).filter(([, n]) => n > 1);

  /*
   * Peta hasil merge untuk DUA keadaan, dibawa keluar supaya bagian assertion
   * bisa memeriksa chord bawaan mana yang hilang (bukan hanya menghitungnya).
   */
  const extSemua = paket.flatMap((p) => p.chords.map((c) => ({ key: c.key, command: c.command, source: p.id })));
  const petaSemua = keMap(mergeBindings([], extSemua));

  return {
    ok: true,
    petaDasar: dasar,
    petaSemua,
    berkas: b.berkas,
    entry: b.entry,
    commandIds: COMMAND_IDS instanceof Set ? COMMAND_IDS.size : -1,
    jumlahDefault: Array.isArray(DEFAULT_BINDINGS) ? DEFAULT_BINDINGS.length : -1,
    jumlahActions: Array.isArray(ACTIONS) ? ACTIONS.length : -1,
    dasar: dasar.size,
    panel: panel.size,
    jumlahChordPaket: paket.reduce((n, p) => n + p.chords.length, 0),
    perPaket,
    semua,
    tabrakan,
  };
}

/* ───────────────────────────── laporan keluaran ─────────────────────────── */

const ev = await buktiEfek();

const L = [];
const cetak = (...a) => L.push(a.join(' '));

cetak('=== UJI KEYMAP ZEPHYR (statis) ===');
cetak(`repo     : ${ROOT}`);
cetak(`paket    : ${paket.length}  chord total ${totalChord}`);
cetak(`id Zephyr: registry ${idsReg.length} v keybindings ${idsKb.length} (non-stub) v shortcuts ${idsSc.length} => union ${ids.size}`);
cetak(`alias VS Code->Zephyr: ${Object.keys(alias).length} entri; alias "identitas" (tidak mengubah apa pun): ${aliasIdentitas.length}${aliasIdentitas.length ? ' [' + aliasIdentitas.join(', ') + ']' : ''}`);
for (const k of catatanPaket) cetak(`catatan: ${k}`);
cetak('');

for (const h of hasil) {
  const persen = h.chords.length ? ((h.ok.length / h.chords.length) * 100).toFixed(1) : '0.0';
  cetak(`--- ${h.nama} [${h.label || '-'}]`);
  cetak(`    id     : ${h.id}`);
  cetak(`    berkas : ${h.berkas}  (manifes ${h.constManifes} / chord ${h.constChord} / ${h.path})`);
  cetak(`    chord  : ${h.chords.length}  punya padanan: ${h.ok.length} (${persen}%)`);
  for (const c of h.gagal) cetak(`    TANPA PADANAN: ${c.key} -> "${c.asli}"${c.dialihkan ? ` (alias -> "${c.resolved}")` : ''}`);
  const dialih = h.ok.filter((c) => c.dialihkan);
  cetak(`    dialihkan alias: ${dialih.length}${dialih.length ? ' contoh: ' + dialih.slice(0, 3).map((c) => `${c.key} ${c.asli}->${c.resolved}`).join('; ') : ''}`);
  const bentrok = h.ok.filter((c) => c.bentrok);
  cetak(`    chord bentrok dgn default: ${bentrok.length}${bentrok.length ? ' contoh: ' + bentrok.slice(0, 3).map((c) => `${c.key} (default=${c.bentrok}, paket=${c.resolved})`).join('; ') : ''}`);
  cetak(`    contoh chord (maks 5): ${h.chords.slice(0, 5).map((c) => `${c.key}=>${alias[c.command] ?? c.command}`).join(', ')}`);
  const lv = ev.ok ? ev.perPaket.find((x) => x.id === h.id) : null;
  if (lv) {
    cetak(`    LIVE mergeBindings  : mendarat ${lv.mendarat.length}/${lv.jumlah}, chord baru ${lv.baru.length}, menimpa default ${lv.timpa.length}, DITOLAK ${lv.ditolak.length}`);
    for (const t of lv.timpa) cetak(`      menimpa default : ${t.key} (${t.chord}) "${t.dari.join(', ')}" -> "${t.target}"`);
    for (const d of lv.ditolak) cetak(`      DITOLAK         : ${d.key} -> "${d.target}" (pemegang sekarang: ${d.pemegang.join(', ') || '(kosong - chord mati)'}; perintah ini kini di chord: ${d.chordCmd.join(' / ') || '(none)'})`);
    for (const x of lv.hilang.slice(0, 6)) cetak(`      default hilang  : ${x.chord} (${x.command})`);
    for (const x of lv.bedaPanel) cetak(`      panel Settings masih pegang chord ini utk "${x.panelCommand}"`);
  } else {
    cetak('    LIVE mergeBindings  : (tidak terbukti - lihat bagian BUKTI di bawah)');
  }
  cetak('');
}

cetak('=== PERINTAH DIPAKAI PAKET TAPI TANPA PADANAN DI ZEPHYR ===');
if (takTerpetakan.size === 0) cetak('(tidak ada)');
for (const [cmd, e] of takTerpetakan) {
  cetak(`- "${cmd}"  (ditulis paket sebagai "${e.asli}")  dipakai ${e.chords.length}x oleh: ${e.paket.join(', ')}`);
  cetak(`    chord  : ${e.chords.join(', ')}`);
  for (const t of tebakPadanan(cmd)) cetak(`    tebakan: ${t}`);
}
cetak('');

const gagalTotal = totalChord - totalOk;
cetak('=== RINGKASAN ===');
cetak(`chord total         : ${totalChord}`);
cetak(`punya padanan nyata : ${totalOk} (${totalChord ? ((totalOk / totalChord) * 100).toFixed(1) : '0.0'}%)`);
cetak(`tanpa padanan       : ${gagalTotal}`);
cetak(`perintah tak dikenal: ${takTerpetakan.size}`);
cetak('');

cetak('=== BUKTI EFEK NYATA (resolver asli: mergeBindings + bindingMap, dibundel esbuild) ===');
if (!ev.ok) {
  cetak(`TIDAK TERBUKTI: ${ev.alasan}`);
  cetak('(analisis statis di atas tetap berlaku; efek live belum dibuktikan - lihat komentar berkas)');
} else {
  cetak(`bundel                 : ${ev.berkas}`);
  cetak(`entry                  : ${ev.entry}`);
  cetak(`COMMAND_IDS di runtime : ${ev.commandIds} (registry + default non-stub, hasil impor modul asli)`);
  cetak(`DEFAULT_BINDINGS       : ${ev.jumlahDefault} entri -> ${ev.dasar} chord unik sebelum paket apa pun`);
  cetak(`ACTIONS (panel Setting): ${ev.jumlahActions} aksi -> ${ev.panel} chord di panel`);
  cetak('');
  for (const lv of ev.perPaket) {
    cetak(`  ${lv.nama}  (${lv.id})`);
    cetak(`    mendarat ${lv.mendarat.length}/${lv.jumlah} | chord baru ${lv.baru.length} | menimpa default ${lv.timpa.length} | ditolak ${lv.ditolak.length}`);
    for (const m of lv.baru.slice(0, 6)) cetak(`      + baru   : ${m.key} -> ${m.target}`);
    for (const t of lv.timpa.slice(0, 6)) cetak(`      ~ timpa  : ${t.key} "${t.dari.join(', ')}" -> "${t.target}"`);
    for (const d of lv.ditolak.slice(0, 6)) cetak(`      ! ditolak: ${d.key} -> "${d.target}" (perintah ini akhirnya di: ${d.chordCmd.join(' / ') || '(kosong)'})`);
  }
  cetak('');
  const s = ev.semua;
  cetak('  GABUNGAN SEMUA PAKET');
  cetak(`    mendarat ${s.mendarat.length}/${s.jumlah} | chord baru ${s.baru.length} | menimpa default ${s.timpa.length} | ditolak ${s.ditolak.length} | default hilang ${s.hilang.length}`);
  for (const x of s.hilang.slice(0, 10)) cetak(`      - ${x.chord} (${x.command})`);
  if (ev.tabrakan.length) {
    cetak(`  chord dipakai lebih dari satu paket: ${ev.tabrakan.map(([k, n]) => `${k} x${n}`).join(', ')}`);
  } else {
    cetak('  chord antar-paket: tidak ada tabrakan antar paket');
  }
}
cetak('');
/*
 * ───────────── (g) ASSERTION KERAS ─────────────
 * Sebelum ini skrip selalu bilang LULUS selama semua chord paket punya padanan
 * perintah, padahal 11 chord tidak mendarat dan 18 pintasan bawaan terhapus
 * (Ctrl+P, Ctrl+S, Alt+Up, ...). Assertion di bawah membuat kejadian itu
 * MENGGAGALKAN uji ini (exit != 0), bukan cuma tercetak sebagai catatan.
 */
const WAJIB_DEFAULT = [
  'Ctrl+P',
  'Ctrl+N',
  'Ctrl+S',
  'Ctrl+W',
  'Ctrl+F',
  'Ctrl+H',
  'Ctrl+Shift+P',
  'Ctrl+Shift+F',
  'Alt+Up',
  'Alt+Down',
  'Ctrl+K Ctrl+W',
  'Ctrl+B',
  'Ctrl+J',
  'F5',
  'Ctrl+Shift+X',
];

const pelanggaran = [];

if (!ev.ok) {
  pelanggaran.push(`BUKTI LIVE TIDAK TERSEDIA (${ev.alasan}) - efek merge paket tidak terbukti`);
} else {
  /* (a) setiap pintasan bawaan wajib harus masih dipegang perintah yang sama */
  const hilangWajib = [];
  for (const chord of WAJIB_DEFAULT) {
    const asal = ev.petaDasar.get(chord);
    if (!asal) {
      pelanggaran.push(`${chord} tidak ada di DEFAULT_BINDINGS (daftar uji/fixture tidak valid)`);
      continue;
    }
    const now = ev.petaSemua.get(chord);
    for (const cmd of asal) if (!now || !now.has(cmd)) hilangWajib.push(`${chord} (${cmd})`);
  }
  if (hilangWajib.length) {
    pelanggaran.push(`pintasan bawaan HILANG setelah paket dipasang (${hilangWajib.length}/${WAJIB_DEFAULT.length}):`);
    for (const x of hilangWajib) pelanggaran.push(`  - ${x}`);
  }

  /* (a2) tidak boleh ada SATU PUN chord bawaan yang hilang, bukan hanya 15 di atas */
  if (ev.semua.hilang.length) {
    pelanggaran.push(`chord bawaan hilang total: ${ev.semua.hilang.length}`);
    for (const x of ev.semua.hilang) pelanggaran.push(`  - ${x.chord} (${x.command})`);
  }

  /* (b) chord paket yang ditolak (gagal mendarat) harus 0, per paket dan gabungan */
  if (ev.semua.ditolak.length) {
    pelanggaran.push(`chord paket DITOLAK: ${ev.semua.ditolak.length}`);
    for (const d of ev.semua.ditolak) pelanggaran.push(`  - ${d.key} -> "${d.target}"`);
  }
  for (const lv of ev.perPaket) {
    if (lv.ditolak.length) {
      pelanggaran.push(`paket ${lv.nama}: ${lv.ditolak.length} chord ditolak`);
      for (const d of lv.ditolak) pelanggaran.push(`  - ${d.key} -> "${d.target}"`);
    }
  }

  /* (c) semua chord paket harus mendarat */
  if (ev.semua.mendarat.length !== ev.semua.jumlah) {
    pelanggaran.push(
      `chord paket mendarat ${ev.semua.mendarat.length}/${ev.semua.jumlah} (harus semuanya)`,
    );
  }
}

cetak('=== ASSERTION (HARUS 0 PELANGGARAN) ===');
cetak(`pintasan bawaan diuji : ${WAJIB_DEFAULT.length} [${WAJIB_DEFAULT.join(', ')}]`);
cetak(`pelanggaran           : ${pelanggaran.length}`);
for (const p of pelanggaran) cetak(`  ${p}`);
cetak('');
cetak(`HASIL: ${gagalTotal === 0 && pelanggaran.length === 0 ? 'LULUS' : 'GAGAL'} (chord tanpa padanan perintah: ${gagalTotal}, pelanggaran assertion: ${pelanggaran.length})`);

console.log(L.join('\n'));
process.exit(gagalTotal === 0 && pelanggaran.length === 0 ? 0 : 1);



