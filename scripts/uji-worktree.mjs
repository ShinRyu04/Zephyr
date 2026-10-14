#!/usr/bin/env node
/*
 * uji-worktree.mjs - harness node-only untuk tool `src/lib/zephyrTools/worktree.ts`.
 *
 * Item kanonik `zeph-git-worktree` (tambahan Ryu 2026-10-14): buat/daftar/hapus
 * git worktree dari dalam Zephyr. Sisi Rust punya uji sendiri di
 * `src-tauri/src/worktree.rs` (`cargo test --lib worktree::`); berkas ini
 * menguji SISI MODEL: apa yang benar-benar dikirim ke `invoke`, apa yang model
 * terima kembali, dan apakah tool lain tersentuh.
 *
 * Cara kerja: `worktree.ts` dibundel dengan esbuild (pola yang sama dipakai
 * `scripts/cek-cap-payload.mjs`), tapi:
 *
 *   - `@tauri-apps/api/core` diganti stub yang meneruskan tiap panggilan ke
 *     `globalThis.__invokeUji`, sehingga harness MEREKAM perintah + argumen
 *     persis, lalu mengembalikan balasan yang ditentukan uji;
 *   - `../store` diganti stub yang membaca `globalThis.__workspaceUji`, sehingga
 *     jalur "root dari folder yang terbuka" ikut diuji tanpa menjalankan app.
 *
 * NOL jaringan, nol app, nol berkas proyek disentuh: semua stub ditulis ke
 * folder sementara dan dihapus sesudahnya.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_TOOL = join(AKAR_REPO, 'src/lib/zephyrTools');
const SASARAN = join(DIR_TOOL, 'worktree.ts');

/*
 * Berkas tool LAIN yang harus TIDAK berubah karena lane ini. Jumlah nama spec
 * Jumlah nama spec dihitung dengan regex `/^\s*name:\s*'([A-Za-z0-9_]+)'/gm`
 * (baris `name: '...'` yang menjadi nama tool; dihitung equals `grep -c
 * "name: '"` untuk kelima berkas ini, jadi tidak ada `name` lain yang ikut).
 * Indentasinya berbeda antar berkas (`builtins.ts` 6 spasi, `zephyrSelf.ts` dan
 * `zephyrIngat.ts` 2 spasi), karena itu regex-nya tidak mengikat lebar indent.
 * Angka diukur 2026-10-14 di branch feat/ai-panel-vscode-layout.
 */
const BERKAS_SAUDARA = [
  ['builtins.ts', 41],
  ['mcp.ts', 14],
  ['web.ts', 11],
  ['zephyrSelf.ts', 1],
  ['zephyrIngat.ts', 1],
];
const BASELINE_TOOL_SAUDARA = BERKAS_SAUDARA.reduce((n, [, j]) => n + j, 0);
const TOLAK_PARAM_JARINGAN = ['url', 'uri', 'host', 'hostname', 'endpoint', 'port', 'headers', 'proxy'];
const REGEX_NAMA = /^\s*name:\s*'([A-Za-z0-9_]+)'/gm;

const AKAR_REPO_UJI = 'D:/repo-uji';
const JALUR_UJI = 'D:/repo-uji-cabang';
const PESAN_GAGAL_RUST =
  'worktree masih punya perubahan/BERKAS BARU yang belum di-commit: D:/repo-uji-cabang - commit atau buang dulu, atau kirim paksa=true kalau memang mau dihapus';

const hasil = [];
let nomor = 0;

function tegas(syarat, pesan) {
  if (!syarat) throw new Error(pesan);
}
function samakan(nyata, mau, pesan) {
  const a = JSON.stringify(nyata);
  const b = JSON.stringify(mau);
  if (a !== b) throw new Error(`${pesan}\n         nyata: ${a}\n         harus: ${b}`);
}
function kunci(obj) {
  return Object.keys(obj).sort();
}
function namaToolDiBerkas(namaBerkas) {
  const isi = readFileSync(join(DIR_TOOL, namaBerkas), 'utf8');
  return [...isi.matchAll(REGEX_NAMA)].map((m) => m[1]);
}

