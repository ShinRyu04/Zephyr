#!/usr/bin/env node
/*
 * Harness perilaku anak-agen Zephyr — LAMA-a1 (subset tool per tugas),
 * LAMA-a2 (pemadatan riwayat murni) dan LAMA-a4 (paksa todo di tugas berat).
 *
 * Kenapa berbentuk bundel: fungsi yang diuji hidup di modul TypeScript app
 * (`src/lib/subsetTugas.ts`, `src/lib/aiStore.ts`). Menjalankan app Tauri/Vite
 * untuk menguji fungsi murni terlalu mahal dan tidak deterministik, jadi modul
 * murninya dibundel ke CommonJS di `node_modules/.cache/zephyr-harness/` lalu
 * di-`require` dari Node. `aiStore.ts` menarik React/zustand di module scope,
 * jadi keduanya dijadikan `external` dan DOM minimal dipalsukan SEBELUM require.
 *
 * Jalankan: node scripts/uji-anak-agen.mjs [--rinci]
 * Keluar != 0 kalau ada satu pun jaminan yang gagal.
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const AKAR = path.resolve(process.cwd());
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-harness');
const require = createRequire(import.meta.url);
const RINCI = process.argv.includes('--rinci');

const esbuild = require('esbuild');

const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom/client',
  'zustand',
];
const DEFINE = {
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.MODE': '"production"',
};

function pasangDom() {
  if (globalThis.__zephyrDom) return;
  globalThis.__zephyrDom = true;
  const tak = () => {};
  const gaya = new Proxy({}, { get: () => '', set: () => true });
  const kelas = new Proxy(
    { add: tak, remove: tak, toggle: tak, contains: () => false },
    { get: (t, p) => (p in t ? t[p] : tak), set: () => true },
  );
  const el = () =>
    new Proxy(
      { style: gaya, classList: kelas },
      {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'dataset' || p === 'attributes') return {};
          if (p === 'children' || p === 'childNodes') return [];
          if (p === 'textContent' || p === 'innerHTML' || p === 'innerText' || p === 'value') return '';
          if (p === 'querySelector' || p === 'closest') return () => null;
          if (p === 'querySelectorAll') return () => [];
          if (p === 'getContext') return () => null;
          if (p === 'contains') return () => false;
          if (p === 'cloneNode') return () => el();
          if (p === 'getBoundingClientRect') return () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
          if (typeof p === 'symbol') return undefined;
          return tak;
        },
        set() {
          return true;
        },
      },
    );

  globalThis.self = globalThis;
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: el,
    createElementNS: el,
    createTextNode: el,
    createDocumentFragment: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: tak,
    removeEventListener: tak,
    documentElement: el(),
    head: el(),
    body: el(),
    fonts: { add: tak, ready: Promise.resolve() },
  };
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: globalThis.navigator ?? { userAgent: 'node', clipboard: { writeText: async () => {} } },
      configurable: true,
      writable: true,
    });
  } catch {
    /* Navigator bawaan Node sudah cukup */
  }
  globalThis.localStorage = { getItem: () => null, setItem: tak, removeItem: tak, clear: tak };
  globalThis.matchMedia = () => ({ matches: false, addEventListener: tak, removeEventListener: tak });
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame = tak;
  globalThis.getComputedStyle = () => gaya;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o ?? {}); } };
  globalThis.Image = el;
  /*
   * `aiStore.ts` reads `window.location.hash` at module load to tell whether
   * this instance runs in the #agents window (`JENDELA_AGENTS`). Node has no
   * `location`, so without this shim the bundle throws `Cannot read properties
   * of undefined (reading 'hash')` before a single test runs. An empty hash is
   * the main-window case, which is what these unit tests exercise.
   */
  globalThis.location = { hash: '', href: 'http://localhost/', search: '', pathname: '/' };
}

async function bundel(entri, nama, keluaran = 'cjs') {
  mkdirSync(CACHE, { recursive: true });
  const outfile = path.join(CACHE, `${nama}.${keluaran === 'cjs' ? 'cjs' : 'mjs'}`);
  await esbuild.build({
    entryPoints: [path.join(AKAR, entri)],
    outfile,
    bundle: true,
    format: keluaran,
    platform: 'node',
    absWorkingDir: AKAR,
    logLevel: 'silent',
    define: DEFINE,
    external: EXTERNAL,
  });
  return outfile;
}

const hasil = [];
function uji(nama, syarat, catatan) {
  hasil.push({ nama, lulus: syarat === true, catatan });
  if (RINCI) console.log(`  ${syarat === true ? 'OK  ' : 'GAGAL'} ${nama} — ${catatan}`);
}

/* ---------- fixture riwayat ---------- */

const PANJANG = 'x'.repeat(3000);

