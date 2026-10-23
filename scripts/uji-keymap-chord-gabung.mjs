#!/usr/bin/env node
/*
 * scripts/uji-keymap-chord-gabung.mjs
 * ZEPH-KEYMAP-MERGE-SATU-CHORD - chord kembar digabung jadi satu entri + alias.
 *
 * Masalah yang diuji
 * ------------------
 * Dua pintasan atau lebih bisa memakai SATU chord yang sama. Sebelum ini chord
 * kembar cuma hidup berdampingan (dua baris, satu chord) dan yang kalah di
 * konteks yang sama tertutup diam-diam. Yang diuji di sini: sesudah digabung
 *
 *   1. tiap chord muncul SEKALI di tabel efektif,
 *   2. tiap nama pintasan LAMA tetap bisa dicari (alias),
 *   3. jumlah jalan masuk TIDAK turun (gate superset; hilang = MERAH),
 *   4. urutannya deterministik (dua kali bangun = sama), dan
 *   5. chord yang benar-benar tidak bisa digabung (satu chord, dua aksi,
 *      konteks SAMA) DILAPORKAN sebagai temuan - bukan didiamkan, bukan dihapus.
 *
 * Cara menguji
 * ------------
 * Fungsi yang diuji adalah fungsi ASLI dari `src/lib/keybindings.ts`, bukan
 * salinan: berkas itu dibundel dengan esbuild ke folder scratch (pola yang sama
 * dengan `scripts/uji-keymap-live.mjs`) lalu diimpor. Untuk skenario "paket
 * terpasang", chord paket keymap dibaca dari berkas Rust tempat katalognya
 * di-embed (Vim/Emacs/JetBrains: `src-tauri/src/ext_bundled_extra.rs`, Sublime:
 * `src-tauri/src/ext_bundled.rs`) dan dimasukkan lewat `mergeBindings` yang sama
 * seperti runtime - jadi angka kembarnya angka nyata aplikasi ini.
 *
 * Pemakaian: node scripts/uji-keymap-chord-gabung.mjs [root-repo]
 * Keluar   : 0 = semua kasus lulus, 1 = ada kasus MERAH.
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
const urut = (xs) => [...xs].sort((a, b) => a.localeCompare(b));

/* ───────────────────── bundel modul ASLI (esbuild) ──────────────────────── */

function siapkanBundel() {
  const bin = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (!fs.existsSync(bin)) return { ok: false, alasan: `esbuild tidak ada di ${bin}` };
  const f = 'src/lib/keybindings.ts';
  if (!fs.existsSync(path.join(ROOT, f))) return { ok: false, alasan: `berkas ${f} tidak ada` };
  fs.mkdirSync(SCRATCH, { recursive: true });
  const rootFwd = ROOT.replace(/\\/g, '/');
  const entry = path.join(SCRATCH, 'entry-chord-gabung.ts');
  const out = path.join(SCRATCH, 'chord-gabung.bundle.mjs');
  fs.writeFileSync(
    entry,
    [
      `export {`,
      `  DEFAULT_BINDINGS, mergeBindings, normalizeChord, resolveBinding, chordConflicts,`,
      `  gabungChordKembar, tabelEfektif, entriChord, cariPintasan, resolveChord,`,
      `} from '${rootFwd}/src/lib/keybindings.ts';`,
      `export { perintahKeymap } from '${rootFwd}/src/lib/keymapAlias.ts';`,
      '',
    ].join('\n'),
  );
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

/* ───────────────── paket keymap nyata dari berkas Rust ──────────────────── */

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

function bacaPaket() {
  const RS = ['src-tauri/src/ext_bundled_extra.rs', 'src-tauri/src/ext_bundled.rs'];
  const consts = new Map();
  const asal = new Map();
  const tabel = new Map();
  for (const f of RS) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    const src = baca(f);
    for (const [k, v] of rawConsts(src)) {
      consts.set(k, v);
      asal.set(k, f);
    }
    for (const [p, c] of tabelBundel(src)) if (!tabel.has(p)) tabel.set(p, c);
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
      if (json.every((b) => b && typeof b === 'object' && 'key' in b && 'command' in b)) {
        berkasChord.set(nama, json);
      }
      continue;
    }
    if (json && json.contributes && Array.isArray(json.contributes.keymaps)) manifes.push({ nama, json });
  }
  const paket = [];
  for (const mf of manifes) {
    for (const km of mf.json.contributes.keymaps) {
      const pth = String(km.path ?? '').replace(/^\.\//, '');
      let target = tabel.get(pth);
      if (!target || !berkasChord.has(target)) target = `${mf.nama}_JSON`;
      const chords = berkasChord.get(target);
      if (!chords) continue;
      paket.push({
        id: mf.json.id ?? mf.nama,
        nama: mf.json.name ?? mf.nama,
        chords: chords.map((b) => ({ key: String(b.key), command: String(b.command) })),
      });
    }
  }
  return paket;
}