async function uji(nama, fn) {
  nomor += 1;
  const label = String(nomor).padStart(2, '0');
  try {
    await fn();
    hasil.push({ nama, lulus: true });
    console.log(`  LULUS  ${label}. ${nama}`);
  } catch (e) {
    hasil.push({ nama, lulus: false });
    console.log(`  GAGAL  ${label}. ${nama}\n         ${e.message}`);
  }
}
async function harusGagal(fn) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('seharusnya melempar galat, tapi justru berhasil');
}

/* ------------------------------------------------------------------ */
/* Bundel + stub                                                       */
/* ------------------------------------------------------------------ */

const tmp = mkdtempSync(join(tmpdir(), 'zephyr-uji-worktree-'));
const berkasStubTauri = join(tmp, 'stub-tauri.ts');
const berkasStubStore = join(tmp, 'stub-store.ts');
const berkasBundel = join(tmp, 'worktree.bundel.mjs');

writeFileSync(
  berkasStubTauri,
  [
    'export async function invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {',
    '  const f = (globalThis as any).__invokeUji;',
    "  if (typeof f !== 'function') throw new Error('stub invoke belum dipasang oleh harness');",
    '  return f(cmd, args);',
    '}',
    '',
  ].join('\n'),
);
writeFileSync(
  berkasStubStore,
  [
    'export const useStore = {',
    '  getState: () => ({',
    '    workspace: ((globalThis as any).__workspaceUji as string | null | undefined) ?? null,',
    '  }),',
    '};',
    '',
  ].join('\n'),
);

const pluginStub = {
  name: 'stub-zephyr',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.path === '@tauri-apps/api/core') return { path: berkasStubTauri };
      if (args.path === '../store') return { path: berkasStubStore };
      return null;
    });
  },
};

