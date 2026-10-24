/*
 * probe-kotak-abu.mjs - HANYA MEMBACA produk; hanya MENYUNTIK pesan sintetis
 * ke satu sesi (newChat) supaya bentuk pohon bisa diukur tanpa memanggil AI.
 *
 * Pertanyaan yang dijawab: elemen mana yang menggambar kotak abu (background
 * atau border) yang membungkus seluruh pohon tool, dan di kolom x berapa baris
 * hasil ("Read 156 lines") sebenarnya mendarat.
 */
import { Cdp } from '../scripts/lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(600);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const now = Date.now();
  const tool = (name, args, result, ms, extra) => Object.assign(
    { name, args: JSON.stringify(args), result, ok: true, at: now, ms }, extra || {});
  const teks = 'Baca aturan dulu. Cari semua tool. Baca katalognya. Sudah gua periksa.';
  const msg = {
    id: 'uji-pohon',
    role: 'assistant',
    content: teks,
    reasoning: 'User minta tool calls dikelompokkan jadi satu pohon.',
    reasoningMs: 1200,
    tools: [
      tool('read_file', { path: 'd:/Zephyr/AGENTS.md' }, 'baris\\n'.repeat(156), 900, { lines: 156, atChar: 18 }),
      tool('grep', { pattern: 'tool|tools' }, '[36 berkas, 200 kecocokan]\\na.ts\\nb.ts', 1100, { lines: 200, atChar: 36 }),
      tool('read_file', { path: 'd:/Zephyr/src/lib/catalog.ts' }, 'baris\\n'.repeat(126), 800, { lines: 126, atChar: 55 }),
    ],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(1500);
  out.dump = {
    pesan: X.store.getState().sessions.find(x => x.id === X.store.getState().activeId)?.messages.length,
    kepalaTeks: q('.ai-kerja-head')?.textContent?.slice(0, 60) ?? null,
    gagal: qa('.ai-kerja-gagal').map(e => e.textContent),
    semuaKelas: qa('[class*="ai-grup"], [data-testid*="ai-kerja"], .ai-kerja').map(e => e.className).slice(0, 12),
    ledakan: q('.ai-kerja')?.outerHTML?.slice(0, 1600) ?? null,
  };

  const kerja = q('.ai-kerja');
  if (!kerja) return out;
  const kepalaBtn = q('.ai-kerja-head');
  if (kepalaBtn) kepalaBtn.click();
  await wait(900);

  const kotak = [];
  let n = kerja;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    const bg = s.backgroundColor;
    const bw = parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth);
    const adaBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    if (adaBg || bw > 0) {
      kotak.push({
        cls: (typeof n.className === 'string' ? n.className : n.tagName).slice(0, 60),
        bg, bw, style: s.borderTopStyle, radius: s.borderRadius, pad: s.padding,
      });
    }
    n = n.parentElement;
  }

  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; };
  out.kepala = rect(q('.ai-kerja-head'));
  out.baris = qa('[data-testid="ai-kerja-baris"]').map(e => Object.assign({ teks: e.textContent.slice(0, 26), padL: getComputedStyle(e).paddingLeft, gap: getComputedStyle(e).gap }, rect(e)));
  out.hasil = qa('[data-testid="ai-anak-hasil"]').map(e => Object.assign(
    { teks: e.textContent.slice(0, 26), padL: getComputedStyle(e).paddingLeft, pos: getComputedStyle(e).position }, rect(e)));
  out.item = qa('.ai-grup-item').map(e => ({ pos: getComputedStyle(e).position, ...rect(e) }));
  out.narasi = qa('[data-testid="ai-kerja-narasi"]').map(e => ({ teks: e.textContent.slice(0, 30), ...rect(e) }));
  out.jumlahKerja = qa('.ai-kerja').length;
  out.urutan = Array.from(document.querySelectorAll('.ai-anak-pohon > *, .ai-anak-pohon > * > *'))
    .map(e => e.className.toString().slice(0, 40) + ' :: ' + (e.textContent || '').trim().slice(0, 34));
  out.kotak = kotak;
  return out;
`, 120000);

console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/scratch/shot-pohon.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