/* ───────────────────────── gerbang & hitung independen ──────────────────── */

/* Hitungan naif dari baris mentah - pembanding independen untuk angka laporan. */
function kembarNaif(rows) {
  const peta = new Map();
  for (const r of rows) {
    if (!peta.has(r.chord)) peta.set(r.chord, []);
    peta.get(r.chord).push(r.command);
  }
  const kembar = [...peta].filter(([, cs]) => cs.length > 1);
  return {
    baris: rows.length,
    chord: peta.size,
    kembar: kembar.map(([chord, cs]) => ({ chord, commands: cs })),
    nama: uniq(rows.map((r) => r.command)),
  };
}

/*
 * Gerbang superset: jumlah jalan masuk nama tidak boleh turun dan tiap nama
 * sebelum harus masih ketemu sesudah. Dipakai juga untuk kontrol negatif.
 */
function gerbangSuperset(namaSebelum, tabel) {
  const namaSesudah = uniq(tabel.flatMap((e) => e.alias.map((a) => a.command)));
  const setSesudah = new Set(namaSesudah);
  const hilang = urut(namaSebelum.filter((n) => !setSesudah.has(n)));
  return {
    namaSebelum: urut(namaSebelum),
    namaSesudah: urut(namaSesudah),
    hilang,
    lulus: hilang.length === 0 && namaSesudah.length >= namaSebelum.length,
  };
}

/* ────────────────────────────── kerangka uji ─────────────────────────────── */

const L = [];
const cetak = (...a) => L.push(a.join(' '));
let lulus = 0;
let gagal = 0;

function kasus(no, judul, aksi) {
  const masalah = [];
  const infoArr = [];
  const info = (s) => infoArr.push(String(s));
  try {
    aksi(info, masalah);
  } catch (e) {
    masalah.push(`EKSEPSI: ${e && e.stack ? String(e.stack).split('\n')[0] : String(e)}`);
  }
  const ok = masalah.length === 0;
  if (ok) lulus++;
  else gagal++;
  cetak(`${ok ? 'LULUS' : 'MERAH'}  #${no} ${judul}`);
  for (const i of infoArr) cetak(`      ${i}`);
  for (const m of masalah) cetak(`      > ${m}`);
  return ok;
}

function samakan(masalah, label, dapat, harap) {
  if (JSON.stringify(dapat) !== JSON.stringify(harap)) {
    masalah.push(`${label}: dapat ${JSON.stringify(dapat)} != harap ${JSON.stringify(harap)}`);
  }
}

/* ───────────────────────────── jalankan ──────────────────────────────────── */

const b = siapkanBundel();
if (!b.ok) {
  console.log(`TIDAK BISA JALAN: ${b.alasan}`);
  process.exit(1);
}

let mod;
try {
  mod = await import(pathToFileURL(b.berkas).href);
} catch (e) {
  console.log(`TIDAK BISA JALAN: bundel dibuat tapi impor gagal: ${e.message}`);
  process.exit(1);
}

const {
  DEFAULT_BINDINGS,
  mergeBindings,
  normalizeChord,
  resolveBinding,
  chordConflicts,
  gabungChordKembar,
  tabelEfektif,
  entriChord,
  cariPintasan,
  resolveChord,
  perintahKeymap,
} = mod;

const rowsDari = (bs) =>
  bs
    .map((x) => ({ chord: normalizeChord(String(x?.chord ?? '')), command: String(x?.command ?? ''), when: x?.when }))
    .filter((r) => r.chord && r.command);

const paket = bacaPaket();
const extSemua = paket.flatMap((p) => p.chords.map((c) => ({ key: c.key, command: c.command, source: p.id })));

