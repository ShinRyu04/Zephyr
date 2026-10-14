/**
 * cek-rilis.mjs - periksa build RILIS: bahasa, tools, dan terminal.
 *
 *   node scripts/cek-rilis.mjs [port]
 *
 * Bridge dev (`window.__ZEPHYR__` dll) TIDAK ADA di rilis - itu memang
 * tujuannya, ia di-tree-shake keluar. Karena itu berkas ini memakai `cdp.eval`
 * murni dan hanya membaca DOM serta nilai publik, bukan store internal.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const { cdp } = await Cdp.attach(PORT);

/* 1. Identitas: pastikan ini Zephyr, bukan aplikasi lain yang memakai port itu. */
const id = await cdp.eval(`JSON.stringify({ judul: document.title, url: location.href })`);
console.log('target:', id);

/* 2. Bridge dev harus TIDAK ada di rilis. */
const bridge = await cdp.eval(`JSON.stringify({
  zephyr: typeof window.__ZEPHYR__,
  term: typeof window.__ZEPHYR_TERM__,
  todo: typeof window.__ZEPHYR_TODO__,
  ex: typeof window.__ZEPHYR_EX__,
})`);
console.log('bridge dev:', bridge);

/* 3. Bahasa: pindai teks Indonesia di layar. */
const bahasa = await cdp.eval(`JSON.stringify((() => {
  const teks = document.body.innerText || '';
  const penanda = ['Ubah','Hapus','Pengaturan','Perintah','Berkas','Simpan','Jalankan','Menunggu','Berjalan','Selesai'];
  const bocor = {};
  for (const p of penanda) {
    const n = (teks.match(new RegExp('\\\\b' + p + '\\\\b', 'g')) || []).length;
    if (n) bocor[p] = n;
  }
  return { bocor, panjangTeks: teks.length };
})())`);
console.log('bahasa:', bahasa);

/*
 * Langkah yang butuh menunggu (klik, lalu periksa hasilnya) TIDAK bisa memakai
 * `cdp.eval` biasa: helper itu tidak mengaktifkan `awaitPromise`, jadi promise
 * yang dikembalikan dievaluasi sebagai `{}`.
 *
 * Pola yang dipakai di sini adalah pola yang sama dengan `cdp.json`: jalankan
 * aksinya, lalu POLLING hasilnya di sisi Node. Ini juga yang tercatat di
 * AGENTS.md - `awaitPromise` sering gagal di WebView2 ("Promise was
 * collected"), jadi menunggu di sisi klien lebih andal.
 */
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * 4. Tools: buka PANEL AI dulu, baru picker-nya.
 *
 * Tombol tools tinggal di dalam panel AI, dan panel itu tidak terbuka sendiri
 * saat aplikasi mulai. Percobaan pertama melewati langkah ini, lalu melaporkan
 * "tombol tools tidak ada" - kegagalan uji yang terbaca seperti kerusakan
 * aplikasi, padahal panelnya saja yang belum dibuka.
 *
 * Ikon AI dikenali lewat aria-label karena di rilis tidak ada testid untuk
 * tombol activity bar.
 */
await cdp.eval(`(() => {
  const ikon = [...document.querySelectorAll('button, [role=tab]')].find((b) => {
    const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).toLowerCase();
    return t.includes('ai') || t.includes('assistant') || t.includes('chat');
  });
  if (ikon) ikon.click();
  return 'klik ikon AI';
})()`);
await tidur(900);

/* Baru picker-nya (jalur UI nyata: menu "..." -> Chat Settings -> nav Tools ->
   "Open tool sets…" (cset-tools); entri menu "Tool Sets" (ai-open-toolsets) dan
   tombol lama 'ai-toolgate' sudah dihapus dari UI). */
await cdp.eval(`(async () => {
  if (document.querySelector('[data-testid="toolgate"]')) return 'sudah terbuka';
  const more = document.querySelector('[data-testid="ai-more"]');
  if (!more) return 'tidak ada tombol ...';
  more.click();
  await new Promise((r) => setTimeout(r, 300));
  const cs = document.querySelector('[data-testid="ai-open-chat-settings"]');
  if (!cs) return 'menu ... tanpa item Chat Settings';
  cs.click();
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('[data-testid="cset-nav-tools"]')?.click();
  await new Promise((r) => setTimeout(r, 400));
  const tombol = document.querySelector('[data-testid="cset-tools"]');
  if (!tombol) return 'Chat Settings tanpa tombol cset-tools';
  tombol.click();
  await new Promise((r) => setTimeout(r, 600));
  return document.querySelector('[data-testid="toolgate"]') ? 'terbuka' : 'gagal buka';
})()`);
await tidur(700);
const tools = await cdp.eval(`JSON.stringify((() => {
  const panel = document.querySelector('[data-testid="toolgate"]');
  if (!panel) return { error: 'panel tidak terbuka' };
  return {
    bagian: [...panel.querySelectorAll('.tg-bagian-nama')].map((e) => e.textContent.trim()),
    total: panel.querySelector('[data-testid="toolgate-total"]')?.textContent?.trim() ?? '',
    jumlahSwitch: panel.querySelectorAll('.tg-row').length,
    namaMcpPolos: [...panel.querySelectorAll('.tg-nama')].some((e) => e.textContent.trim() === 'inspect'),
  };
})())`);
console.log('tools:', tools);

/* 5. Terminal: buka tab terminal, lalu klik Shell, lalu poll sampai prompt ada. */
await cdp.eval(`(() => {
  const cari = (t) => [...document.querySelectorAll('button, [role=tab]')]
    .find((b) => (b.textContent || '').trim().toLowerCase() === t.toLowerCase());
  const tab = cari('terminal');
  if (tab) tab.click();
  return 'klik tab';
})()`);
await tidur(700);
const tawaran = await cdp.eval(`(() => {
  const k = document.querySelector('.pane-empty');
  return k ? k.textContent.trim().slice(0, 140) : '(tidak ada tawaran kosong)';
})()`);
console.log('tawaran panel:', tawaran);

await cdp.eval(`(() => {
  const shell = [...document.querySelectorAll('button')]
    .find((b) => /^shell$/i.test((b.textContent || '').trim()));
  if (shell) shell.click();
  return 'klik shell';
})()`);
await tidur(5000);
const term = await cdp.eval(`JSON.stringify((() => {
  const layar = document.querySelector('.xterm-screen');
  return {
    xterm: document.querySelectorAll('.xterm').length,
    baris: document.querySelectorAll('.xterm-rows > div').length,
    teks: layar ? layar.innerText.slice(0, 200) : null,
  };
})())`);
console.log('terminal:', term);

console.log('\\n=== SINPEL: periksa hasil di atas ===');
await cdp.close();
process.exit(0);