function riwayatPanjang({ tugasBelum, berkas } = {}) {
  const h = [
    { role: 'system', content: 'Kamu agen Zephyr.' },
    {
      role: 'user',
      content:
        'Bikin laporan mingguan untuk seluruh repo: perbaiki bug build, migrasi semua berkas config, lalu jalankan uji.',
    },
  ];
  for (let i = 0; i < 26; i++) {
    h.push({ role: 'assistant', content: `Langkah ${i + 1}: keputusan diambil karena log menunjukkan sebabnya. ${PANJANG}` });
    h.push({ role: 'tool', content: `hasil tool ${i + 1} ${PANJANG}` });
  }
  if (tugasBelum) {
    h.push({
      role: 'assistant',
      content: 'Rencana kerja',
      toolCalls: [
        {
          name: 'todo_write',
          args: {
            todos: [
              { content: 'migrasi berkas config', status: 'completed' },
              { content: tugasBelum, status: 'in_progress' },
            ],
          },
        },
      ],
    });
  }
  if (berkas) {
    h.push({
      role: 'assistant',
      content: 'Menyunting berkas',
      /* Nama tool harus salah satu dari ALAT_BERKAS di aiStore.ts. Dulu di sini
         tertulis 'edit', yang bukan tool nyata, jadi berkasDisentuhRiwayat()
         melewatinya dan uji "berkas ikut tercatat" gagal pada produk yang benar. */
      toolCalls: [{ name: 'write_file', args: { path: berkas } }],
    });
  }
  return h;
}

/* ---------- program ---------- */

pasangDom();
const T = require(await bundel('src/lib/subsetTugas.ts', 'uji-subset-tugas'));
const A = require(await bundel('src/lib/aiStore.ts', 'uji-ai-store'));

console.log('== HARNESS PERILAKU ANAK-AGEN (LAMA-a1 / LAMA-a2 / LAMA-a4) ==');

/* ===== LAMA-a1: subset tool per kelas tugas ===== */
/* Basis ukur = katalog nyata "tool yang dikirim selalu" (26 tool), sama seperti
   yang dipakai docs/AUDIT-TOOL-BERKAS-2026-10-14.md - angka di sini karena itu
   bisa dibandingkan langsung dengan angka audit (17/23/23/20/23/23). */
const C = require(await bundel('src/lib/zephyrTools/catalog.ts', 'uji-catalog'));
const AKTIF = [...C.TOOL_DIKIRIM_SELALU];

const KELAS_UJI = [
  { nama: 'baca', tugas: 'Baca src/lib/aiStore.ts, ringkas fungsi penyimpanan pesan' },
  { nama: 'tulis-banyak', tugas: 'Tulis 20 komponen React baru untuk halaman admin di src/components/admin' },
  { nama: 'web', tugas: 'Cari harga tiket pesawat ke Bali di web, lalu buka halaman hasilnya' },
  { nama: 'repo-wide', tugas: 'Rapikan repo: ganti nama folder, hapus berkas build, jalankan build ulang' },
];

console.log(`\n[LAMA-a1] subset tool per kelas tugas (batas ${T.BATAS_TOOL_TUGAS} tool)`);
for (const k of KELAS_UJI) {
  const daftar = T.pilihToolTugas(k.tugas, AKTIF, true);
  const intiAda = T.TOOL_INTI_TUGAS.filter((n) => AKTIF.includes(n)).every((n) => daftar.includes(n));
  uji(
    `a1/${k.nama}: <= ${T.BATAS_TOOL_TUGAS} tool`,
    daftar.length <= T.BATAS_TOOL_TUGAS,
    `${daftar.length} tool`,
  );
  uji(`a1/${k.nama}: tool inti lengkap`, intiAda, `inti=${T.TOOL_INTI_TUGAS.length}`);
  console.log(`  ${k.nama.padEnd(13)} ${String(daftar.length).padStart(2)} tool | inti ${intiAda ? 'lengkap' : 'HILANG'}`);
}

/* ===== LAMA-a4: paksa todo di tugas berat ===== */
const TINGKAT = [
  { nama: 'sangat ringan: baca', tugas: 'Baca src/lib/aiStore.ts lalu jelaskan', berat: false },
  { nama: 'ringan: ringkas', tugas: 'Ringkas isi docs/ANALISIS-TERBARU.md', berat: false },
  { nama: 'sedang: perbaiki satu bug', tugas: 'Perbaiki bug di src/lib/a.ts', berat: true },
  { nama: 'berat: banyak berkas', tugas: 'Tulis 20 komponen React baru di src/components/admin', berat: true },
  { nama: 'sangat berat: seluruh repo', tugas: 'Rapikan seluruh repo: migrasi semua berkas, hapus build, jalankan uji', berat: true },
];

console.log('\n[LAMA-a4] paksa todo pada tugas berat');
uji('a4: ambang berat punya daftar kata', T.KATA_BERAT.length >= 5, `${T.KATA_BERAT.length} kata`);
for (const t of TINGKAT) {
  const kep = T.wajibTodo(t.tugas);
  const kenapa = T.ringkasKeputusanTodo(t.tugas);
  uji(`a4/${t.nama} -> wajibTodo=${t.berat}`, kep === t.berat, kenapa);
  console.log(`  ${t.nama.padEnd(28)} wajibTodo=${kep}`);
}