const bindBawaan = mergeBindings([], []);
const bindPaket = mergeBindings([], extSemua);
const rowsBawaan = rowsDari(bindBawaan);
const rowsPaket = rowsDari(bindPaket);

const naifBawaan = kembarNaif(rowsBawaan);
const naifPaket = kembarNaif(rowsPaket);

const gabungBawaan = gabungChordKembar(bindBawaan);
const gabungPaket = gabungChordKembar(bindPaket);

cetak('=== UJI CHORD KEMBAR (ZEPH-KEYMAP-MERGE-SATU-CHORD) ===');
cetak(`repo        : ${ROOT}`);
cetak(`bundel asli : ${b.berkas}`);
cetak(`paket keymap: ${paket.length} (${paket.map((p) => p.nama).join(', ')}) - ${extSemua.length} chord paket`);
cetak(`DEFAULT_BINDINGS: ${DEFAULT_BINDINGS.length} baris -> ${rowsBawaan.length} baris berchord`);
cetak('');

/* ── #1 angka chord kembar bawaan, dilaporkan apa adanya ── */
kasus(1, 'chord kembar bawaan terdeteksi & dilaporkan dengan angka nyata', (info, masalah) => {
  info(`baris efektif ${gabungBawaan.laporan.baris}, chord unik ${gabungBawaan.laporan.chord}, chord kembar ${gabungBawaan.laporan.jumlahKembar}, total nama ${gabungBawaan.laporan.jumlahAlias}, konflik ${gabungBawaan.laporan.jumlahKonflik}`);
  for (const k of gabungBawaan.laporan.kembar) info(`kembar: ${k.chord} x${k.jumlah} -> ${k.alias.join(', ')}`);
  samakan(masalah, 'jumlah chord kembar (laporan)', gabungBawaan.laporan.jumlahKembar, naifBawaan.kembar.length);
  samakan(masalah, 'jumlah baris (laporan)', gabungBawaan.laporan.baris, rowsBawaan.length);
  samakan(masalah, 'jumlah chord unik (laporan)', gabungBawaan.laporan.chord, naifBawaan.chord);
  if (gabungBawaan.laporan.jumlahKembar < 2) {
    masalah.push(`harap >= 2 chord kembar bawaan, dapat ${gabungBawaan.laporan.jumlahKembar}`);
  }
  for (const ch of ['Ctrl+Shift+O', 'F11']) {
    if (!gabungBawaan.laporan.kembar.some((k) => k.chord === ch)) masalah.push(`${ch} tidak terdeteksi kembar`);
  }
});

/* ── #2 sesudah digabung tiap chord muncul SEKALI ── */
kasus(2, 'tabel efektif: tiap chord muncul tepat SEKALI', (info, masalah) => {
  const ch = gabungBawaan.tabel.map((e) => e.chord);
  info(`entri tabel ${ch.length}, chord unik ${new Set(ch).size}`);
  samakan(masalah, 'panjang tabel vs chord unik', ch.length, new Set(ch).size);
  samakan(masalah, 'panjang tabel vs hitungan naif', ch.length, naifBawaan.chord);
  const kosong = gabungBawaan.tabel.filter((e) => !e.chord || !e.utama);
  if (kosong.length) masalah.push(`${kosong.length} entri tanpa chord/utama`);
});

/* ── #3 tiap baris mentah tetap ada di dalam entri gabungan ── */
kasus(3, 'tidak ada baris mentah yang hilang dari entri gabungan', (info, masalah) => {
  const total = gabungBawaan.tabel.reduce((n, e) => n + e.alias.length, 0);
  info(`baris mentah ${rowsBawaan.length} -> alias di tabel ${total}`);
  samakan(masalah, 'jumlah alias vs baris', total, rowsBawaan.length);
  const hilang = [];
  for (const r of rowsBawaan) {
    const e = gabungBawaan.tabel.find((x) => x.chord === r.chord);
    if (!e || !e.alias.some((a) => a.command === r.command)) hilang.push(`${r.chord} ${r.command}`);
  }
  if (hilang.length) masalah.push(`${hilang.length} baris hilang: ${hilang.slice(0, 6).join('; ')}`);
});

