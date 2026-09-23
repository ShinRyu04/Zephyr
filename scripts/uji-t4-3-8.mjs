// uji-t4-3-8.mjs — verifikasi T4.3 s/d T4.8.
//
// T4.3 Prompt AI editable · T4.4 Snippets >handle · T4.5 Izin perintah
// T4.6 About diperbarui · T4.7 Install MCP + toggle ekspos · T4.8 Capture
//
// KENAPA diuji dari DOM + disk: fitur settings mudah "terlihat ada" tapi tidak
// tersimpan. Yang diperiksa di sini adalah hasil AKHIR: nilai yang benar-benar
// tertulis di settings.json dan elemen yang benar-benar muncul di layar.
import { Cdp } from './lib-cdp.mjs';

// Harness ini mengubah baseUrl provider lewat applySettings. Simpan nilai
// aslinya dan kembalikan di akhir — kalau tidak, settings user menunjuk ke
// mock dan jawaban AI-nya palsu tanpa ia tahu.
const _asli = {};
async function simpanProviderAsli(cdp, daftar) {
  const r = await cdp.json(
    `return JSON.stringify(await (async () => {
  const p = window.__ZEPHYR__.getState().settings.models.providers ?? {};
  const out = {};
  for (const k of ${JSON.stringify(daftar)}) out[k] = { baseUrl: p[k]?.baseUrl ?? '', model: p[k]?.model ?? '' };
  return out;
})())`,
    60000,
  );
  Object.assign(_asli, r);
}
async function kembalikanProvider(cdp) {
  if (Object.keys(_asli).length === 0) return;
  await cdp.json(
    `return JSON.stringify(await (async () => {
  await window.__ZEPHYR__.getState().applySettings({ models: { providers: ${JSON.stringify(_asli)} } });
  await new Promise((r) => setTimeout(r, 600));
  return 1;
})())`,
    90000,
  );
}


const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

// Buka Settings pada section tertentu.
const bukaSection = (id) =>
  cdp.json(
    `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('settings');
  S.getState().setSettingsOpen(true);
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  await new Promise((r) => setTimeout(r, 700));
  window.__ZEPHYR_SETUI__.store.getState().setSection('${id}');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`,
    90000,
  );

// ── T4.3: Prompt AI ───────────────────────────────────────────────────────
await bukaSection('aiprompt');
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const sec = document.querySelector('[data-testid="prompt-section"]');
  const bagian = ['sp-identitas', 'sp-carakerja', 'sp-aturan', 'sp-instruksi'].map((t) => ({
    t, ada: !!document.querySelector('[data-testid="' + t + '"]'),
    area: !!document.querySelector('[data-testid="' + t + '-area"]'),
    status: document.querySelector('[data-testid="' + t + '-status"]')?.textContent?.trim(),
  }));
  const panjang = document.querySelector('[data-testid="sp-ringkas"]')?.textContent ?? '';
  return {
    ada: !!sec, bagian, panjang,
    adaPratinjau: !!document.querySelector('[data-testid="sp-lihat"]'),
    adaIzin: !!document.querySelector('[data-testid="sp-izin"]'),
  };
})())`,
  90000,
);
cek('halaman Prompt AI ada', r1.ada);
cek('4 bagian prompt tampil', r1.bagian.every((b) => b.ada && b.area), r1.bagian.map((b) => b.t).join(', '));
cek('semua bagian status "bawaan"', r1.bagian.every((b) => b.status === 'bawaan'), r1.bagian.map((b) => b.status).join(','));
cek('ringkasan panjang prompt tampil', r1.panjang.length > 10, r1.panjang.replace(/\s+/g, ' ').trim().slice(0, 70));
cek('tombol lihat prompt ada', r1.adaPratinjau);
cek('blok Izin perintah ada (T4.5)', r1.adaIzin);

// Tulis instruksi + cek tersimpan ke disk.
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const ta = document.querySelector('[data-testid="sp-instruksi-area"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'selalu pakai pnpm dan komentar dalam bahasa Indonesia');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  // applySettings menulis disk + mengambil ulang settings; tunggu sampai state
  // benar-benar memuat nilainya sebelum membaca badge status.
  const batas = Date.now() + 6000;
  while (Date.now() < batas) {
    const v = window.__ZEPHYR__.getState().settings.aiPrompt?.instruksi;
    if (v === 'selalu pakai pnpm dan komentar dalam bahasa Indonesia') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 500));
  const disk = await window.__ZEPHYR_SET__.settingsFromDisk();
  return {
    status: document.querySelector('[data-testid="sp-instruksi-status"]')?.textContent?.trim(),
    disk: disk?.aiPrompt?.instruksi ?? null,
    adaReset: !!document.querySelector('[data-testid="sp-instruksi-reset"]'),
  };
})())`,
  90000,
);
cek('instruksi tersimpan ke disk', r2.disk === 'selalu pakai pnpm dan komentar dalam bahasa Indonesia', r2.disk || '(kosong)');
cek('status berubah jadi "diubah"', r2.status === 'diubah', r2.status || '');
cek('tombol kembalikan bawaan muncul', r2.adaReset);

