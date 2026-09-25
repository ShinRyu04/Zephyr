// scan-i18n.mjs — pindai teks Indonesia yang masih tampil saat UI berbahasa Inggris.
//
// Pakai:  node scripts/scan-i18n.mjs [port]
//
// Menelusuri SEMUA section Settings satu per satu, lalu membaca teks yang
// terlihat di DOM (innerText + title/aria-label/placeholder). Hasilnya
// dikelompokkan per section supaya perbaikan bisa dikerjakan bertahap.

import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';

const KATA_INDO = /\b(dipakai|untuk|yang|dengan|dari|tidak|belum|sudah|akan|bisa|saat|kalau|harus|juga|hanya|lebih|paling|biar|termuat|batas|ditumpuk|menempel|berat|halus|jelas|aktif|mati|nyala|buka|tutup|simpan|hapus|ubah|pilih|kirim|jalan|mulai|berhenti|berikutnya|sebelumnya|hasil|cari|ganti|pasang|lepas|tambah|kurang|naik|turun|kiri|kanan|bawah|penuh|kosong|baris|kolom|huruf|angka|warna|gambar|tampilan|jendela|layar|halaman|tombol|kotak|garis|titik|kata|teks|nama|isi|nilai|ukuran|jumlah|waktu|tempat|posisi|mode|pengaturan|perintah|proyek|folder|berkas|merekam|terdeteksi|kembali|selesai|menyimpan|mengubah|memilih|menjalankan|mengirim|membuka|menutup|fitur|sekali|jauh|kecil|besar|mudah|sulit|cepat|lambat|baru|lama|sering|jarang|pernah|selalu|kadang)\b/i;

const main = async () => {
  const { cdp } = await Cdp.attach(PORT);

  const hasil = await cdp.runAsync(
    `
    const kataIndo = ${KATA_INDO};
    const setLang = window.__ZEPHYR_SET__;
    await window.__ZEPHYR__.getState().applySettings({ general: { uiLang: 'en' } });
    await wait(600);

    const st = window.__ZEPHYR__.getState();
    st.setSettingsOpen(true);
    if (!st.sidebarVisible) st.toggleSidebar();
    st.setActivity('settings');
    await wait(700);

    const semua = {};
    const sections = ['general','editor','theme','shortcuts','models','agents','subagent','aiprompt','extensions','lsp','scm','mcp','security','accessibility','ssh','about'];
    for (const sec of sections) {
      setLang.ui.getState().setSection(sec);
      await wait(700);
      const set = new Set();
      const akar = document.querySelector('[data-testid="settings-page"]') || document.body;
      const walker = document.createTreeWalker(akar, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (t.length > 3 && t.length < 200 && kataIndo.test(t)) {
          if (!/^[\\\\/\\w.:-]+$/.test(t) && !t.includes('http') && !t.includes('\\\\\\\\')) set.add(t);
        }
      }
      for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
        for (const attr of ['title','aria-label','placeholder']) {
          const v = el.getAttribute(attr);
          if (v && v.length > 3 && v.length < 200 && kataIndo.test(v)) set.add(v);
        }
      }
      if (set.size > 0) semua[sec] = [...set];
    }
    return JSON.stringify(semua);
  `,
    240000,
  );

  const data = JSON.parse(hasil);
  let total = 0;
  for (const [sec, daftar] of Object.entries(data)) {
    console.log(`\n## ${sec} (${daftar.length})`);
    for (const t of daftar) console.log(`   ${t}`);
    total += daftar.length;
  }
  console.log(`\n== total: ${total} teks Indonesia ==`);
  cdp.close();
};

main().catch((e) => {
  console.error('scan-i18n error:', e.message ?? e);
  process.exitCode = 1;
});
