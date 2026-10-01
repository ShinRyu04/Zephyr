/**
 * Sapu Settings: buka tiap section satu per satu, baca semua teks + title/aria,
 * laporkan yang mengandung Indonesia. Plus cek panel Chat history.
 */
import { Cdp } from './lib-cdp.mjs';

const KATA = /\b(yang|tidak|sudah|untuk|dari|bisa|harus|belum|kalau|karena|hanya|saja|pakai|dengan|adalah|berjalan|tampilkan|sembunyikan|jalankan|simpan|tutup|hapus|ubah|berkas|selesai|gagal|kosong|mana|lihat|kirim|setiap|masih|telah|nyaman|pengaturan|perintah|catatan|riwayat|periksa|pasang|nyala|pilih|mungkin|perlu|wajib|izin|tampil|memuat|mencari|mengubah|menghapus|menambah|menutup|membuka|kembali|sekarang|biar|boleh)\b/i;

const { cdp } = await Cdp.attach('9223');
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

const SAPU = `(() => {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    if (!el.getClientRects().length) continue;
    if (el.children.length === 0) {
      const tx = (el.textContent || '').trim();
      if (tx && tx.length < 300) out.push(tx);
    }
    if (el.getAttribute) {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v && v.length < 300) out.push(v);
      }
    }
  }
  return JSON.stringify([...new Set(out)]);
})()`;

const baca = async (nama) => {
  const raw = await cdp.eval(SAPU);
  let arr = [];
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  const tem = arr.filter((x) => KATA.test(x));
  if (tem.length) console.log(`  !! ${nama}: ${tem.length} -> ` + tem.slice(0, 4).map((x) => x.slice(0, 90)).join(' || '));
  return { jumlahTeks: arr.length, temuan: tem.length };
};

const klik = (sel) => cdp.eval(`(() => { const b=${sel}; if(b) { b.click(); return true; } return false; })()`);

// 1. buka Settings lewat tombol ActivityBar
const tombol = await cdp.eval(`JSON.stringify([...document.querySelectorAll('button, .ab-item, [class*="activity"] *')].slice(0,40).map(b=>({t:(b.getAttribute('title')||''),a:(b.getAttribute('aria-label')||''),c:String(b.className||'').slice(0,40)})))`);
console.log('tombol activitybar:', tombol.slice(0, 900));
await klik(`[...document.querySelectorAll('button, .ab-item, [class*="activity"] *')].find(x=>/settings|setelan/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')+(x.className||'')))`);
await jeda(2200);
const ada = await cdp.eval(`!!document.querySelector('.set-nav-item')`);
console.log('settings terbuka:', ada);
console.log('Settings dibuka, nav section:');
const navs = JSON.parse(await cdp.eval(`JSON.stringify([...document.querySelectorAll('.set-nav-item')].map(b=>(b.textContent||'').trim()).filter(Boolean))`));
console.log('  ' + navs.join(' | '));

let totalTemuan = 0;
for (const s of navs) {
  await klik(`[...document.querySelectorAll('.set-nav-item')].find(b=>(b.textContent||'').trim()===${JSON.stringify(s)})`);
  await jeda(1100);
  const r = await baca('Settings > ' + s);
  totalTemuan += r.temuan;
}

// 2. panel Chat history (sidebar AI)
await klik(`[...document.querySelectorAll('button')].find(x=>/assistant|chat history/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')))`);
await jeda(1400);
const r2 = await baca('Chat history (sidebar AI)');
totalTemuan += r2.temuan;

// judul sesi yang tampil
const judul = await cdp.eval(`JSON.stringify([...document.querySelectorAll('.ai-side-title')].map(e=>e.textContent.trim()))`);
console.log('\njudul sesi tampil:', judul);

console.log(`\n===== TOTAL TEMUAN INDONESIA: ${totalTemuan} =====`);
await cdp.close();
