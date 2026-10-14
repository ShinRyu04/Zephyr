/*
 * B5 live: server MCP pihak ketiga tidak boleh membanjiri daftar tool.
 *
 * Satu server luar bisa memaparkan ratusan tool. Tanpa batas, seluruh
 * skemanya ikut di SETIAP permintaan: konteks habis, tool Zephyr sendiri
 * tenggelam, dan pembaca tidak punya cara melihat itu sedang terjadi. Batas
 * saja belum cukup - tool yang ditahan harus DIKETAHUI, oleh pembaca (panel
 * Setelan) dan oleh model (blok prompt), supaya tidak ada kegagalan senyap.
 *
 * Gerbang:
 *   B5-1 server dengan 120 tool: hanya 40 yang dikirim ke provider.
 *   B5-2 angka di ringkasan cocok (total/dipakai/dibuang) dan contoh nama
 *        yang ditahan ikut disebut.
 *   B5-3 blok prompt memuat batas itu dengan ANGKA NYATA - bukan cuma ada di
 *        dalam berkas uji.
 *   B5-4 server di bawah batas: semua tool dikirim, blok prompt tidak muncul.
 *   B5-5 dua server: jatah dihitung PER SERVER, bukan total.
 *   B5-6 registry dipulihkan seperti semula setelah uji.
 *
 * Pemakaian: node scripts/cek-batas-mcp-live.mjs [port]
 */
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const gagal = [];
const oknama = (n, lulus, catatan) => {
  console.log(`${lulus ? 'OK  ' : 'GAGAL'} ${n}${catatan ? ' - ' + catatan : ''}`);
  if (!lulus) gagal.push(n);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const ringkas = async () =>
  cdp.json(`return JSON.stringify({
  batas: window.__ZEPHYR_AI__.batasToolPerServer(),
  ringkas: window.__ZEPHYR_AI__.mcpRingkas(),
  terpotong: window.__ZEPHYR_AI__.mcpTerpotong(),
  spec: (await import('/src/lib/agentTools.ts')).agentToolSpecs().filter((s) => s.name.startsWith('mcp__uji')),
})`.replace('await import', 'await import'));

const buat = (serverId, label, n) =>
  Array.from({ length: n }, (_, i) => ({
    serverId,
    serverLabel: label,
    name: `${serverId}_tool_${i + 1}`,
    description: `tool ${i + 1} dari ${label}`,
  }));

const pasang = async (list) =>
  cdp.json(`return JSON.stringify({ ok: window.__ZEPHYR_AI__.mcpUji(${JSON.stringify(list)}) ?? true })`);

/*
 * Awal: kembalikan registry ke keadaan yang diketahui.
 *
 * Batas yang SEDANG berlaku hidup di modul mcpTools, dan modul itu tidak ikut
 * di-reset saat halaman dimuat ulang. Uji yang mengandalkan "bawaan 40" lalu
 * meninggalkan 0 dari putaran sebelumnya akan menuduh produk memotong tool
 * padahal tidak - jadi keadaan itu dipasang eksplisit, bukan diasumsikan.
 */
const asli = await cdp.json(`return JSON.stringify({
  ringkas: window.__ZEPHYR_AI__.mcpRingkas(),
  ba: window.__ZEPHYR_AI__.batasToolPerServer(),
  setelan: window.__ZEPHYR__.getState().settings.mcp?.maxToolsPerServer ?? null,
})`);
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_AI__.mcpUji([], window.__ZEPHYR_AI__.batasToolPerServer());
  await window.__ZEPHYR_MCP__.refreshServers();
  await new Promise((r) => setTimeout(r, 400));
  window.__ZEPHYR_AI__.mcpUji([], window.__ZEPHYR_AI__.batasToolPerServer());
  return { batas: window.__ZEPHYR_AI__.mcpBatas() };
})())`);
await sleep(250);

// --- B5-1 / B5-2: satu server jauh di atas batas ---
const n1 = 120;
await pasang(buat('uji', 'Server Uji', n1));
await sleep(300);

const s1 = await cdp.json(`return JSON.stringify(await (async () => {
  const spec = (await import('/src/lib/agentTools.ts')).agentToolSpecs().filter((s) => s.name.startsWith('mcp__uji__'));
  return {
    kirim: spec.length,
    ringkas: window.__ZEPHYR_AI__.mcpRingkas(),
    terpotong: window.__ZEPHYR_AI__.mcpTerpotong(),
  };
})())`);

oknama(
  `B5-1 server ${n1} tool: hanya ${asli.ba} yang dikirim ke provider`,
  s1.kirim === asli.ba,
  `dikirim=${s1.kirim} batas=${asli.ba}`,
);
const r1 = (s1.ringkas || [])[0] || {};
oknama(
  'B5-2 ringkasan jujur: total/dipakai/dibuang + contoh yang ditahan',
  r1.total === n1 && r1.dipakai === asli.ba && r1.dibuang === n1 - asli.ba && (r1.contohDibuang || []).length === 3,
  `total=${r1.total} dipakai=${r1.dipakai} dibuang=${r1.dibuang} contoh=${JSON.stringify(r1.contohDibuang)}`,
);

// --- B5-3: blok prompt membawa angka nyata ---
const sys3 = (
  await cdp.json(
    `return JSON.stringify({ teks: window.__ZEPHYR_PROMPT__.system('en', '', '') })`,
  )
).teks;
const angka = [`${asli.ba}/${n1}`, `${n1 - asli.ba} held back`, 'Server Uji'];
oknama(
  'B5-3 blok prompt memuat batas + angka nyata ke MODEL',
  angka.every((a) => sys3.includes(a)) && /External MCP tools \(limit\)/.test(sys3),
  angka.map((a) => `${a}=${sys3.includes(a)}`).join(' '),
);

// --- B5-4: di bawah batas tidak ada pemotongan, tidak ada blok ---
await pasang(buat('uji', 'Server Uji', 12));
await sleep(300);
const s4 = await cdp.json(`return JSON.stringify(await (async () => {
  const spec = (await import('/src/lib/agentTools.ts')).agentToolSpecs().filter((s) => s.name.startsWith('mcp__uji__'));
  return { kirim: spec.length, terpotong: window.__ZEPHYR_AI__.mcpTerpotong().length };
})())`);
const sys4 = (await cdp.json(`return JSON.stringify({ teks: window.__ZEPHYR_PROMPT__.system('en', '', '') })`)).teks;
oknama(
  'B5-4 di bawah batas: semua dikirim, blok batas tidak muncul',
  s4.kirim === 12 && s4.terpotong === 0 && !sys4.includes('External MCP tools (limit)'),
  `dikirim=${s4.kirim} terpotong=${s4.terpotong} blok=${sys4.includes('External MCP tools (limit)')}`,
);

// --- B5-5: jatah PER SERVER, bukan total ---
await pasang([...buat('ujiA', 'Server A', 60), ...buat('ujiB', 'Server B', 60)]);
await sleep(300);
const s5 = await cdp.json(`return JSON.stringify(await (async () => {
  const spec = (await import('/src/lib/agentTools.ts')).agentToolSpecs().map((s) => s.name).filter((n) => n.startsWith('mcp__uji'));
  return {
    A: spec.filter((n) => n.startsWith('mcp__ujiA__')).length,
    B: spec.filter((n) => n.startsWith('mcp__ujiB__')).length,
    terpotong: window.__ZEPHYR_AI__.mcpTerpotong().map((r) => r.serverId),
  };
})())`);
oknama(
  'B5-5 dua server: tiap server dapat jatah sendiri (bukan 40 dibagi)',
  s5.A === asli.ba && s5.B === asli.ba && s5.terpotong.length === 2,
  `A=${s5.A} B=${s5.B} terpotong=${JSON.stringify(s5.terpotong)}`,
);

// --- B5-6: pulihkan registry ---
await pasang([]);
await sleep(250);
const akhir = await cdp.json(`return JSON.stringify({ terpotong: window.__ZEPHYR_AI__.mcpTerpotong().length, ringkas: window.__ZEPHYR_AI__.mcpRingkas().length })`);
oknama(
  'B5-6 registry dipulihkan: tidak ada server uji yang tertinggal',
  akhir.terpotong === 0 && akhir.ringkas === 0,
  `terpotong=${akhir.terpotong} ringkas=${akhir.ringkas} (sebelum uji: ${(asli.ringkas || []).length} server)`,
);

// --- B5-7: pembaca MELIHAT batas itu di panel Setelan, bukan cuma di data ---
await pasang([...buat('uji', 'Server Uji', 90)]);
await sleep(250);
const panel = await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_SETTINGS__.buka('mcp');
  await new Promise((r) => setTimeout(r, 900));
  const el = document.querySelector('[data-testid="mcp-batas-uji"]');
  const teks = el ? (el.innerText || el.textContent || '') : '';
  const hasil = { ada: !!el, teks: teks.replace(/\\s+/g, ' ').trim().slice(0, 200), section: window.__ZEPHYR_SETTINGS__.section() };
  window.__ZEPHYR_SETTINGS__.tutup();
  return hasil;
})())`);
oknama(
  'B5-7 panel Setelan menampilkan baris batas dengan angka nyata',
  panel.ada && panel.teks.includes('40') && panel.teks.includes('90') && panel.teks.includes('Server Uji'),
  `section=${panel.section} teks="${panel.teks}"`,
);