/* ── #4 gerbang superset nama: sebelum <= sesudah ── */
kasus(4, 'gerbang superset: jumlah nama sebelum <= sesudah, 0 hilang', (info, masalah) => {
  const g = gerbangSuperset(naifBawaan.nama, gabungBawaan.tabel);
  info(`nama sebelum ${g.namaSebelum.length} -> sesudah ${g.namaSesudah.length}; hilang ${g.hilang.length}`);
  if (!g.lulus) masalah.push(`gerbang MERAH: hilang=${g.hilang.join(', ') || '-'}`);
  samakan(masalah, 'nama sesudah vs sebelum', g.namaSesudah.length, g.namaSebelum.length);
});

/* ── #5 tiap nama lama bisa dicari lewat loker alias ── */
kasus(5, 'tiap nama pintasan lama tetap bisa dicari (alias)', (info, masalah) => {
  const takKetemu = [];
  for (const n of naifBawaan.nama) {
    const e = cariPintasan(n, bindBawaan);
    if (!e || !e.alias.some((a) => a.command === n)) takKetemu.push(n);
  }
  info(`dicari ${naifBawaan.nama.length} nama, tak ketemu ${takKetemu.length}`);
  if (takKetemu.length) masalah.push(`nama tak bisa dicari lagi: ${takKetemu.slice(0, 8).join(', ')}`);
  const viaChord = cariPintasan('Ctrl+Shift+O', bindBawaan);
  samakan(masalah, 'cari lewat chord kembar', viaChord ? viaChord.alias.map((a) => a.command) : null, ['file.openFolder', 'editor.gotoSymbol']);
  const viaAlias = cariPintasan('editor.gotoSymbol', bindBawaan);
  samakan(masalah, 'cari lewat nama alias', viaAlias ? viaAlias.chord : null, 'Ctrl+Shift+O');
});

/* ── #6 penggabungan tidak mengubah chord mana memicu apa ── */
kasus(6, 'resolveChord == resolveBinding untuk semua chord x semua konteks', (info, masalah) => {
  const ctxs = [
    ['global', new Set(['global'])],
    ['editorFocus', new Set(['global', 'editorFocus'])],
    ['terminalFocus', new Set(['global', 'terminalFocus'])],
    ['debugActive', new Set(['global', 'debugActive'])],
    ['semua', new Set(['global', 'editorFocus', 'terminalFocus', 'debugActive'])],
  ];
  const beda = [];
  let dicek = 0;
  for (const bs of [bindBawaan, bindPaket]) {
    const tabel = tabelEfektif(bs);
    for (const e of tabel) {
      for (const [nama, set] of ctxs) {
        dicek++;
        const lama = resolveBinding(e.chord, bs, set);
        const baru = resolveChord(e, set);
        if ((lama?.command ?? null) !== baru) {
          beda.push(`${e.chord} ctx=${nama}: ${lama?.command ?? 'null'} != ${baru ?? 'null'}`);
        }
      }
    }
  }
  info(`${dicek} kombinasi chord x konteks diuji (2 tabel: bawaan + paket), beda ${beda.length}`);
  if (beda.length) masalah.push(`perilaku resolver berubah: ${beda.slice(0, 6).join('; ')}`);
});

/* ── #7 skenario paket terpasang: angka kembar nyata ── */
kasus(7, 'sesudah 4 paket keymap: chord kembar dilaporkan dengan angka nyata', (info, masalah) => {
  info(`baris ${gabungPaket.laporan.baris}, chord ${gabungPaket.laporan.chord}, kembar ${gabungPaket.laporan.jumlahKembar}, konflik ${gabungPaket.laporan.jumlahKonflik}`);
  for (const k of gabungPaket.laporan.kembar) {
    info(`kembar: ${k.chord} x${k.jumlah} -> ${k.alias.join(', ')}${k.konflik.length ? ` | BENTROK: ${k.konflik.join(', ')}` : ' | damai (when berbeda)'}`);
  }
  samakan(masalah, 'jumlah kembar (laporan vs naif)', gabungPaket.laporan.jumlahKembar, naifPaket.kembar.length);
  samakan(masalah, 'jumlah chord (laporan vs naif)', gabungPaket.laporan.chord, naifPaket.chord);
  samakan(masalah, 'jumlah alias vs baris', gabungPaket.laporan.jumlahAlias, rowsPaket.length);
  if (gabungPaket.laporan.jumlahKembar <= gabungBawaan.laporan.jumlahKembar) {
    masalah.push('paket tidak menambah chord kembar apa pun - fixture paket tampak tidak terbaca');
  }
  for (const ch of ['Ctrl+S', 'Ctrl+Shift+A']) {
    if (!gabungPaket.laporan.kembar.some((k) => k.chord === ch)) masalah.push(`${ch} (kembar dari paket) tidak terdeteksi`);
  }
});

