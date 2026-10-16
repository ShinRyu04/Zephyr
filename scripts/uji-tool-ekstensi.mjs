/**
 * uji-tool-ekstensi.mjs - buktikan paket ekstensi yang membawa `commands`
 * BENAR-BENAR menambah tool ke picker. Menguji jalur, bukan paket bawaan.
 *
 *   node scripts/uji-tool-ekstensi.mjs [port]
 *
 * Memasang paket uji di disk, memuat ulang ekstensi, membaca picker, lalu
 * MEMBERSIHKAN paket uji itu lagi (paket uji tidak boleh tertinggal di disk user).
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const ID = 'zephyr.uji-tool-ekstensi';
const ID_SUFFIX = 'uji-tool-ekstensi';
const EXT_DIR = join(homedir(), 'AppData', 'Roaming', 'zephyr', 'extensions', ID);

/* 1. Pasang paket uji: manifest dengan contributes.commands. */
mkdirSync(EXT_DIR, { recursive: true });
writeFileSync(
  join(EXT_DIR, 'package.json'),
  JSON.stringify(
    {
      name: ID,
      displayName: 'Uji Tool Ekstensi',
      version: '1.0.0',
      publisher: 'zephyr',
      engines: { zephyr: '*', vscode: '*' },
      main: 'main.js',
      contributes: {
        commands: [
          { command: 'uji.satu', title: 'Uji Satu', description: 'perintah uji pertama' },
          { command: 'uji.dua', title: 'Uji Dua', description: 'perintah uji kedua' },
          { command: 'uji.tiga', title: 'Uji Tiga', description: 'perintah uji ketiga' },
        ],
      },
    },
    null,
    2,
  ),
  'utf8',
);
writeFileSync(
  join(EXT_DIR, 'main.js'),
  '// Paket uji: mendaftarkan perintahnya lewat host, seperti paket sungguhan.\n' +
    'module.exports = { activate() {} };\n',
  'utf8',
);
console.log('paket uji dipasang di:', EXT_DIR);

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const el = await import('/src/lib/extLoader.ts');
  const tg = await import('/src/lib/toolGate.ts');
  const st19 = await import('/src/lib/extensionsStore19.ts');
  /* Paket harus DINYALAKAN dulu: loader melewati setiap manifest yang
     enabled:false, jadi paket yang baru dipasang memang belum menyumbang apa
     pun - itu aturan yang benar, bukan bug. Cari lewat akhiran id karena Rust
     menambahkan awalan publisher. */
  /* Store dibaca ULANG dari Rust: paket baru ditulis ke disk SESUDAH store
     terakhir dimuat, jadi daftar lama memang belum memuatnya. */
  await st19.useExt19.getState().refresh();
  const semua = st19.useExt19.getState().manifests || [];
  const uji = semua.find((m) => m.manifest && String(m.manifest.id).includes('uji-tool-ekstensi'));
  const idUji = uji && uji.manifest ? uji.manifest.id : null;
  /*
   * enabled hidup di settings.json bagian extensions.enabled dan dibaca
   * ULANG oleh Rust tiap extensions_manifests. Menulisnya lewat store lalu
   * memuat ulang daftar manifest adalah jalur yang sama dipakai UI - bukan
   * menambal state di memori, yang akan hilang pada pembacaan berikutnya.
   */
  if (idUji) {
    /* Jalur resmi UI: command Rust yang menulis settings.json lalu memuat ulang
       daftar manifest. Menambal state di memori akan hilang pada pembacaan
       berikutnya, karena Rust membaca enabled dari disk tiap kali. */
    await st19.useExt19.getState().setEnabled(idUji, true);
  }
  await el.muatSemuaEkstensi();
  const out = {};
  out.ringkasan = el.ringkasanLoader();
  out.grup = tg.grupEkstensi().map((g) => ({ label: g.label, n: g.tools.length, tools: g.tools }));
  out.nama = tg.namaToolEkstensi();
  out.semua = tg.SEMUA_TOOL.length;
  out.masuk = out.nama.every((n) => tg.SEMUA_TOOL.includes(n));
  out.bagianEkstensi = tg.SECTION_URUTAN.some((s) => s.id === 'ekstensi');
  out.idUji = idUji;
  out.semuaManifest = semua.map((m) => ({ id: m.manifest && m.manifest.id, on: m.enabled, cmd: (m.manifest && m.manifest.contributes && m.manifest.contributes.commands || []).length }));
  return out;
`);
const s = typeof r === 'string' ? JSON.parse(r) : r;

console.log('\n--- SESUDAH PAKET UJI DIPASANG ---');
console.log('commands dilaporkan loader :', s.ringkasan.commands);
console.log('kelompok di bagian EXTENSIONS:', s.grup.length);
for (const g of s.grup) console.log('   -', g.label, '->', g.n, 'tool |', g.tools.join(', '));
console.log('nama tool ekstensi          :', s.nama.length);
console.log('SEMUA_TOOL total            :', s.semua, '(49 katalog +', s.nama.length, 'ekstensi)');
console.log('tool ekstensi masuk SEMUA_TOOL:', s.masuk ? 'YA' : 'TIDAK');
console.log('bagian EXTENSIONS ada        :', s.bagianEkstensi);
console.log('id uji terdeteksi            :', s.idUji);
for (const m of (s.semuaManifest || [])) console.log('    manifest:', m.id, '| on:', m.on, '| commands:', m.cmd);

/* 2. Bersihkan: paket uji TIDAK boleh tertinggal di disk user. */
await cdp.runAsync(`
  const el = await import('/src/lib/extLoader.ts');
  await el.muatSemuaEkstensi();
  return true;
`);
rmSync(EXT_DIR, { recursive: true, force: true });
const bersih = !existsSync(EXT_DIR);
console.log('\npaket uji dibersihkan:', bersih ? 'YA' : 'TIDAK (perlu dibersihkan manual)');
await cdp.close();