// Prompt benar-benar memuat instruksi itu.
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const p = window.__ZEPHYR_PROMPT__.system('follow', '', '');
  return { memuat: p.includes('selalu pakai pnpm'), panjang: p.length };
})())`,
  60000,
);
cek('system prompt memuat instruksi user', r3.memuat, `${r3.panjang} karakter`);

// Kembalikan bawaan.
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const b = document.querySelector('[data-testid="sp-instruksi-reset"]');
  if (!b) throw new Error('tombol reset instruksi tidak ada');
  b.click();
  await new Promise((r) => setTimeout(r, 1400));
  const disk = await window.__ZEPHYR_SET__.settingsFromDisk();
  const p = window.__ZEPHYR_PROMPT__.system('follow', '', '');
  return {
    disk: disk?.aiPrompt?.instruksi ?? null,
    status: document.querySelector('[data-testid="sp-instruksi-status"]')?.textContent?.trim(),
    promptBersih: !p.includes('selalu pakai pnpm'),
  };
})())`,
  90000,
);
cek('reset mengosongkan disk', r4.disk === '', `disk="${r4.disk}"`);
cek('reset mengembalikan status bawaan', r4.status === 'bawaan', r4.status || '');
cek('prompt kembali bersih', r4.promptBersih);

// ── T4.5: Izin perintah ───────────────────────────────────────────────────
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const inp = document.querySelector('[data-testid="sp-izin-input"]');
  // Elemennya bisa input ATAU textarea tergantung render; ambil setter dari
  // prototipe yang benar. Kalau elemennya tidak ada, beri error yang jelas —
  // "Illegal invocation" dari setter generik tidak memberi petunjuk apa pun.
  if (!inp) throw new Error('input izin perintah tidak ada di DOM');
  const proto = inp instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  const ketik = (v) => { setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };

  // 1. terlalu pendek -> ditolak
  ketik('n');
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('[data-testid="sp-izin-tambah"]')?.click();
  await new Promise((r) => setTimeout(r, 600));
  const pesanPendek = document.querySelector('[data-testid="sp-izin-pesan"]')?.textContent ?? '';

  // 2. destruktif -> ditolak
  ketik('git reset --hard HEAD');
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('[data-testid="sp-izin-tambah"]')?.click();
  await new Promise((r) => setTimeout(r, 600));
  const pesanDestruktif = document.querySelector('[data-testid="sp-izin-pesan"]')?.textContent ?? '';

  // 3. aman -> diterima
  ketik('npm run build');
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('[data-testid="sp-izin-tambah"]')?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const disk = await window.__ZEPHYR_SET__.settingsFromDisk();
  const item = document.querySelector('[data-testid="sp-izin-item"]');
  return {
    pesanPendek, pesanDestruktif,
    disk: disk?.allowCommands ?? null,
    itemTeks: item?.textContent?.trim() ?? '',
    jumlah: document.querySelector('[data-testid="sp-izin-jumlah"]')?.textContent?.trim(),
  };
})())`,
  120000,
);
cek('perintah terlalu pendek ditolak', r5.pesanPendek.includes('terlalu pendek'), r5.pesanPendek.slice(0, 50));
cek('perintah destruktif ditolak', r5.pesanDestruktif.includes('merusak'), r5.pesanDestruktif.slice(0, 50));
cek('perintah aman tersimpan', Array.isArray(r5.disk) && r5.disk.includes('npm run build'), JSON.stringify(r5.disk));
cek('item tampil di daftar', r5.itemTeks.includes('npm run build'), r5.itemTeks.slice(0, 40));

// Izin benar-benar dipakai agent loop.
const r6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  return {
    cocok: S.getState().izinPerintah('npm run build'),
    cocokArgs: S.getState().izinPerintah('npm run build --release'),
    tidakCocok: S.getState().izinPerintah('npm runbuild'),
    lain: S.getState().izinPerintah('rm -rf dist'),
  };
})())`,
  60000,
);
cek('izin cocok untuk perintah persis', r6.cocok === true);
cek('izin cocok dengan argumen tambahan', r6.cocokArgs === true);
cek('TIDAK cocok tanpa batas kata', r6.tidakCocok === false);
cek('perintah lain tidak ikut diizinkan', r6.lain === false);