let mod;
try {
  await esbuild.build({
    entryPoints: [SASARAN],
    outfile: berkasBundel,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
    plugins: [pluginStub],
  });
  mod = await import(pathToFileURL(berkasBundel).href);
} catch (e) {
  console.error(`TIDAK BISA MEMBUNDEL ${SASARAN}: ${e.message}`);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const TOOL = mod.TOOL_WORKTREE;
const NAMA = mod.NAMA_TOOL_WORKTREE;
const TOOL_DAFTAR = TOOL?.find((t) => t.spec.name === 'worktree_list');
const TOOL_BUAT = TOOL?.find((t) => t.spec.name === 'worktree_add');
const TOOL_HAPUS = TOOL?.find((t) => t.spec.name === 'worktree_remove');

/* Perekam panggilan invoke + balasan yang bisa diatur uji. */
let panggilan = [];
let balasan = null;
globalThis.__invokeUji = async (cmd, args) => {
  panggilan.push({ cmd, args });
  if (typeof balasan === 'function') return balasan(cmd, args);
  return balasan ?? { berhasil: true, pesan: 'ok', data: null };
};
globalThis.__workspaceUji = null;

function bersihkanRekaman() {
  panggilan = [];
  balasan = null;
  globalThis.__workspaceUji = null;
}

/** Balasan `worktree_list` untuk repo uji: utama + satu cabang. */
function dataDaftar() {
  return {
    akar: AKAR_REPO_UJI,
    jumlah: 2,
    worktree: [
      {
        path: AKAR_REPO_UJI,
        branch: 'main',
        head: 'abcdef1234567890',
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
        isMain: true,
      },
      {
        path: JALUR_UJI,
        branch: 'uji-cabang',
        head: '0123456789abcdef',
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
        isMain: false,
      },
    ],
  };
}

console.log(`\n== uji-worktree: ${SASARAN} ==\n`);

/* ------------------------------------------------------------------ */
/* 1-3: bentuk tool + skema argumen                                    */
/* ------------------------------------------------------------------ */

await uji('tiga tool terdaftar, nama unik, urut daftar/buat/hapus', () => {
  tegas(Array.isArray(TOOL), 'TOOL_WORKTREE bukan array');
  tegas(TOOL.length === 3, `jumlah tool harus 3, nyata ${TOOL.length}`);
  const nama = TOOL.map((t) => t.spec?.name);
  samakan(nama, ['worktree_list', 'worktree_add', 'worktree_remove'], 'nama tool tidak sesuai');
  tegas(new Set(nama).size === 3, 'ada nama tool duplikat');
  samakan([...NAMA], nama, 'NAMA_TOOL_WORKTREE tidak sinkron dengan tool yang diekspor');
});

await uji('nama tool tidak bentrok dengan tool lain di folder itu', () => {
  const namaSaya = new Set(TOOL.map((t) => t.spec.name));
  const bentrok = [];
  for (const [berkas] of BERKAS_SAUDARA) {
    for (const nama of namaToolDiBerkas(berkas)) {
      if (namaSaya.has(nama)) bentrok.push(`${berkas}:${nama}`);
    }
  }
  tegas(bentrok.length === 0, `nama bentrok dengan tool lain: ${bentrok.join(', ')}`);
});

await uji('skema argumen benar: wajib, tipe, tanpa parameter jaringan', () => {
  const wajib = {
    worktree_list: [],
    worktree_add: ['path', 'branch'],
    worktree_remove: ['path'],
  };
  for (const t of TOOL) {
    const s = t.spec;
    tegas(
      typeof s?.description === 'string' && s.description.length > 40,
      `${s.name}: deskripsi terlalu pendek`,
    );
    tegas(s.parameters?.type === 'object', `${s.name}: parameters.type harus 'object'`);
    tegas(Array.isArray(s.parameters.required), `${s.name}: required harus array`);
    samakan([...s.parameters.required].sort(), [...wajib[s.name]].sort(), `${s.name}: required salah`);
    const properti = Object.entries(s.parameters.properties ?? {});
    tegas(properti.length > 0, `${s.name}: tidak punya properti`);
    for (const [k, p] of properti) {
      tegas(typeof p?.type === 'string', `${s.name}.${k}: properti tanpa tipe`);
      tegas(
        typeof p?.description === 'string' && p.description.length > 10,
        `${s.name}.${k}: tanpa deskripsi`,
      );
      tegas(
        !TOLAK_PARAM_JARINGAN.includes(k.toLowerCase()),
        `${s.name}.${k}: parameter jaringan tidak boleh ada`,
      );
    }
  }
  const tipe = (n, k) => TOOL.find((t) => t.spec.name === n).spec.parameters.properties[k].type;
  tegas(tipe('worktree_list', 'root') === 'string', 'root harus string');
  tegas(tipe('worktree_add', 'path') === 'string', 'path harus string');
  tegas(tipe('worktree_add', 'branch') === 'string', 'branch harus string');
  tegas(tipe('worktree_add', 'buatCabang') === 'boolean', 'buatCabang harus boolean');
  tegas(tipe('worktree_remove', 'path') === 'string', 'path harus string');
  tegas(tipe('worktree_remove', 'paksa') === 'boolean', 'paksa harus boolean');
});

/* ------------------------------------------------------------------ */
/* 4-6: daftar                                                         */
/* ------------------------------------------------------------------ */

await uji('daftar: invoke menerima perintah + argumen {root} SAJA', async () => {
  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: '2 worktree terdaftar untuk D:/repo-uji',
    data: dataDaftar(),
  });
  await TOOL_DAFTAR.run({ root: AKAR_REPO_UJI });

  tegas(panggilan.length === 1, `harus 1 kali invoke, nyata ${panggilan.length}`);
  samakan(panggilan[0].cmd, 'worktree_list', 'perintah Rust salah');
  samakan(panggilan[0].args, { root: AKAR_REPO_UJI }, 'argumen harus persis {root}');
  samakan(kunci(panggilan[0].args), ['root'], 'ada field asing di argumen');
});

await uji('daftar: keluaran memuat pesan Rust + jalur + cabang tiap worktree', async () => {
  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: '2 worktree terdaftar untuk D:/repo-uji',
    data: dataDaftar(),
  });
  const teks = await TOOL_DAFTAR.run({ root: AKAR_REPO_UJI });

  tegas(teks.includes('2 worktree terdaftar'), `pesan Rust hilang: ${teks}`);
  tegas(teks.includes(AKAR_REPO_UJI) && teks.includes('[main]'), `baris utama hilang: ${teks}`);
  tegas(teks.includes(JALUR_UJI) && teks.includes('[uji-cabang]'), `baris cabang hilang: ${teks}`);
  tegas(teks.includes('UTAMA'), `penanda UTAMA hilang: ${teks}`);
});

