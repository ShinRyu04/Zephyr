/*
 * Verifikasi `@path` di pesan TERKIRIM digambar sebagai chip berikon.
 *
 *   R1  folder, file, dan rule jadi chip; masing-masing punya ikon dan data-ref
 *   R2  teks biasa (tanpa token) tidak berubah dan tidak memunculkan chip
 *   R3  email dan "@" sendirian BUKAN referensi (tidak jadi chip)
 *
 * Pesan uji disuntikkan lewat store lalu DIHAPUS lagi di akhir, jadi riwayat
 * chat pengguna tidak bertambah. Bukti dibaca dari DOM hidup.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.eval(`window.__ZEPHYR__.getState().setActivity('ai')`);
await new Promise((r) => setTimeout(r, 1200));

const pesanUji = [
  { id: 'uji-ref-1', isi: 'tolong lihat @.github/ dan @src/lib/aiStore.ts ya, lalu @rule:ts-any' },
  { id: 'uji-ref-2', isi: 'tanpa rujukan sama sekali di sini' },
  { id: 'uji-ref-3', isi: 'kirim ke budi@contoh.com dan tanda @ sendirian' },
  { id: 'uji-ref-4', isi: 'lihat @"Referensi TRAE Agent Window/1.png" lalu lanjut' },
  { id: 'uji-ref-5', isi: 'berkas terlampir', attached: { path: 'Referensi TRAE Agent Window/1.png', bytes: 1024, truncated: false } },
];

const suntik = await cdp.runAsync(
  `
  const S1 = window.__ZEPHYR_AI__.store;
  const st1 = S1.getState();
  const sesi1 = st1.sessions.find((s) => s.id === (st1.activeIds?.[''] ?? st1.activeId)) ?? st1.sessions[0];
  if (!sesi1) return JSON.stringify({ err: 'tidak ada sesi' });
  window.__UJI_SESI__ = sesi1.id;
  const tambah = ${JSON.stringify(pesanUji)}.map((p) => ({
    id: p.id,
    role: 'user',
    content: p.isi,
    at: Date.now(),
    ...(p.attached ? { attached: p.attached } : {}),
  }));
  S1.setState({ sessions: st1.sessions.map((x) => (x.id === sesi1.id ? { ...x, messages: [...x.messages, ...tambah] } : x)) });
  await wait(900);
  return JSON.stringify({ ok: true });
`,
  30000,
);
console.log('suntik:', suntik);

const baca = async (id) =>
  JSON.parse(
    await cdp.eval(`(() => {
      const row = document.querySelector('[data-ai-row="${id}"]');
      if (!row) return JSON.stringify({ ada: false });
      const chip = [...row.querySelectorAll('.ai-ref-chip-pesan')];
      return JSON.stringify({
        ada: true,
        chip: chip.map((c) => ({
          ref: c.getAttribute('data-ref'),
          teks: c.textContent.trim(),
          ikon: !!c.querySelector('svg'),
          folder: (c.getAttribute('data-ref') ?? '').endsWith('/'),
        })),
        teks: row.querySelector('.ai-plain')?.textContent ?? null,
      });
    })()`),
  );

const r1 = await baca('uji-ref-1');
const r2 = await baca('uji-ref-2');
const r3 = await baca('uji-ref-3');
const r4 = await baca('uji-ref-4');

/* R5: chip bisa diklik -> berkas terbuka sebagai tab. */
const sebelumKlik = JSON.parse(
  await cdp.eval(`JSON.stringify((() => { const st = window.__ZEPHYR__.getState(); return {
    tabs: st.tabs.map((t) => t.path),
    aktif: st.tabs.find((t) => t.id === st.activeTabId)?.path ?? null,
  }; })())`),
);
await cdp.runAsync(
  `(() => {
    const b = document.querySelector('[data-ai-row="uji-ref-4"] .ai-ref-chip-pesan.is-buka');
    if (b) b.click();
    return 'ok';
  })()`,
  10000,
);
await new Promise((r) => setTimeout(r, 1600));
const sesudahKlik = JSON.parse(
  await cdp.eval(`JSON.stringify((() => { const st = window.__ZEPHYR__.getState(); return {
    tabs: st.tabs.map((t) => t.path),
    aktif: st.tabs.find((t) => t.id === st.activeTabId)?.path ?? null,
  }; })())`),
);

/* R6: chip lampiran memakai ikon. */
const r6 = JSON.parse(
  await cdp.eval(`(() => {
    const row = document.querySelector('[data-ai-row="uji-ref-5"]');
    const chip = row?.querySelector('.ai-attach-chip');
    return JSON.stringify({
      ada: !!chip,
      ikon: !!chip?.querySelector('.ai-attach-chip-ikon svg'),
      teks: chip?.textContent?.trim() ?? null,
    });
  })()`),
);

const r5 = { sebelumKlik, sesudahKlik };
console.log(JSON.stringify({ r1, r2, r3, r4, r5, r6 }, null, 1));

await cdp.runAsync(
  `
  const S2 = window.__ZEPHYR_AI__.store;
  const st2 = S2.getState();
  const ids = ${JSON.stringify(pesanUji.map((p) => p.id))};
  S2.setState({ sessions: st2.sessions.map((x) => ({ ...x, messages: x.messages.filter((m) => !ids.includes(m.id)) })) });
  return 'ok';
`,
  15000,
);

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek(
  'R1 folder, file, dan rule jadi chip berikon',
  r1.ada === true &&
    r1.chip.length === 3 &&
    r1.chip.every((c) => c.ikon === true) &&
    r1.chip[0].ref === '.github/' &&
    r1.chip[0].folder === true &&
    r1.chip[1].ref === 'src/lib/aiStore.ts' &&
    r1.chip[1].folder === false &&
    r1.chip[2].ref === 'rule:ts-any',
  JSON.stringify(r1.chip),
);
cek(
  'R2 teks tanpa token tidak memunculkan chip',
  r2.ada === true && r2.chip.length === 0 && r2.teks === 'tanpa rujukan sama sekali di sini',
  `chip=${r2.chip.length} teks="${r2.teks}"`,
);
cek(
  'R3 email dan "@" sendirian bukan referensi',
  r3.ada === true && r3.chip.length === 0,
  `chip=${r3.chip.length} teks="${r3.teks}"`,
);
cek(
  'R5 chip berkas bisa diklik dan membuka tab',
  /1\.png$/.test(r5.sesudahKlik.aktif ?? ''),
  `aktif: ${JSON.stringify(r5.sebelumKlik.aktif)} -> ${JSON.stringify(r5.sesudahKlik.aktif)}, tab=${r5.sesudahKlik.tabs.length}`,
);
cek(
  'R6 chip lampiran memakai ikon',
  r6.ada === true && r6.ikon === true && /1\.png/.test(r6.teks ?? ''),
  JSON.stringify(r6),
);
cek(
  'R4 path berspasi (dikutip) jadi SATU chip utuh',
  r4.ada === true &&
    r4.chip.length === 1 &&
    r4.chip[0].ref === 'Referensi TRAE Agent Window/1.png' &&
    !/Referensi/.test((r4.teks ?? '').replace('Referensi TRAE Agent Window/1.png', '')),
  JSON.stringify({ chip: r4.chip, teks: r4.teks }),
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
keluarBersih(gagal === 0 ? 0 : 1);