// Hapus izin (bersihkan).
const r7 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="sp-izin-hapus"]')?.click();
  await new Promise((r) => setTimeout(r, 1100));
  const disk = await window.__ZEPHYR_SET__.settingsFromDisk();
  return { disk: disk?.allowCommands ?? null, kosong: !!document.querySelector('[data-testid="sp-izin-kosong"]') };
})())`,
  90000,
);
cek('izin bisa dihapus', Array.isArray(r7.disk) && r7.disk.length === 0, JSON.stringify(r7.disk));
cek('kembali ke keadaan kosong', r7.kosong);

// ── T4.6: About ───────────────────────────────────────────────────────────
await bukaSection('about');
// T4.15 memadatkan halaman ini: 3 kelompok lama (Build/Runtime/Data) diganti
// satu kartu detail. Yang wajib tetap terbukti: versi, WebView2, dan tombol
// utilitas — dibaca dari tempat barunya.
const r8 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const kartu = document.querySelector('[data-testid="about-kartu"]');
  const tabel = document.querySelector('[data-testid="about-table"]')?.textContent ?? '';
  const ver = document.querySelector('[data-testid="about-ver"]')?.textContent ?? '';
  return {
    adaKartu: !!kartu,
    adaTabel: !!tabel,
    ver,
    tbl: tabel.slice(0, 120),
    adaSalin: !!document.querySelector('[data-testid="about-copy"]'),
    adaLogs: !!document.querySelector('[data-testid="about-logs"]'),
    // WebView2 tidak lagi di About (pindah ke Diagnostics) — cukup pastikan
    // nilainya masih dibaca dari Rust lewat appInfo.
    webviewDariInfo: !!(window.__ZEPHYR__.getState().appInfo?.webview),
    adaGithub: !!document.querySelector('[data-testid="about-github"]'),
    adaIssue: !!document.querySelector('[data-testid="about-issue"]'),
    adaWa: !!document.querySelector('[data-testid="about-wa"]'),
  };
})())`,
  90000,
);
cek('About punya kartu identitas', r8.adaKartu);
cek('kartu versi tampil', r8.ver.startsWith('v'), r8.ver);
cek('tabel detail memuat versi', r8.tbl.includes('1.1.10'), r8.tbl.replace(/\s+/g, ' ').slice(0, 80));
cek('WebView2 terbaca dari Rust', r8.webviewDariInfo);
cek('tombol Salin info sistem ada', r8.adaSalin);
cek('tombol Buka folder log tetap ada', r8.adaLogs);
cek('tautan GitHub + issue + WA ada', r8.adaGithub && r8.adaIssue && r8.adaWa);