await uji('daftar tanpa root: memakai folder proyek terbuka; tanpa folder ditolak', async () => {
  bersihkanRekaman();
  globalThis.__workspaceUji = 'D:/folder-terbuka';
  balasan = () => ({
    berhasil: true,
    pesan: '1 worktree',
    data: { akar: 'D:/folder-terbuka', jumlah: 1, worktree: [] },
  });
  await TOOL_DAFTAR.run({});
  samakan(kunci(panggilan[0].args), ['root'], 'argumen harus cuma root');
  samakan(panggilan[0].args.root, 'D:/folder-terbuka', 'root harus folder yang terbuka');

  bersihkanRekaman();
  globalThis.__workspaceUji = null;
  const err = await harusGagal(() => TOOL_DAFTAR.run({}));
  tegas(/root/.test(err.message), `galat harus menyebut "root": ${err.message}`);
  tegas(panggilan.length === 0, 'tanpa folder terbuka TIDAK boleh memanggil invoke');
});

/* ------------------------------------------------------------------ */
/* 7-8: buat                                                           */
/* ------------------------------------------------------------------ */

await uji('buat tanpa cabang: mengirim buatCabang=false, tanpa field asing', async () => {
  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: 'worktree dibuat: D:/repo-uji-cabang (branch uji-cabang)',
    data: { akar: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji-cabang', buatCabang: false },
  });
  const teks = await TOOL_BUAT.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji-cabang' });

  samakan(panggilan[0].cmd, 'worktree_add', 'perintah Rust salah');
  samakan(
    panggilan[0].args,
    { root: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji-cabang', buatCabang: false },
    'argumen buat salah',
  );
  samakan(kunci(panggilan[0].args), ['branch', 'buatCabang', 'path', 'root'], 'ada field asing');
  tegas(teks.includes(JALUR_UJI), `keluaran harus menyebut folder: ${teks}`);
});

await uji('buat dengan cabang: buatCabang=true; nilai ambigu jadi false', async () => {
  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: 'worktree dibuat',
    data: { path: JALUR_UJI, branch: 'uji', buatCabang: true },
  });
  await TOOL_BUAT.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji', buatCabang: true });
  tegas(panggilan[0].args.buatCabang === true, 'buatCabang=true harus diteruskan sebagai true');

  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: 'worktree dibuat',
    data: { path: JALUR_UJI, branch: 'uji', buatCabang: false },
  });
  await TOOL_BUAT.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji', buatCabang: 'ya' });
  tegas(panggilan[0].args.buatCabang === false, 'nilai ambigu harus jadi false, bukan true');
});

/* ------------------------------------------------------------------ */
/* 9: hapus                                                            */
/* ------------------------------------------------------------------ */

await uji('hapus: paksa tersampaikan; bawaan paksa=false', async () => {
  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: 'worktree dihapus: D:/repo-uji-cabang',
    data: { path: JALUR_UJI, paksa: true, masih_ada_di_disk: false },
  });
  await TOOL_HAPUS.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, paksa: true });
  samakan(panggilan[0].cmd, 'worktree_remove', 'perintah Rust salah');
  samakan(
    panggilan[0].args,
    { root: AKAR_REPO_UJI, path: JALUR_UJI, paksa: true },
    'paksa harus tersampaikan',
  );

  bersihkanRekaman();
  balasan = () => ({
    berhasil: true,
    pesan: 'worktree dihapus',
    data: { path: JALUR_UJI, paksa: false, masih_ada_di_disk: false },
  });
  await TOOL_HAPUS.run({ root: AKAR_REPO_UJI, path: JALUR_UJI });
  samakan(
    panggilan[0].args,
    { root: AKAR_REPO_UJI, path: JALUR_UJI, paksa: false },
    'bawaan paksa harus false',
  );
});

/* ------------------------------------------------------------------ */
/* 10-12: galat                                                        */
/* ------------------------------------------------------------------ */

