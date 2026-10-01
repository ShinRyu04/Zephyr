/**
 * Sapu UI: kunjungi tiap bagian, kumpulkan teks terlihat + title/aria/placeholder,
 * laporkan yang mengandung Indonesia. Pakai cdp.eval (tanpa wrapper runAsync).
 */
import { Cdp } from './lib-cdp.mjs';

const KATA = /\b(yang|tidak|sudah|untuk|dari|bisa|harus|belum|kalau|karena|hanya|saja|pakai|dengan|adalah|berjalan|tampilkan|sembunyikan|jalankan|simpan|tutup|hapus|ubah|berkas|selesai|gagal|kosong|mana|lihat|kirim|setiap|masih|telah|nyaman|pengaturan|perintah|catatan|riwayat|periksa|pasang|nyala|pilih|mungkin|perlu|wajib|izin|tampil|memuat|mencari|mengubah|menghapus|menambah|menutup|membuka|kembali|sekarang|biar|boleh)\b/i;

const { cdp } = await Cdp.attach('9223');
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
const temuan = [];
const dikunjungi = [];

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
  dikunjungi.push(nama);
  let arr = [];
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  for (const x of arr) if (KATA.test(x)) temuan.push({ bagian: nama, teks: String(x).slice(0, 160) });
  return arr.length;
};

const klik = async (sel) => cdp.eval(`(() => { const b=${sel}; if(b) { b.click(); return true; } return false; })()`);

console.log('awal:', await baca('tampilan awal'), 'teks');

for (const tab of ['Problems', 'Output', 'Debug Console', 'Ports', 'Subagents', 'Terminal']) {
  await klik(`[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(tab)})`);
  await jeda(700);
  console.log(tab + ':', await baca('panel bawah: ' + tab));
}

await klik(`[...document.querySelectorAll('button')].find(x=>/source control/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')))`);
await jeda(1300); console.log('scm:', await baca('Source Control'));

await klik(`[...document.querySelectorAll('button')].find(x=>/extension/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')))`);
await jeda(1300); console.log('ext:', await baca('Extensions'));

await klik(`[...document.querySelectorAll('button')].find(x=>/assistant|\\bAI\\b/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')))`);
await jeda(1500); console.log('ai:', await baca('AI panel'));

console.log('\n===== TEMUAN INDONESIA =====');
console.log(JSON.stringify({ dikunjungi, jumlah: temuan.length, temuan }, null, 1));
await cdp.close();
