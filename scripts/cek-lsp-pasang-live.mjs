/*
 * GERBANG HIDUP rung 3 Blok I: aplikasi memasang language server SENDIRI.
 *
 * Kenapa ada: sampai 2026-10-13 semua baris di Settings -> Language Servers cuma
 * TEKS saran statis - tidak ada satu pun kode yang memasang apa pun. Sekarang ada
 * perintah `lsp_pasang` yang menjalankan `npm install --prefix
 * <data_dir>\lsp\<id>` dan resolver (`cari_di_slot`) mencari shim di slot itu.
 *
 * Yang diuji bukan "tombolnya ada", tapi: baris MERAH jadi HIJAU, dan berkasnya
 * benar-benar ADA DI DISK - dicek `fs.existsSync` dari node, bukan dipercaya dari
 * kata app (pelajaran dari L2 di cek-lsp-live.mjs).
 *
 * Pakai: node scripts/cek-lsp-pasang-live.mjs [port]     (default 9223)
 * Catatan: uji ini benar-benar memasang satu server (~10-40 s, butuh jaringan).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const r = reporter('lsp-pasang');
const { cdp } = await Cdp.attach(port);

const bacaTabel = () =>
  cdp.json(
    `return __ZEPHYR_LSP__.store.getState().probeAll().then(() =>
       JSON.stringify(__ZEPHYR_LSP__.katalog().map((d) => {
         const p = __ZEPHYR_LSP__.store.getState().probe[d.id] || {};
         return { id: d.id, ok: !!p.ok, exe: p.exe || null, error: p.error || null };
       })));`,
    180000,
  );

try {
  const bridge = await cdp.json(
    `return JSON.stringify({ resep: typeof __ZEPHYR_LSP__.resep, pasang: typeof __ZEPHYR_LSP__.pasang });`,
  );
  r.check(
    'P1',
    bridge.resep === 'function' && bridge.pasang === 'function',
    `bridge resep=${bridge.resep} pasang=${bridge.pasang}`,
  );

  const katalog = await cdp.json(`return JSON.stringify(__ZEPHYR_LSP__.katalog().map((d) => d.id));`);
  const resep = await cdp.json(`return __ZEPHYR_LSP__.resep().then((x) => JSON.stringify(x));`);
  const yatim = resep.filter((id) => !katalog.includes(id));
  r.check(
    'P2',
    resep.length > 0 && yatim.length === 0 && resep.includes('docker'),
    `${resep.length} id punya resep (${resep.join(',')}) | tanpa baris di halaman: ${yatim.join(',') || '-'}`,
  );

  const sebelum = await bacaTabel();
  const merah = sebelum.filter((x) => !x.ok).map((x) => x.id);
  const hijauSebelum = sebelum.filter((x) => x.ok).map((x) => x.id);
  const target = resep.find((id) => merah.includes(id)) || 'docker';
  r.check(
    'P3',
    resep.includes(target),
    `${merah.length} baris merah (${merah.join(',') || '-'}); target: ${target}` +
      (merah.includes(target) ? ' (penuh: instal dari nol)' : ' (sudah hijau: uji idempoten ulang)'),
  );

  const hasil = await cdp.json(
    `return __ZEPHYR_LSP__.pasang(${JSON.stringify(target)}).then(
       (h) => JSON.stringify(h || null),
       (e) => JSON.stringify({ tolak: String((e && e.message) || e) }));`,
    420000,
  );
  const log = String((hasil && hasil.log) || '').slice(-180).replace(/\s+/g, ' ');
  r.check(
    'P4',
    !!hasil && !hasil.tolak && hasil.ok === true && hasil.keluar === 0 && !!hasil.exe,
    `id=${target} ok=${hasil && hasil.ok} keluar=${hasil && hasil.keluar} exe=${hasil && hasil.exe}` +
      (hasil && hasil.tolak ? ` tolak=${hasil.tolak}` : ` log="${log}"`),
  );

  const exe = hasil && hasil.exe;
  const slot = String((hasil && hasil.slot) || '');
  const diDisk = !!exe && existsSync(exe);
  const dalamSlot = !!exe && slot.length > 0 && exe.toLowerCase().startsWith(slot.toLowerCase());
  r.check('P5', diDisk && dalamSlot, `berkas ada di disk: ${diDisk} | di dalam slot ${slot}: ${dalamSlot}`);

  const sesudah = await bacaTabel();
  const baris = sesudah.find((x) => x.id === target) || {};
  const dariSlot =
    !!baris.exe && slot.length > 0 && String(baris.exe).toLowerCase().startsWith(slot.toLowerCase());
  r.check('P6', baris.ok === true && dariSlot, `${target}: ok=${baris.ok} exe=${baris.exe}`);

  const hijauSesudah = sesudah.filter((x) => x.ok).map((x) => x.id);
  const hilang = hijauSebelum.filter((id) => !hijauSesudah.includes(id));
  r.check(
    'P7',
    hilang.length === 0,
    `hijau ${hijauSebelum.length} -> ${hijauSesudah.length}; yang jadi merah: ${hilang.join(',') || '-'}`,
  );

  const tolak = await cdp.json(
    `return __ZEPHYR_LSP__.pasang('swift').then(
       (h) => JSON.stringify({ h }),
       (e) => JSON.stringify({ tolak: String((e && e.message) || e) }));`,
    60000,
  );
  const pesan = String((tolak && tolak.tolak) || '');
  r.check(
    'P8',
    /no automatic install/i.test(pesan) && /lsp/i.test(pesan),
    `id tanpa resep ditolak terang-terangan: ${pesan.slice(0, 140)}`,
  );
  /*
   * P9-P11: baris hijau itu harus benar-benar BISA JALAN. Sampai sini yang
   * dibuktikan baru "berkasnya ada"; server yang tidak bisa di-spawn (mis. shim
   * tanpa ekstensi yang ditulis npm di samping `.cmd`) akan tetap lolos. Jadi
   * server benar-benar dinyalakan atas satu Dockerfile yang sengaja salah.
   *
   * Dua hal yang muncul begitu ini dicoba, dan keduanya benar:
   *  - folder yang belum dipercaya DITOLAK dengan pesan yang menyebut sebabnya
   *    (bukan gagal senyap) - itu diuji sebagai gerbang P9, bukan dilewati;
   *  - folder itu lalu dipercaya sementara, dan diakhirinya lagi di P11 supaya
   *    daftar trust milik user tidak bertambah karena uji.
   */
  const dirUji = mkdtempSync(join(tmpdir(), 'zephyr-lsp-pasang-'));
  const berkas = join(dirUji, 'Dockerfile');
  const teks = 'FROMALPINE 3.19\nRUN echo halo\n';
  writeFileSync(berkas, teks, 'utf8');

  const tolakTrust = await cdp.json(
    `return (async () => {
       const st = window.__ZEPHYR_LSP__.store.getState();
       const k = await st.ensureFor(${JSON.stringify(berkas)});
       return JSON.stringify({ kunci: k, pesan: st.lspError || null });
     })();`,
    90000,
  );
  const hidupP9 = await cdp.json(
    `return (async () => {
       const s = await window.__ZEPHYR_LSP__.status();
       return JSON.stringify(s);
     })();`,
    60000,
  );
  const hidupDiFolder = (Array.isArray(hidupP9) ? hidupP9 : []).filter((x) => {
    const t = String((x && x.root) || x);
    return t.toLowerCase().includes('zephyr-lsp-pasang');
  });
  const pesanBlok = String(tolakTrust.pesan || '');
  r.check(
    'P9',
    tolakTrust.kunci === null && hidupDiFolder.length === 0 && (!pesanBlok || /trust/i.test(pesanBlok)),
    `folder belum dipercaya -> kunci=${tolakTrust.kunci}, server=${hidupDiFolder.length}${pesanBlok ? ' | pesan: ' + pesanBlok.slice(0, 150) : ''}`,
  );

  await cdp.json(
    `return (async () => {
       window.__ZEPHYR_WS__.setTrust(${JSON.stringify(dirUji)}, true);
       return JSON.stringify('ok');
     })();`,
    30000,
  );

  const mulai = await cdp.json(
    `return (async () => {
       const st = window.__ZEPHYR_LSP__.store.getState();
       const k = await st.ensureFor(${JSON.stringify(berkas)});
       const s = await window.__ZEPHYR_LSP__.status();
       return JSON.stringify({ kunci: k, status: s, err: st.lspError || null });
     })();`,
    120000,
  );
  const hidup = (Array.isArray(mulai.status) ? mulai.status : []).filter((x) =>
    String((x && x.id) || x).includes('docker'),
  );
  r.check(
    'P9b',
    String(mulai.kunci || '').startsWith('docker') && hidup.length > 0,
    `ensureFor -> ${mulai.kunci} | hidup: ${JSON.stringify(hidup).slice(0, 170)} | ${String(mulai.err || '').slice(0, 120)}`,
  );

  await cdp.json(
    `return window.__ZEPHYR_LSP__.openDoc(${JSON.stringify(berkas)}, ${JSON.stringify(teks)}, 'dockerfile')
       .then(() => JSON.stringify('ok'));`,
    60000,
  );
  let diag = [];
  for (let i = 0; i < 25; i += 1) {
    await sleep(1000);
    diag = await cdp.json(
      `return JSON.stringify(window.__ZEPHYR_PANEL__.problems.all());`,
      30000,
    );
    if (/fromalpine|unknown instruction/i.test(JSON.stringify(diag))) break;
  }
  const pesanDiag = JSON.stringify(diag);
  r.check(
    'P10',
    /fromalpine|unknown instruction/i.test(pesanDiag),
    `diagnostik dari server yang baru dipasang: ${pesanDiag.slice(0, 230)}`,
  );

  const stop = await cdp.json(
    `return (async () => {
       await window.__ZEPHYR_LSP__.stopAll();
       window.__ZEPHYR_WS__.lupakanTrust(${JSON.stringify(dirUji)});
       const s = await window.__ZEPHYR_LSP__.status();
       return JSON.stringify(s);
     })();`,
    60000,
  );
  r.check('P11', Array.isArray(stop) && stop.length === 0, `setelah stopAll: ${JSON.stringify(stop)} | trust dicabut`);
  rmSync(dirUji, { recursive: true, force: true });
} finally {
  r.selesai();
  cdp.close();
}