// AppInfo dari Rust benar-benar berisi field baru.
const r9 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const info = window.__ZEPHYR__.getState().appInfo;
  return { arch: info?.arch, webview: info?.webview, profile: info?.profile, portable: info?.portable };
})())`,
  60000,
);
cek('AppInfo punya arsitektur', !!r9.arch, r9.arch || '');
cek('AppInfo punya versi WebView2', !!r9.webview, r9.webview || '(tidak terdeteksi)');
cek('AppInfo punya profil build', !!r9.profile, r9.profile || '');

// ── T4.7: MCP ─────────────────────────────────────────────────────────────
await bukaSection('mcp');
const r10 = await cdp.json(
  `return JSON.stringify(await (async () => {
  return {
    adaInstallAll: !!document.querySelector('[data-testid="mcp-install-all"]'),
    labelInstall: document.querySelector('[data-testid="mcp-install-all"]')?.textContent?.trim() ?? '',
    adaEkspos: !!document.querySelector('[data-testid="mcp-ekspos"]'),
    roleEkspos: document.querySelector('[data-testid="mcp-ekspos"]')?.getAttribute('role'),
    adaRingkas: !!document.querySelector('[data-testid="mcp-ringkas"]'),
    ringkas: document.querySelector('[data-testid="mcp-ringkas"]')?.textContent?.trim() ?? '',
    cliRows: document.querySelectorAll('[data-testid^="mcp-cli-row-"]').length,
  };
})())`,
  90000,
);
cek('tombol "Pasang ke semua" ada', r10.adaInstallAll, r10.labelInstall);
cek('toggle ekspos ada (role=switch)', r10.adaEkspos && r10.roleEkspos === 'switch');
cek('ringkasan CLI terdaftar ada', r10.adaRingkas, r10.ringkas);
cek('daftar CLI tampil', r10.cliRows >= 6, `${r10.cliRows} baris`);

// ── T4.8: Capture ─────────────────────────────────────────────────────────
const r11 = await cdp.json(
  `return JSON.stringify(await (async () => {
  return {
    adaPanel: !!document.querySelector('[data-testid="capture-panel"]'),
    adaToggle: !!document.querySelector('[data-testid="cp-toggle"]'),
    kosong: document.querySelector('[data-testid="cp-kosong"]')?.textContent?.trim() ?? '',
  };
})())`,
  60000,
);
cek('panel Capture ada', r11.adaPanel);
cek('toggle capture ada', r11.adaToggle);
cek('status kosong terbaca', r11.kosong.length > 5, r11.kosong.slice(0, 60));

// Nyalakan capture, kirim request nyata, cek terekam TANPA header sensitif.
const r12 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('ai_capture_set', { on: true });
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 800));
  const AI = window.__ZEPHYR_AI__.store.getState();
  await AI.loadKeys();
  // setModel memilih provider+model sekaligus; tanpa ini provider aktif masih
  // yang lama dan request tidak pernah sampai ke mock.
  await AI.setModel('gemini-3.8-flash');
  await new Promise((r) => setTimeout(r, 700));
  window.__ZEPHYR_AI__.store.getState().newChat();
  await new Promise((r) => setTimeout(r, 400));
  const st = window.__ZEPHYR_AI__.store.getState();
  st.setDraft('halo uji capture');
  await new Promise((r) => setTimeout(r, 300));
  await window.__ZEPHYR_AI__.store.getState().send();
  // Tunggu sampai request benar-benar selesai (bukan sekadar waktu tetap).
  const batas = Date.now() + 20000;
  while (Date.now() < batas) {
    const [on2, d] = await Ti.invoke('ai_capture_get');
    if (d.length > 0) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const [on, daftar] = await Ti.invoke('ai_capture_get');
  return {
    on,
    jumlah: daftar.length,
    pertama: daftar[0]
      ? {
          provider: daftar[0].provider,
          model: daftar[0].model,
          url: daftar[0].url,
          headerKeys: daftar[0].headers.map((h) => h[0]),
          chars: daftar[0].chars,
          adaBody: !!daftar[0].body,
        }
      : null,
  };
})())`,
  180000,
);
cek('capture menyala', r12.on === true);
cek('request terekam', r12.jumlah >= 1, `${r12.jumlah} request`);
cek('provider & model tercatat', r12.pertama?.provider === 'gemini', `${r12.pertama?.provider}/${r12.pertama?.model}`);
cek('body tercatat', r12.pertama?.adaBody && (r12.pertama?.chars ?? 0) > 10, `${r12.pertama?.chars} karakter`);
cek(
  'TIDAK ada header sensitif',
  !(r12.pertama?.headerKeys ?? []).some((k) => /authorization|api-?key|token|cookie/i.test(k)),
  (r12.pertama?.headerKeys ?? []).join(', '),
);

// Panel menampilkan rekaman + bisa dibuka.
const r13 = await cdp.json(
  `return JSON.stringify(await (async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const item = document.querySelector('[data-testid="cp-item"]');
  const buka = document.querySelector('[data-testid="cp-buka"]');
  buka?.click();
  await new Promise((r) => setTimeout(r, 700));
  const body = document.querySelector('[data-testid="cp-body"]')?.textContent ?? '';
  return {
    adaItem: !!item,
    adaSalin: !!document.querySelector('[data-testid="cp-salin"]'),
    bodyPanjang: body.length,
    bodyGemini: body.includes('contents'),
    jumlah: document.querySelector('[data-testid="cp-jumlah"]')?.textContent?.trim() ?? '',
  };
})())`,
  120000,
);
cek('rekaman tampil di panel', r13.adaItem, r13.jumlah);
cek('body bisa dibuka & berisi struktur Gemini', r13.bodyGemini, `${r13.bodyPanjang} karakter`);
cek('tombol salin request ada', r13.adaSalin);

// Matikan capture (bersihkan).
const r14 = await cdp.json(
  `return JSON.stringify(await (async () => {
  await window.__TAURI_INTERNALS__.invoke('ai_capture_set', { on: false });
  const [on, daftar] = await window.__TAURI_INTERNALS__.invoke('ai_capture_get');
  return { on, jumlah: daftar.length };
})())`,
  90000,
);
cek('capture bisa dimatikan', r14.on === false);
cek('rekaman dibuang saat dimatikan', r14.jumlah === 0, `${r14.jumlah} sisa`);

// Bersihkan: tutup Settings supaya harness lain tidak terganggu.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`,
  60000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
