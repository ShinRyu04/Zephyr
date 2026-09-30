import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223', { timeoutMs: 60000 });
const { cdp } = await Cdp.attach('9223', page.title);

// Pindai BANYAK layar sekaligus, bukan cuma yang terlihat sekarang.
const r = await cdp.runAsync(
  `
  const hasil = {};
  const KATA = /\\b(yang|dengan|tidak|sudah|untuk|dari|akan|bisa|harus|belum|kalau|karena|dulu|lagi|cuma|hanya|saja|pakai|bikin|udah|gak|pilih|buka|simpan|tutup|cari|jalankan|hapus|tambah|ubah|berkas|sedang|selesai|gagal|kosong|mana|tiap|lihat|kirim|nama|waktu|ukuran|jenis|isi|punya|mau|dulu|nanti|sekarang|selalu|pernah|masih|sudah)\\b/i;
  const LEWAT = /^[\\d\\s.,:%+\\-/()]*$/;   // angka saja = lewati

  function pindai(label) {
    const out = [];
    const unik = new Set();
    for (const el of qa('button, a, label, span, div, li, h1, h2, h3, h4, p, td, th, option, [role="menuitem"], [role="tab"], [role="option"], [title]')) {
      const rc = el.getBoundingClientRect();
      if (!(rc.width > 0 && rc.height > 0)) continue;
      const langsung = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
      if (!langsung || langsung.length < 4 || LEWAT.test(langsung)) continue;
      if (!KATA.test(langsung)) continue;
      if (unik.has(langsung)) continue;
      unik.add(langsung);
      out.push({ t: langsung.slice(0, 60), c: (el.className || '').toString().slice(0, 28), tag: el.tagName });
    }
    return out;
  }

  const st = window.__ZEPHYR__.getState();
  await st.setSettingsOpen(true); await wait(300);

  // 1) SEMUA section Settings
  const SETUI = window.__ZEPHYR_SETUI__;
  const sections = ['general','editor','terminal','agents','subagent','models','mcp','shortcuts','keymap','appearance','updates','about','scm','files','privacy','workspace'];
  for (const s of sections) {
    try { SETUI?.setSection?.(s); await wait(500); } catch {}
    const h = pindai(s);
    if (h.length) hasil['SET-' + s] = h;
  }

  // 2) Panel AI (chat + agent)
  await st.setSettingsOpen(false); await wait(300);
  try { window.__ZEPHYR_AI__?.setPanelOpen?.(true); } catch {}
  await wait(600);
  const ai = pindai('ai'); if (ai.length) hasil['AI'] = ai;

  // 3) Panel bawah: terminal / output / problems / debug
  try { window.__ZEPHYR_PANEL__?.setTab?.('output'); await wait(400); } catch {}
  const op = pindai('out'); if (op.length) hasil['OUTPUT'] = op;

  return hasil;
`,
  180000,
);

let total = 0;
for (const [k, v] of Object.entries(r || {})) {
  total += v.length;
  console.log(`\n== ${k} (${v.length})`);
  for (const x of v.slice(0, 14)) console.log(`   [${x.c || x.tag}] ${x.t}`);
}
console.log(`\n### TOTAL elemen Indonesia: ${total}`);
cdp.close();
