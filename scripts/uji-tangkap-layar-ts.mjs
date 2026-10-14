#!/usr/bin/env node
/*
 * Uji sisi TypeScript tangkap layar (item ZEPH-SCREENSHOT-TOOL / 151) - TANPA app.
 *
 * Yang diuji adalah KODE YANG BENAR-BENAR DIJALANKAN, bukan salinannya:
 * `src/lib/zephyrTools/kendaliJendela.ts` + `src/lib/commands.ts` di-bundle
 * esbuild, dengan modul Tauri diganti tiruan yang MEREKAM setiap `invoke`.
 * Jadi yang diperiksa di sini: perintah dipanggil berapa kali, dengan argumen
 * apa, dan apa yang dilaporkan ke model saat backend sukses/gagal.
 *
 * Kenapa tiruan Tauri: `@tauri-apps/api/core.invoke` hanya hidup di dalam
 * jendela Tauri. Kalau ia dipanggil di Node, diam-diam ia gagal - dan uji yang
 * gagal karena lingkungan tidak membuktikan apa pun tentang kontraknya.
 *
 * Kenapa store juga ditiru: membundel store asli menarik xterm + markdown +
 * AI store ke Node (bukan bagian item ini). Yang diperiksa di sini adalah jalur
 * TANGKAP; `ringkasJendela()` tetap kode asli, hanya sumber keadaannya tiruan.
 *
 * Pakai: node scripts/uji-tangkap-layar-ts.mjs     (exit 0 = semua lulus)
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const KENDALI = 'src/lib/zephyrTools/kendaliJendela.ts';
const COMMANDS = 'src/lib/commands.ts';

/* ------------------------------------------------------------------ */
/* 1. Tiruan modul Tauri: merekam setiap invoke/writeImage             */
/* ------------------------------------------------------------------ */

const STUB_TAURI = {
  '@tauri-apps/api/core': `
    export function invoke(cmd, args) {
      const log = (globalThis.__TANGKAP_LOG__ ??= []);
      log.push({ alat: 'invoke', cmd, args });
      const jawab = globalThis.__TANGKAP_JAWAB__;
      /* Satu antrean jawaban: uji yang butuh urutan berbeda mengisinya sendiri. */
      return Promise.resolve(jawab ? jawab(cmd, args) : {});
    }
    export function transformCallback() { return 0; }
    export default invoke;
  `,
  '@tauri-apps/plugin-clipboard-manager': `
    export function writeImage(gambar) {
      (globalThis.__TANGKAP_LOG__ ??= []).push({ alat: 'writeImage', gambar });
      const gagal = globalThis.__TANGKAP_CLIP_GAGAL__;
      return gagal ? Promise.reject(new Error(gagal)) : Promise.resolve();
    }
    export function readText() { return Promise.resolve(''); }
    export function writeText() { return Promise.resolve(); }
  `,
  '@tauri-apps/api/image': `
    export const Image = Object.assign(function Image() {}, {
      fromPath: (path) => {
        (globalThis.__TANGKAP_LOG__ ??= []).push({ alat: 'Image.fromPath', path });
        return Promise.resolve({ path });
      },
    });
  `,
};

/* ------------------------------------------------------------------ */
/* 2. Tiruan store (keadaan bisa diubah uji lewat globalThis)          */
/* ------------------------------------------------------------------ */