/* ── #8 bentrok sejati (when sama) dilaporkan, bukan didiamkan ── */
kasus(8, 'bentrok tak bisa digabung (satu chord, when sama) dilaporkan sebagai temuan', (info, masalah) => {
  const tabel = [
    { chord: 'Ctrl+S', command: 'file.save', when: 'global', layer: 'app' },
    { chord: 'Ctrl+S', command: 'edit.find', when: 'global', layer: 'app', source: 'zephyr.keymap-emacs' },
  ];
  const g = gabungChordKembar(tabel);
  const e = g.tabel[0];
  const jalan = resolveBinding('Ctrl+S', tabel, new Set(['global']));
  const kalah = tabel.map((r) => r.command).filter((c) => c !== (jalan?.command ?? ''));
  info(`1 entri, ${e.alias.length} alias, utama=${e.utama}, konflik=${e.konflik.map((k) => k.command).join(', ')}`);
  info(`resolver hanya sampai perintah pertama: ${jalan?.command ?? 'null'} -> ${kalah.join(', ')} tertutup`);
  samakan(masalah, 'jumlah entri', g.tabel.length, 1);
  samakan(masalah, 'jumlah alias', e.alias.length, 2);
  samakan(masalah, 'jumlah konflik', e.konflik.length, 1);
  samakan(masalah, 'utama = perintah yang dipilih resolver', e.utama, jalan?.command);
  samakan(masalah, 'nama yang tertutup', e.konflik.map((k) => k.command), kalah);
  for (const n of ['file.save', 'edit.find']) {
    if (!e.alias.some((a) => a.command === n)) masalah.push(`"${n}" tidak ada lagi di alias (pintasan hilang)`);
  }
  info('temuan: dua aksi global di satu chord tersisa sebagai TEMUAN yang dilaporkan, bukan dihapus diam-diam');

  /* bentrok sejati pada data nyata (sesudah paket) ikut terlaporkan */
  const nyata = gabungPaket.laporan.kembar.filter((k) => k.konflik.length > 0);
  info(`data nyata: ${nyata.length} chord bentrok -> ${nyata.map((k) => `${k.chord}[${k.konflik.join(',')}]`).join(' ') || '-'}`);
  if (nyata.length === 0) masalah.push('data nyata tidak melaporkan satu pun bentrok (harap ada Ctrl+S / Ctrl+Shift+A)');
});

/* ── #9 kembar damai (when beda) tetap satu entri & dua-duanya jalan ── */
kasus(9, 'kembar damai (when berbeda): satu entri, dua-duanya tetap tercapai', (info, masalah) => {
  const e = entriChord('Ctrl+Shift+O', bindBawaan);
  const e2 = entriChord('Ctrl+Shift+O', bindBawaan);
  info(`Ctrl+Shift+O: alias ${e.alias.map((a) => `${a.command}@${a.when}`).join(' | ')}`);
  samakan(masalah, 'jumlah alias', e.alias.length, 2);
  samakan(masalah, 'konflik', e.konflik.length, 0);
  samakan(masalah, 'jalan di ctx editorFocus', resolveChord(e, new Set(['global', 'editorFocus'])), 'editor.gotoSymbol');
  samakan(masalah, 'jalan di ctx global', resolveChord(e, new Set(['global'])), 'file.openFolder');
  samakan(masalah, 'entri sama saat diminta dua kali', e, e2);
  const f11 = entriChord('F11', bindBawaan);
  samakan(masalah, 'F11 jumlah alias', f11.alias.length, 2);
  samakan(masalah, 'F11 di debugActive', resolveChord(f11, new Set(['global', 'debugActive'])), 'debug.stepInto');
  samakan(masalah, 'F11 global', resolveChord(f11, new Set(['global'])), 'window.fullscreen');
});