// --- B5-8: pulihkan lewat jalur milik aplikasi (bukan hapus tangan) ---
/* refreshServers(), bukan refresh(): hanya refreshServers yang membaca ulang
   server lalu memasang tool-nya kembali ke registry. */
const pulih = await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_MCP__.refreshServers();
  await new Promise((r) => setTimeout(r, 700));
  return {
    ringkas: window.__ZEPHYR_AI__.mcpRingkas().map((r) => r.serverId),
    terpotong: window.__ZEPHYR_AI__.mcpTerpotong().length,
  };
})())`);
oknama(
  'B5-8 refresh aplikasi mengembalikan daftar server yang sebenarnya',
  !pulih.ringkas.includes('uji'),
  `server=${JSON.stringify(pulih.ringkas)}`,
);

// --- B5-9/10/11: batas bisa disetel pembaca, dan berlaku tanpa restart ---
/* (input di panel harus menunjukkan batas yang SEDANG berlaku - dibandingkan
   dengan angka yang dipakai pengiriman, bukan angka yang ditulis di kode uji) */
const setelan = await cdp.json(`return JSON.stringify(await (async () => {
  let S = window.__ZEPHYR_SET__;
  const uiLangAsli = window.__ZEPHYR__.getState().settings.general.uiLang;
  /* Bahasa Indonesia: kunci kamus adalah teks INGGRIS, jadi kalau barisnya
     tetap Inggris di UI Indonesia berarti kuncinya salah dan terjemahannya
     tidak pernah terpakai. */
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: 'id' } });
  window.__ZEPHYR_SETTINGS__.buka('mcp');
  await new Promise((r) => setTimeout(r, 900));
  const input = document.querySelector('[data-testid="mcp-max-tools"]');
  /* Ambil SEMUA kartu arah: yang pertama adalah "External AI -> Zephyr", dan
     batas tool ada di kartu kedua. Membaca satu kartu saja membuat uji mencari
     teks di tempat yang salah lalu menuduh terjemahannya tidak ada. */
  const panelTeks = [...document.querySelectorAll('.mcp-direction-card')].map((c) => c.innerText || '').join(' ');
  window.__ZEPHYR_SETTINGS__.tutup();
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: uiLangAsli } });
  return {
    adaInput: !!input,
    nilai: input ? input.value : null,
    idTeks: /Maksimal tool per server MCP/.test(panelTeks),
    inggrisBocor: /Max tools per MCP server|MCP tool limit/.test(panelTeks),
  };
})())`);
oknama(
  'B5-9 baris setelan batas ada di panel, dan terjemahannya benar-benar terpakai',
  setelan.adaInput && setelan.nilai === String(asli.ba) && setelan.idTeks && !setelan.inggrisBocor,
  `input=${setelan.adaInput} nilai=${setelan.nilai} id=${setelan.idTeks} bocorInggris=${setelan.inggrisBocor}`,
);

const b5 = await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_AI__.mcpUji(${JSON.stringify(buat('uji', 'Server Uji', 90))}, 5);
  await new Promise((r) => setTimeout(r, 200));
  const spec = (await import('/src/lib/agentTools.ts')).agentToolSpecs().filter((s) => s.name.startsWith('mcp__uji__'));
  return { kirim: spec.length, batas: window.__ZEPHYR_AI__.mcpBatas() };
})())`);
oknama(
  'B5-10 batas 5 berlaku tanpa restart (yang dikirim ikut angka baru)',
  b5.kirim === 5 && b5.batas === 5,
  `dikirim=${b5.kirim} batas=${b5.batas}`,
);