const STUB_STORE = {
  '../store': `
    const k = () => (globalThis.__ZEPHYR_UJI_KEADAAN__ ??= {});
    export const useStore = {
      getState: () => ({
        workspace: k().workspace ?? 'D:/Zephyr',
        tabs: k().tabs ?? [{ id: 't1', path: 'D:/Zephyr/src/lib/commands.ts' }],
        activeTabId: k().activeTabId ?? 't1',
        settingsOpen: k().settingsOpen ?? true,
        sidebarVisible: true,
        settings: k().settings ?? {
          general: { theme: 'dark', fontSize: 13, uiLang: 'id', defaultTerminal: 'shell', restoreSession: true },
        },
        setActivity() {}, setSettingsOpen() {}, toggleSidebar() {},
      }),
    };
  `,
  '../panelStore': `
    export const usePanel = {
      getState: () => ({ activeTab: 'problems', visibleTabs: ['problems', 'terminal'], focusTab() {} }),
    };
  `,
  '../settingsStore': `
    export const useSettingsUi = { getState: () => ({ section: 'general', setSection() {} }) };
  `,
  '../terminalStore': `
    const tab = { id: 'tab-1', title: 'shell', layout: 'grid', panes: [{ id: 'pane-1' }], activePaneId: 'pane-1' };
    export const useTerminal = {
      getState: () => ({
        terminalTabs: [tab], activeTabId: 'tab-1', visible: true, terminalError: null,
        addPane: async () => 'pane-2', closePane: async () => {}, setLayout() {},
        setActiveTab() {}, newTab: () => 'tab-2', setVisible() {}, allPanes: () => [tab.panes[0]],
      }),
    };
  `,
  '../commandRegistry': `
    export function findCommand() { return true; }
    export function runCommand() { return Promise.resolve(true); }
  `,
};