/* ── #10 deterministik: dua kali bangun = sama ── */
kasus(10, 'deterministik: dua kali bangun menghasilkan tabel identik', (info, masalah) => {
  const a1 = gabungChordKembar(mergeBindings([], extSemua));
  const a2 = gabungChordKembar(mergeBindings([], extSemua));
  samakan(masalah, 'tabel bangun-1 vs bangun-2', a1, a2);
  const urutChord = (t) => t.map((e) => e.chord).join('|');
  samakan(masalah, 'urutan chord bangun-1 vs bangun-2', urutChord(a1.tabel), urutChord(a2.tabel));
  info(`tabel ${a1.tabel.length} entri, urutan sama; contoh 3 chord pertama: ${a1.tabel.slice(0, 3).map((e) => e.chord).join(', ')}`);
  /*
   * Masukan DIBALIK: urutan chord ikut berubah (memang mengikuti kemunculan
   * pertama), tapi himpunan chord dan angka kembarnya tidak boleh berubah, dan
   * pemenang resolver harus tetap sama meski baris kembarnya kini terpisah.
   */
  const gabungBalik = gabungChordKembar([...bindBawaan].reverse());
  const setChord = (t) => urut(t.map((e) => e.chord));
  samakan(masalah, 'himpunan chord saat masukan dibalik', setChord(gabungBalik.tabel), setChord(gabungBawaan.tabel));
  samakan(masalah, 'jumlah kembar saat masukan dibalik', gabungBalik.laporan.jumlahKembar, gabungBawaan.laporan.jumlahKembar);
  const f11Balik = gabungBalik.tabel.find((e) => e.chord === 'F11');
  samakan(masalah, 'F11 tetap 2 alias walau barisnya terpisah', f11Balik.alias.length, 2);
  samakan(masalah, 'F11 utama tetap sama walau baris dibalik', f11Balik.utama, entriChord('F11', bindBawaan).utama);
  info(`masukan dibalik: chord ${setChord(gabungBalik.tabel).length}, kembar ${gabungBalik.laporan.jumlahKembar}, F11 utama ${f11Balik.utama}`);
});

/* ── #11 idempotent: gabung tabel yang sudah gabung = tetap sama ── */
kasus(11, 'idempotent: menggabung ulang tabel hasil gabungan tidak mengubah apa pun', (info, masalah) => {
  const ratakan = (t) => t.flatMap((e) => e.alias.map((a) => ({ chord: e.chord, command: a.command, when: a.when, layer: a.layer, source: a.source })));
  const lagi = gabungChordKembar(ratakan(gabungPaket.tabel));
  samakan(masalah, 'jumlah entri', lagi.tabel.length, gabungPaket.tabel.length);
  samakan(masalah, 'jumlah alias', lagi.laporan.jumlahAlias, gabungPaket.laporan.jumlahAlias);
  samakan(masalah, 'jumlah konflik', lagi.laporan.jumlahKonflik, gabungPaket.laporan.jumlahKonflik);
  samakan(masalah, 'chord kembar', lagi.laporan.kembar.map((k) => k.chord), gabungPaket.laporan.kembar.map((k) => k.chord));
  info(`gabung-2: ${lagi.tabel.length} entri, ${lagi.laporan.jumlahAlias} alias, ${lagi.laporan.jumlahKonflik} konflik`);
});

/* ── #12 alias juga untuk bentrok: nama yang kalah tetap bisa dicari ── */
kasus(12, 'nama yang kalah bentrok tetap bisa dicari (alias)', (info, masalah) => {
  const ctx = ['editorFocus', 'terminalFocus', 'debugActive'];
  const tabel = [
    { chord: 'Ctrl+S', command: 'file.save', when: 'global', layer: 'app' },
    { chord: 'Ctrl+S', command: 'edit.find', when: 'global', layer: 'app', source: 'zephyr.keymap-emacs' },
  ];
  const e = gabungChordKembar(tabel).tabel[0];
  const g = gerbangSuperset(uniq(tabel.map((r) => r.command)), [e]);
  info(`nama sebelum ${g.namaSebelum.join(', ')} -> sesudah ${g.namaSesudah.join(', ')}; hilang ${g.hilang.length}`);
  if (!g.lulus) masalah.push(`gerbang MERAH: ${g.hilang.join(', ')}`);
  for (const n of ['file.save', 'edit.find']) {
    if (!cariPintasan(n, tabel)) masalah.push(`"${n}" tak bisa dicari lagi`);
  }
  samakan(masalah, 'nama sesudah', g.namaSesudah, ['edit.find', 'file.save']);
  info(`konflik dilaporkan: ${e.konflik.map((k) => k.command).join(', ')}; ctx diuji ${ctx.length}`);
});

