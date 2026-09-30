/**
 * Ukur teks Indonesia di app yang hidup, terpisah dari i18n.
 * Cek: (1) seluruh DOM, (2) menu kiri AI assistant, (3) tombol subagent.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const KATA = [
  'yang', 'tidak', 'sudah', 'untuk', 'dari', 'akan', 'bisa', 'harus', 'belum',
  'kalau', 'karena', 'hanya', 'saja', 'pakai', 'dengan', 'adalah', 'tersedia',
  'dibuka', 'disimpan', 'dijalankan', 'membuat', 'menggunakan', 'semua', 'setiap',
  'beberapa', 'namun', 'tetapi', 'juga', 'masih', 'telah', 'gagal', 'kosong',
  'pilih', 'buka', 'simpan', 'tutup', 'cari', 'hapus', 'tambah', 'ubah',
  'berkas', 'selesai', 'panel', 'pintasan', 'riwayat', 'catatan', 'jawaban',
];

await halamanZephyr('9223'); // pastikan halaman Zephyr yang aktif
const { cdp } = await Cdp.attach('9223');

async function evalJs(expr) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true,
  });
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r?.result?.value;
}

// 1. sapuan seluruh DOM
const dom = await evalJs(`(() => {
  const kata = ${JSON.stringify(KATA)};
  const re = new RegExp('\\\\b(' + kata.join('|') + ')\\\\b', 'i');
  const out = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach((el) => {
    // hanya elemen yang isinya teks langsung (bukan induk yang membungkus)
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.trim();
      if (t.length < 6 || !re.test(t)) continue;
      const k = el.tagName + '|' + t;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 46),
        testid: el.getAttribute('data-testid') || el.getAttribute('data-sc-row') || '',
        teks: t.slice(0, 96),
      });
    }
  });
  return out;
})()`);

// 2. menu kiri AI assistant — klik ikon AI lalu baca isinya
const aiMenu = await evalJs(`(() => {
  const w = window.__ZEPHYR__;
  const lang = w?.getState?.().settings?.uiLang ?? '(?)';
  return { uiLang: lang };
})()`);

// 3. daftar tombol/menu di panel AI (kalau terbuka)
const panelAi = await evalJs(`(() => {
  const root = document.querySelector('[data-testid="ai-panel"], .ai-panel, aside.ai, [class*="ai-panel"]');
  if (!root) return { terbuka: false };
  const out = [];
  root.querySelectorAll('button, [role="menuitem"], [role="tab"], option, label, span, div').forEach((el) => {
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.trim();
      if (t.length < 3 || t.length > 70) continue;
      out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), teks: t });
    }
  });
  return { terbuka: true, jumlah: out.length, isi: out.slice(0, 80) };
})()`);

console.log(JSON.stringify({ uiLang: aiMenu?.uiLang, domIndonesia: dom, panelAi }, null, 1));