const pluginTiruan = {
  name: 'tiruan-tauri',
  setup(b) {
    b.onResolve({ filter: /^@tauri-apps\// }, (a) => ({ path: a.path, namespace: 'tauri-tiruan' }));
    b.onLoad({ filter: /.*/, namespace: 'tauri-tiruan' }, (a) => {
      const isi = STUB_TAURI[a.path];
      if (!isi) return { errors: [{ text: `tidak ada tiruan untuk ${a.path}` }] };
      return { contents: isi, loader: 'js' };
    });
    b.onResolve({ filter: /^\.\.\/(store|panelStore|settingsStore|terminalStore|commandRegistry)$/ }, (a) => ({
      path: a.path,
      namespace: 'toko-tiruan',
    }));
    b.onLoad({ filter: /.*/, namespace: 'toko-tiruan' }, (a) => ({ contents: STUB_STORE[a.path], loader: 'js' }));
    /* Impor dinamis di commands.ts yang tidak pernah dipanggil jalur tangkap:
       dibiarkan eksternal supaya graf AI/rules tidak ikut masuk ke sini. */
    b.onResolve({ filter: /^\.\/(rulesRuntime|rulesEngine|aiStore)$/ }, () => ({ external: true }));
  },
};

const dir = mkdtempSync(join(tmpdir(), 'uji-tangkap-ts-'));
const keluar = join(dir, 'kendaliJendela.mjs');
await build({
  absWorkingDir: AKAR,
  entryPoints: [KENDALI],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: keluar,
  logLevel: 'silent',
  plugins: [pluginTiruan],
});
const M = await import('file:///' + keluar.replace(/\\/g, '/') + '?v=' + Date.now());

/* ------------------------------------------------------------------ */
/* 3. Harness                                                          */
/* ------------------------------------------------------------------ */

let lulus = 0;
let total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`);
  } else {
    console.log(`  GAGAL ${nama}  [${bukti}]`);
  }
};

const catat = () => globalThis.__TANGKAP_LOG__ ?? [];
const reset = (jawab, opsi = {}) => {
  globalThis.__TANGKAP_LOG__ = [];
  globalThis.__TANGKAP_JAWAB__ = jawab;
  globalThis.__TANGKAP_CLIP_GAGAL__ = opsi.clipGagal;
  globalThis.__ZEPHYR_UJI_KEADAAN__ = {};
};
const invokeKe = () => catat().filter((x) => x.alat === 'invoke');
const POLA_GENERIK = /tidak mengembalikan path berkas/;

/* 1. Bendera build menyala (sisi Rust sudah terdaftar). */
cek('TANGKAP_LAYAR_TERSEDIA === true', M.TANGKAP_LAYAR_TERSEDIA === true, M.TANGKAP_LAYAR_TERSEDIA);

/* 2. Laporan menyebut SIAP, bukan "belum tersedia". */
const laporan = M.laporanTangkapLayar();
cek('laporanTangkapLayar() menyebut siap', /siap/i.test(laporan), laporan.slice(0, 60));
cek('laporanTangkapLayar() tidak lagi bilang belum didukung', !/belum didukung|BELUM didukung/i.test(laporan), /belum didukung/i.test(laporan));
cek('laporan menyebut pintasannya', laporan.includes(M.PINTASAN_TANGKAP_LAYAR), M.PINTASAN_TANGKAP_LAYAR);

/* 3. Perintah dipanggil TEPAT SEKALI dengan { target, savePath } saja. */
reset(() => ({ berhasil: true, path: 'C:/x/a.png', width: 1536, height: 960, bytes: 4425043 }));
const sukses = await M.tangkapJendela({ path: 'C:/x/a.png' });
const panggilan = invokeKe();
cek('invoke dipanggil tepat sekali', panggilan.length === 1, panggilan.length);
cek('nama perintah = window_capture', panggilan[0]?.cmd === 'window_capture', panggilan[0]?.cmd);
cek(
  'argumen hanya { args: { target, savePath } }',
  JSON.stringify(Object.keys(panggilan[0]?.args ?? {})) === '["args"]' &&
    JSON.stringify(Object.keys(panggilan[0]?.args?.args ?? {}).sort()) === '["savePath","target"]',
  JSON.stringify(panggilan[0]?.args),
);
cek('target bawaan = window', panggilan[0]?.args?.args?.target === 'window', panggilan[0]?.args?.args?.target);
cek('savePath diteruskan apa adanya', panggilan[0]?.args?.args?.savePath === 'C:/x/a.png', panggilan[0]?.args?.args?.savePath);

/* 4. Sukses: path itu yang dipakai, dan dimensi nyata ikut dilaporkan. */
cek('sukses memakai path dari hasil', sukses.includes('C:/x/a.png'), sukses.slice(0, 70));
cek('sukses melaporkan dimensi + byte', /1536x960/.test(sukses) && /4425043 byte/.test(sukses), sukses.slice(0, 90));
cek('sukses tidak mencetak undefined', !/undefined/.test(sukses), sukses.slice(0, 90));
const salin = catat().filter((x) => x.alat === 'Image.fromPath' || x.alat === 'writeImage');
cek('gambar disalin ke clipboard lewat path itu', salin.length === 2 && salin[0].path === 'C:/x/a.png', JSON.stringify(salin.map((x) => x.alat)));

/* 5. Sukses tanpa dimensi (bentuk yang sah): pesan tetap bersih. */
reset(() => ({ berhasil: true, path: 'C:/x/b.png' }));
const suksesMiskin = await M.tangkapJendela({ path: 'C:/x/b.png' });
cek('sukses tanpa width/height tetap bersih', suksesMiskin.includes('C:/x/b.png') && !/undefined/.test(suksesMiskin), suksesMiskin.slice(0, 80));

/* 6. Gagal dengan pesanGalat: pesan backend muncul APA ADANYA. */
reset(() => ({ berhasil: false, path: '', pesanGalat: 'semua cara tangkap gagal' }));
const gagalPesan = await M.tangkapJendela({ path: 'C:/x/c.png' });
cek('pesanGalat backend muncul apa adanya', gagalPesan.includes('semua cara tangkap gagal'), gagalPesan.slice(0, 90));
cek('gagal TIDAK diganti pesan generik', !POLA_GENERIK.test(gagalPesan), POLA_GENERIK.test(gagalPesan));
cek('gagal diawali "Tangkap layar GAGAL"', gagalPesan.startsWith('Tangkap layar GAGAL'), gagalPesan.slice(0, 24));

/* 7. Gagal tanpa pesanGalat: pesan generik yang jelas, menyebut perintahnya. */
reset(() => ({ berhasil: false }));
const gagalPolos = await M.tangkapJendela({ path: 'C:/x/d.png' });
cek('gagal tanpa pesanGalat -> pesan generik jelas', POLA_GENERIK.test(gagalPolos) && gagalPolos.includes('window_capture'), gagalPolos.slice(0, 110));

/* 8. Hasil kosong {}: TIDAK dianggap sukses, tak ada path palsu. */
reset(() => ({}));
const kosong = await M.tangkapJendela({ path: 'C:/x/e.png' });
cek('hasil {} tidak dianggap sukses', !kosong.includes('tersimpan') && kosong.startsWith('Tangkap layar GAGAL'), kosong.slice(0, 60));
cek('hasil {} tidak mengarang path', !/C:\/x/.test(kosong), kosong.slice(0, 110));
cek('hasil {} tetap lewat invoke sekali', invokeKe().length === 1, invokeKe().length);

/* 9. berhasil:false TETAPI path terisi: tetap GAGAL (tidak ada sukses palsu). */
reset(() => ({ berhasil: false, path: 'C:/x/palsu.png', pesanGalat: 'berkas tidak lolos verifikasi byte' }));
const bohong = await M.tangkapJendela({ path: 'C:/x/f.png' });
cek('berhasil=false dengan path terisi tetap GAGAL', bohong.startsWith('Tangkap layar GAGAL') && !bohong.includes('tersimpan'), bohong.slice(0, 80));
cek('alasan verifikasi ikut disebut', bohong.includes('tidak lolos verifikasi byte'), bohong.slice(0, 90));

/* 10. Path relatif ditolak SEBELUM invoke. */
reset(() => ({ berhasil: true, path: 'C:/x/a.png' }));
let galatRelatif = '';
try {
  await M.tangkapJendela({ path: 'gambar.png' });
} catch (e) {
  galatRelatif = e.message;
}
cek('path relatif ditolak', /harus absolut/.test(galatRelatif), galatRelatif.slice(0, 70));
cek('path relatif: invoke TIDAK dipanggil', invokeKe().length === 0, invokeKe().length);

/* 11. Path ber-'..' ditolak SEBELUM invoke. */
reset(() => ({ berhasil: true, path: 'C:/x/a.png' }));
let galatParent = '';
try {
  await M.tangkapJendela({ path: 'C:/x/../a.png' });
} catch (e) {
  galatParent = e.message;
}
cek('path ber-.. ditolak', /tidak boleh memuat '\.\.'/.test(galatParent), galatParent.slice(0, 70));
cek('path ber-..: invoke TIDAK dipanggil', invokeKe().length === 0, invokeKe().length);

/* 12. Ekstensi bukan .png ditolak SEBELUM invoke. */
reset(() => ({ berhasil: true, path: 'C:/x/a.png' }));
let galatEkstensi = '';
try {
  await M.tangkapJendela({ path: 'C:/x/a.jpg' });
} catch (e) {
  galatEkstensi = e.message;
}
cek('ekstensi bukan .png ditolak', /harus berakhir \.png/.test(galatEkstensi), galatEkstensi.slice(0, 80));
cek('ekstensi salah: invoke TIDAK dipanggil', invokeKe().length === 0, invokeKe().length);

/* 13. Target tidak dikenal ditolak SEBELUM invoke. */
reset(() => ({ berhasil: true, path: 'C:/x/a.png' }));
let galatTarget = '';
try {
  await M.tangkapJendela({ target: 'piksel-aneh' });
} catch (e) {
  galatTarget = e.message;
}
cek('target tidak dikenal ditolak', /target tangkap layar "piksel-aneh" tidak dikenal/.test(galatTarget), galatTarget.slice(0, 80));
cek('target salah: invoke TIDAK dipanggil', invokeKe().length === 0, invokeKe().length);

/* 14. Target 'screen' diteruskan apa adanya (Rust memang mendukungnya). */
reset(() => ({ berhasil: true, path: 'C:/x/s.png', width: 1536, height: 960, bytes: 10 }));
const layar = await M.tangkapJendela({ target: 'screen', path: 'C:/x/s.png' });
cek('target screen diteruskan', invokeKe()[0]?.args?.args?.target === 'screen', invokeKe()[0]?.args?.args?.target);
cek('target screen tetap sukses', layar.includes('C:/x/s.png'), layar.slice(0, 60));

/* 15. Tanpa path: savePath null (bukan string kosong) supaya Rust memakai path bawaannya. */
reset(() => ({ berhasil: true, path: 'C:/Users/Zyrex/Pictures/Zephyr/zephyr-1.png', width: 1536, height: 960, bytes: 10 }));
await M.tangkapJendela();
cek('savePath null saat tak diminta', invokeKe()[0]?.args?.args?.savePath === null, JSON.stringify(invokeKe()[0]?.args?.args?.savePath));
cek('hanya dua kunci argumen (tak ada param jaringan/telemetri)', JSON.stringify(Object.keys(invokeKe()[0]?.args?.args ?? {}).sort()) === '["savePath","target"]', JSON.stringify(invokeKe()[0]?.args?.args));

/* 16. Invoke yang melempar (mis. di luar jendela Tauri) dilaporkan, bukan dibiarkan. */
reset(() => {
  throw new Error('window.__TAURI_INTERNALS__ is undefined');
});
const ditolak = await M.tangkapJendela({ path: 'C:/x/g.png' });
cek('invoke yang melempar dilaporkan jujur', ditolak.startsWith('Tangkap layar GAGAL') && /__TAURI_INTERNALS__/.test(ditolak), ditolak.slice(0, 110));

/* 17. Clipboard gagal TIDAK membatalkan laporan path yang sudah tertulis. */
reset(() => ({ berhasil: true, path: 'C:/x/h.png', width: 1536, height: 960, bytes: 10 }), { clipGagal: 'clipboard ditolak' });
const tanpaClip = await M.tangkapJendela({ path: 'C:/x/h.png' });
cek('gagal salin clipboard tetap melaporkan path', tanpaClip.includes('C:/x/h.png') && /gagal menyalin ke clipboard/.test(tanpaClip), tanpaClip.slice(0, 100));

/* 18. salin:false tidak menyentuh clipboard. */
reset(() => ({ berhasil: true, path: 'C:/x/i.png', width: 1536, height: 960, bytes: 10 }));
const tanpaSalin = await M.tangkapJendela({ path: 'C:/x/i.png', salin: false });
cek('salin:false tidak memanggil clipboard', catat().filter((x) => x.alat !== 'invoke').length === 0, catat().length);
cek('salin:false tidak mengklaim tersalin', !/tersalin ke clipboard/.test(tanpaSalin), tanpaSalin.slice(0, 90));

/* 19. Penjagaan path/target murni (aturan yang sama seperti Rust). */
cek('path UNC diterima', M.periksaPathTangkap('\\\\server\\share\\a.png') === '\\\\server\\share\\a.png', M.periksaPathTangkap('\\\\server\\share\\a.png'));
cek('path kosong = pakai path bawaan', M.periksaPathTangkap('   ') === undefined, JSON.stringify(M.periksaPathTangkap('   ')));
cek('nama perangkat ditolak (NUL.png)', /perangkat Windows/.test((() => { try { M.periksaPathTangkap('C:/x/NUL.png'); return ''; } catch (e) { return e.message; } })()), 'NUL.png');
cek('targetTangkapDikenal() mengenal window & screen', M.targetTangkapDikenal('window') && M.targetTangkapDikenal('screen') && !M.targetTangkapDikenal('layar'), M.TARGET_TANGKAP.join(','));

/* 20. Statis: jalur invoke di commands.ts tidak punya parameter jaringan. */
const srcCommands = readFileSync(join(AKAR, COMMANDS), 'utf8');
const awalCapture = srcCommands.indexOf('export const captureWindow');
const blokCapture = srcCommands.slice(awalCapture, srcCommands.indexOf('\nexport ', awalCapture + 10));
cek('captureWindow() hanya mengirim { args }', /invoke<HasilTangkapLayar>\(NAMA_PERINTAH_TANGKAP, \{\s*args:/.test(blokCapture), blokCapture.replace(/\s+/g, ' ').trim().slice(0, 110));
cek('captureWindow() tanpa fetch/url/telemetri', !/fetch\(|https?:\/\/|telemetri|token|endpoint/i.test(blokCapture), 'bersih');

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