/* ── #13 kontrol negatif: gerbang memang bisa MERAH ── */
kasus(13, 'kontrol negatif: gerbang superset MERAH kalau nama dihapus', (info, masalah) => {
  /*
   * Gerbang superset harus benar-benar bisa MERAH - kalau tidak, "0 hilang" di
   * kasus #4 tidak membuktikan apa-apa. Di sini satu nama (editor.gotoSymbol,
   * alias di chord kembar Ctrl+Shift+O) dihapus paksa dari tabel, lalu gerbang
   * yang sama dijalankan lagi: harus ketahuan, dan tepat satu.
   */
  const tabelPalsu = gabungBawaan.tabel.map((e) =>
    e.chord === 'Ctrl+Shift+O' ? { ...e, alias: e.alias.filter((a) => a.command !== 'editor.gotoSymbol') } : e,
  );
  const g = gerbangSuperset(naifBawaan.nama, tabelPalsu);
  info(`dengan 1 nama dihapus paksa: gerbang ${g.lulus ? 'LULUS (salah)' : 'MERAH'}, hilang ${g.hilang.length} (${g.hilang.join(', ')})`);
  if (g.lulus) masalah.push('gerbang tidak mendeteksi nama yang dihapus paksa - gerbangnya tidak berguna');
  samakan(masalah, 'nama hilang yang terdeteksi', g.hilang, ['editor.gotoSymbol']);
});

/* ── #14 chord kembar dari paket: entri tetap sekali, dua-duanya tercapai ── */
kasus(14, 'chord kembar paket: satu entri, pemenang paket menang, bawaan tetap ada', (info, masalah) => {
  const e = entriChord('Ctrl+Shift+A', bindPaket);
  info(`Ctrl+Shift+A: ${e.alias.map((a) => `${a.command}@${a.when}(${a.source ?? 'default'})`).join(' | ')}`);
  samakan(masalah, 'jumlah alias', e.alias.length, 2);
  samakan(masalah, 'pemenang', e.utama, 'view.palette');
  samakan(masalah, 'yang tertutup', e.konflik.map((k) => k.command), ['agents.openWindow']);
  samakan(masalah, 'yang jalan', resolveChord(e, new Set(['global'])), 'view.palette');
  if (!e.alias.some((a) => a.command === 'agents.openWindow')) masalah.push('agents.openWindow hilang dari alias');
});

/* ── #15 chordConflicts konsisten dengan tabel gabungan ── */
kasus(15, 'chordConflicts (jalur runtime) sepakat dengan temuan tabel untuk SEMUA chord', (info, masalah) => {
  let dicek = 0;
  let beda = 0;
  let eksklusif = 0;
  let contoh = null;
  for (const bs of [bindBawaan, bindPaket]) {
    for (const e of tabelEfektif(bs)) {
      if (e.alias.length === 1 && bs === bindPaket) {
        eksklusif++;
        if (!contoh) contoh = e;
      }
      for (const a of e.alias) {
        dicek++;
        const dapat = chordConflicts(a.command, e.chord, a.when, bs);
        const harap = e.alias.filter((x) => x.command !== a.command && x.when === a.when).map((x) => x.command);
        if (JSON.stringify(dapat) !== JSON.stringify(harap)) {
          beda++;
          if (beda <= 3) info(`beda ${e.chord}/${a.command}: [${dapat.join(', ')}] != [${harap.join(', ')}]`);
        }
      }
    }
  }
  info(`${dicek} alias diuji pada 2 tabel (bawaan + paket), beda ${beda}; chord eksklusif sesudah paket: ${eksklusif}`);
  if (beda) masalah.push(`${beda} alias tidak sepakat dengan tabel gabungan`);
  const kosong = chordConflicts(contoh.alias[0].command, contoh.chord, contoh.alias[0].when, bindPaket);
  samakan(masalah, `chord eksklusif ${contoh.chord} -> tanpa konflik`, kosong, []);
  samakan(masalah, "chordConflicts('edit.find','Ctrl+S',global)", chordConflicts('edit.find', 'Ctrl+S', 'global', bindPaket), ['file.save']);
});