/* ===== LAMA-a2: pemadatan riwayat murni ===== */
console.log('\n[LAMA-a2] pemadatan riwayat murni');
uji('a2: ambang = 0,80 x 128.000 token', A.AMBANG_PADAT_TOKEN === 102_400, `AMBANG_PADAT_TOKEN=${A.AMBANG_PADAT_TOKEN}`);
uji('a2: rasio ambang mengikuti contextBudget', A.AMBANG_PADAT_RASIO === 0.8, `rasio=${A.AMBANG_PADAT_RASIO}`);
uji('a2: ekor utuh dipinjam dari AUTO_COMPACT_KEEP', A.PADAT_SIMPAN_EKOR === 6, `ekor=${A.PADAT_SIMPAN_EKOR}`);
uji('a2: target ringkas <= 0,8 x bahan', A.RASIO_RINGKAS_TARGET <= 0.8, `target=${A.RASIO_RINGKAS_TARGET}`);

/* kasus 1: riwayat panjang, ada tugas belum selesai -> WAJIB bertahan */
const tugasWajib = 'lanjutkan migrasi berkas config di src/lib/tools/*.ts';
const h1 = riwayatPanjang({ tugasBelum: tugasWajib, berkas: 'src/lib/subsetTugas.ts' });
const r1 = A.padatkanRiwayatMurni(h1, { paksa: true, batasToken: 1000 });
const pengirim1 = r1.history.map((m) => String(m.content ?? '')).join('\n');
uji('a2/k1: riwayat panjang dipadatkan', r1.dipadatkan === true, r1.alasan);
uji('a2/k1: tugas belum selesai bertahan di daftar', r1.tugasBelum.includes(tugasWajib), `${r1.tugasBelum.length} item`);
uji('a2/k1: tugas belum selesai dikirim ulang ke model', pengirim1.includes(tugasWajib), 'kutipan ada di riwayat hasil');
uji('a2/k1: hasil lebih kecil dari aslinya', r1.sesudah < r1.sebelum, `${r1.sebelum} -> ${r1.sesudah} token`);
uji('a2/k1: berkas yang digarap ikut tercatat', r1.berkas.includes('src/lib/subsetTugas.ts'), r1.berkas.join(', '));
uji('a2/k1: pesan system tetap di depan', r1.history[0]?.role === 'system', `role0=${r1.history[0]?.role}`);

/* kasus 2: riwayat panjang, tugas belum selesai hanya berupa checkbox di teks */
const h2 = riwayatPanjang({ berkas: 'docs/laporan.md' });
h2.splice(3, 0, { role: 'assistant', content: 'Rencana:\n- [x] siapkan\n- [ ] perbaiki sisa uji\n- [ ] hapus berkas build' });
const r2 = A.padatkanRiwayatMurni(h2, { paksa: true, batasToken: 1000 });
const pengirim2 = r2.history.map((m) => String(m.content ?? '')).join('\n');
uji('a2/k2: item "perbaiki sisa uji" dari checkbox bertahan', r2.tugasBelum.includes('perbaiki sisa uji'), `${r2.tugasBelum.length} item`);
uji('a2/k2: item "hapus berkas build" bertahan', r2.tugasBelum.includes('hapus berkas build'), pengirim2.includes('hapus berkas build') ? 'dikirim ulang' : 'TIDAK dikirim');

/* kasus 3: riwayat di bawah ambang -> tidak disentuh sama sekali */
const h3 = riwayatPanjang().slice(0, 6);
const r3 = A.padatkanRiwayatMurni(h3);
uji('a2/k3: riwayat di bawah ambang tidak dipadatkan', r3.dipadatkan === false, r3.alasan);
uji('a2/k3: riwayat dikembalikan apa adanya', r3.history.length === h3.length && r3.history.every((m, i) => m === h3[i]), `${r3.history.length} pesan utuh`);

/* kasus tambahan: riwayat pendek tapi dipaksa -> bahan ekor dilindungi */
const r4 = A.padatkanRiwayatMurni(h3, { paksa: true });
uji('a2/k4: paksa pada riwayat terlalu pendek ditolak dengan alasan', r4.dipadatkan === false, r4.alasan);

/* ===== laporan ===== */
const gagal = hasil.filter((h) => !h.lulus);
console.log(`\nkasus: ${hasil.length}, lulus: ${hasil.length - gagal.length}, gagal: ${gagal.length}`);
if (gagal.length) {
  console.log('\nyang GAGAL:');
  for (const g of gagal) console.log(`  - ${g.nama} — ${g.catatan}`);
  console.log('\nHASIL: GAGAL');
  process.exitCode = 1;
} else {
  console.log('\nHASIL: LULUS — subset <= 20 + inti lengkap, tugas belum selesai bertahan, todo dipaksa di tugas berat');
}

if (process.env.ZEPHYR_HARNESS_SIMPAN_CACHE !== '1') {
  try {
    rmSync(CACHE, { recursive: true, force: true });
  } catch {
    /* cache boleh tinggal kalau gagal dihapus */
  }
}