const nol = await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_AI__.mcpUji(${JSON.stringify(buat('uji', 'Server Uji', 90))}, 0);
  await new Promise((r) => setTimeout(r, 200));
  const spec = (await import('/src/lib/agentTools.ts')).agentToolSpecs().filter((s) => s.name.startsWith('mcp__uji__'));
  const sys = window.__ZEPHYR_PROMPT__.system('en', '', '');
  return {
    kirim: spec.length,
    terpotong: window.__ZEPHYR_AI__.mcpTerpotong().length,
    blok: /External MCP tools \\(limit\\)/.test(sys),
  };
})())`);
oknama(
  'B5-11 batas 0 = tanpa batas: semua dikirim, tidak ada baris peringatan',
  nol.kirim === 90 && nol.terpotong === 0 && !nol.blok,
  `dikirim=${nol.kirim} terpotong=${nol.terpotong} blok=${nol.blok}`,
);

/* Keadaan ditinggalkan seperti saat kedatangan: registry asli + batas bawaan. */
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_AI__.mcpUji([], window.__ZEPHYR_AI__.batasToolPerServer());
  await window.__ZEPHYR_MCP__.refreshServers();
  await new Promise((r) => setTimeout(r, 400));
  return { batas: window.__ZEPHYR_AI__.mcpBatas(), server: window.__ZEPHYR_AI__.mcpRingkas().length };
})())`);

console.log(gagal.length ? `GAGAL: ${gagal.join(', ')}` : 'SEMUA GERBANG LULUS');
await cdp.close();
process.exit(gagal.length ? 1 : 0);
