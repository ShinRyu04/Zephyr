import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();

  // paksa UI bahasa Inggris
  await st.applySettings({ general: { ...st.settings.general, uiLang: 'en' } });
  await wait(2000);

  const KATA = /\\b(yang|dengan|tidak|sudah|untuk|dari|akan|bisa|harus|belum|kalau|karena|dulu|lagi|cuma|hanya|saja|pakai|bikin|udah|gak|pilih|buka|simpan|tutup|cari|jalankan|hapus|tambah|ubah|keluar|masuk|berkas|berkasnya|sedang|selesai|gagal|kosong|mana|apa|siapa|kenapa|bagaimana)\\b/i;

  const out = [];
  // semua elemen teks yang terlihat
  const semua = qa('button, a, label, span, div, li, h1, h2, h3, h4, p, td, th, option, .btn, [role="menuitem"], [role="tab"]');
  const terlihat = (el) => {
    const rc = el.getBoundingClientRect();
    return rc.width > 0 && rc.height > 0 && rc.top >= 0 && rc.left >= 0;
  };
  const unik = new Set();
  for (const el of semua) {
    if (!terlihat(el)) continue;
    // hanya elemen yang teksnya langsung (bukan gabungan anak)
    const langsung = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
    if (!langsung || langsung.length < 4) continue;
    if (!KATA.test(langsung)) continue;
    if (unik.has(langsung)) continue;
    unik.add(langsung);
    out.push({ teks: langsung.slice(0, 70), tag: el.tagName, cls: el.className.toString().slice(0, 30) });
  }

  return { uiLang: window.__ZEPHYR__.getState().settings.general.uiLang, jumlah: out.length, contoh: out.slice(0, 30) };
`,
  120000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