await uji('galat Rust {berhasil:false,pesan} muncul APA ADANYA di ketiga tool', async () => {
  const jalan = [
    ['worktree_list', () => TOOL_DAFTAR.run({ root: AKAR_REPO_UJI })],
    ['worktree_add', () => TOOL_BUAT.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, branch: 'uji' })],
    ['worktree_remove', () => TOOL_HAPUS.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, paksa: true })],
  ];
  for (const [nama, fn] of jalan) {
    bersihkanRekaman();
    balasan = () => ({ berhasil: false, pesan: PESAN_GAGAL_RUST, data: null });
    const err = await harusGagal(fn);
    tegas(
      err.message === PESAN_GAGAL_RUST,
      `${nama}: pesan harus apa adanya (tanpa awalan/tambahan)\n         nyata: ${JSON.stringify(err.message)}`,
    );
  }
});

await uji('balasan Rust tak dikenal ditolak, tidak dianggap berhasil', async () => {
  bersihkanRekaman();
  balasan = () => 'bukan objek';
  const err = await harusGagal(() => TOOL_DAFTAR.run({ root: AKAR_REPO_UJI }));
  tegas(err.message.includes('tidak dikenali'), `pesan: ${err.message}`);

  bersihkanRekaman();
  balasan = () => ({ berhasil: true });
  const err2 = await harusGagal(() => TOOL_DAFTAR.run({ root: AKAR_REPO_UJI }));
  tegas(err2.message.includes('tidak dikenali'), `balasan tanpa pesan harus ditolak: ${err2.message}`);
});

await uji('argumen wajib hilang ditolak SEBELUM invoke', async () => {
  bersihkanRekaman();
  const err = await harusGagal(() => TOOL_BUAT.run({ root: AKAR_REPO_UJI, branch: 'uji' }));
  tegas(err.message.includes('"path"'), `galat harus menyebut argumen path: ${err.message}`);
  tegas(panggilan.length === 0, 'tidak boleh memanggil invoke tanpa path');

  bersihkanRekaman();
  const err2 = await harusGagal(() => TOOL_HAPUS.run({ root: AKAR_REPO_UJI }));
  tegas(err2.message.includes('"path"'), `galat harus menyebut argumen path: ${err2.message}`);
  tegas(panggilan.length === 0, 'tidak boleh memanggil invoke tanpa path');

  bersihkanRekaman();
  const err3 = await harusGagal(() =>
    TOOL_BUAT.run({ root: AKAR_REPO_UJI, path: JALUR_UJI, branch: '  ' }),
  );
  tegas(err3.message.includes('"branch"'), `galat harus menyebut argumen branch: ${err3.message}`);
  tegas(panggilan.length === 0, 'tidak boleh memanggil invoke tanpa branch');
});

/* ------------------------------------------------------------------ */
/* 13-14: tool lain tidak boleh berubah                                 */
/* ------------------------------------------------------------------ */

await uji('jumlah nama tool di berkas lain tetap seperti baseline', () => {
  const menyimpang = [];
  for (const [berkas, mau] of BERKAS_SAUDARA) {
    const nyata = namaToolDiBerkas(berkas).length;
    if (nyata !== mau) menyimpang.push(`${berkas} ${mau} -> ${nyata}`);
  }
  tegas(
    menyimpang.length === 0,
    `berkas tool lain berubah: ${menyimpang.join(', ')} - lane ini tidak menyentuhnya (kalau lane lain memang menambah tool, perbarui baseline di berkas ini)`,
  );
});

await uji('total tool: tool lain tidak berubah, worktree.ts menambah 3', () => {
  const sebelum = BERKAS_SAUDARA.reduce((n, [, j]) => n + j, 0);
  tegas(sebelum === BASELINE_TOOL_SAUDARA, `baseline salah hitung: ${sebelum} != ${BASELINE_TOOL_SAUDARA}`);
  tegas(TOOL.length === 3, `worktree.ts harus menambah 3 tool, nyata ${TOOL.length}`);
  console.log(
    `         tool lain: ${sebelum} sebelum, ${sebelum} sesudah (sama); +${TOOL.length} dari worktree.ts = ${sebelum + TOOL.length} total`,
  );
});

/* ------------------------------------------------------------------ */

rmSync(tmp, { recursive: true, force: true });
const gagalUji = hasil.filter((h) => !h.lulus);
console.log(`\n${hasil.length - gagalUji.length} lulus / ${gagalUji.length} gagal dari ${hasil.length} kasus\n`);
process.exit(gagalUji.length === 0 ? 0 : 1);