/* ── #16 alias menempel di baris runtime (bukan cuma di tabel turunan) ── */
kasus(16, 'baris runtime membawa chordAlias: nama kembar terlihat tanpa tabel', (info, masalah) => {
  const baris = bindPaket.filter((x) => (x.chordAlias ?? []).length > 0);
  info(`${baris.length} baris membawa chordAlias (chord kembar bawaan + paket)`);
  for (const x of baris) info(`  ${x.chord} ${x.command} -> ${x.chordAlias.join(', ')}`);
  const pasanganDariTabel = tabelEfektif(bindPaket)
    .filter((e) => e.alias.length > 1)
    .reduce((n, e) => n + e.alias.length, 0);
  samakan(masalah, 'jumlah baris beralias vs baris di chord kembar', baris.length, pasanganDariTabel);
  samakan(
    masalah,
    'Ctrl+S: file.save tahu ada edit.find',
    bindPaket.find((x) => x.chord === 'Ctrl+S' && x.command === 'file.save')?.chordAlias,
    ['edit.find'],
  );
  samakan(
    masalah,
    'Ctrl+S: edit.find tahu ada file.save',
    bindPaket.find((x) => x.chord === 'Ctrl+S' && x.command === 'edit.find')?.chordAlias,
    ['file.save'],
  );
  samakan(
    masalah,
    'Ctrl+Shift+O: editor.gotoSymbol tahu ada file.openFolder',
    bindBawaan.find((x) => x.chord === 'Ctrl+Shift+O' && x.command === 'editor.gotoSymbol')?.chordAlias,
    ['file.openFolder'],
  );
  const eksklusif = bindPaket.filter((x) => (x.chordAlias ?? []).length === 0).length;
  info(`baris chord eksklusif (chordAlias kosong): ${eksklusif}`);
  if (eksklusif === 0) masalah.push('semua baris dianggap beralias - penandaan tidak selektif');
});

/* ── #17 gerbang superset pada skenario paket terpasang ── */
kasus(17, 'gerbang superset pada skenario paket: sebelum <= sesudah, 0 hilang', (info, masalah) => {
  const g = gerbangSuperset(naifPaket.nama, gabungPaket.tabel);
  info(`nama unik sebelum ${g.namaSebelum.length} -> sesudah ${g.namaSesudah.length}; hilang ${g.hilang.length}`);
  info(`baris ${rowsPaket.length} -> entri chord ${gabungPaket.tabel.length} (turun ${rowsPaket.length - gabungPaket.tabel.length} karena penggabungan, bukan penghapusan)`);
  if (!g.lulus) masalah.push(`gerbang MERAH: hilang=${g.hilang.join(', ') || '-'}`);
  samakan(masalah, 'nama sesudah vs sebelum (paket)', g.namaSesudah.length, g.namaSebelum.length);
  const takKetemu = g.namaSebelum.filter((n) => {
    const e = cariPintasan(n, bindPaket);
    return !e || !e.alias.some((a) => a.command === n);
  });
  if (takKetemu.length) masalah.push(`nama paket tak bisa dicari: ${takKetemu.slice(0, 8).join(', ')}`);
});

cetak('');
cetak('=== RINGKASAN ===');
cetak(`kasus lulus : ${lulus}`);
cetak(`kasus MERAH : ${gagal}`);
const namaUnik = (t) => uniq(t.flatMap((e) => e.alias.map((a) => a.command))).length;
cetak(`nama unik   : bawaan ${namaUnik(gabungBawaan.tabel)} -> paket ${namaUnik(gabungPaket.tabel)} (tidak boleh turun)`);
cetak(`angka bawaan: chord ${gabungBawaan.laporan.chord}, kembar ${gabungBawaan.laporan.jumlahKembar}, nama ${gabungBawaan.laporan.jumlahAlias}, konflik ${gabungBawaan.laporan.jumlahKonflik}`);
cetak(`angka paket : chord ${gabungPaket.laporan.chord}, kembar ${gabungPaket.laporan.jumlahKembar}, nama ${gabungPaket.laporan.jumlahAlias}, konflik ${gabungPaket.laporan.jumlahKonflik}`);
cetak(`HASIL: ${gagal === 0 ? 'LULUS' : 'GAGAL'}`);

console.log(L.join('\n'));
process.exit(gagal === 0 ? 0 : 1);
