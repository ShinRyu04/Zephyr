/**
 * Bukti visual perbaikan to-dos & antrean (2 Nov) — potret app sandbox yang
 * jalan lewat CDP 9223, di SESI demo milik skrip ini (activeIds/agentTodos/
 * antrian dikembalikan seperti semula di akhir). Tidak ada panggilan provider.
 *
 * Yang dibuktikan:
 *  - Kartu To-dos dan "Message queued" tampil BERDAMPINGAN di atas composer
 *    (dulu bertaruh satu slot — yang satu tampil, yang lain hilang).
 *  - To-dos dikecilkan (collapse) tidak menghilangkan tetangganya.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Cdp } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
mkdirSync('bukti', { recursive: true });

const { cdp } = await Cdp.attach(PORT);
const simpan = (nama, b64) => {
  writeFileSync(`bukti/${nama}.png`, Buffer.from(b64, 'base64'));
  console.log(`SIMPAN bukti/${nama}.png`);
};

const info = await cdp.runAsync(`
  const Xs = X.store;
  const zSt = await (async () => {
    const zUrl = (frag) => performance.getEntriesByType('resource').map((e) => e.name)
      .filter((n) => n.includes(frag)).sort().pop();
    return (await import(zUrl('/src/lib/store.ts'))).useStore;
  })();

  /* simpan keadaan awal untuk dikembalikan */
  const zAwal = {
    activeId: Xs.getState().activeId,
    activeIds: { ...Xs.getState().activeIds },
    agentTodos: Xs.getState().agentTodos,
    antrian: Xs.getState().antrian,
    antrians: { ...Xs.getState().antrians },
    mode: zSt.getState().settings.agents?.agentAktif,
  };

  /* mode agent biasa (bukan experts) supaya slot To-dos/Queue yang diuji */
  if (zAwal.mode !== 'agents') {
    zSt.setState((st) => ({ settings: { ...st.settings, agents: { ...st.settings.agents, agentAktif: 'agents' } } }));
  }

  const zSid = Xs.getState().newChat();
  Xs.setState((st) => ({ activeId: zSid, activeIds: { ...st.activeIds, '': zSid } }));

  /* To-dos sehat: rencana 6 item, 2 selesai, 1 sedang jalan */
  Xs.getState().setAgentTodos([
    { content: 'Riset struktur komponen panel', status: 'done' },
    { content: 'Peta state antrean per permukaan', status: 'done' },
    { content: 'Perbaiki drain antrean', status: 'in_progress' },
    { content: 'Uji dedup to-dos', status: 'pending' },
    { content: 'Perbarui dokumentasi', status: 'pending' },
    { content: 'Potret bukti visual', status: 'pending' },
  ]);

  /* Antrean 2 pesan — tampil BERSAMA to-dos */
  Xs.setState((st) => ({
    antrians: {
      ...st.antrians,
      '': [
        { id: 'qa-1', teks: 'lanjutkan ke langkah berikutnya kalau tes hijau' },
        { id: 'qa-2', teks: 'cek juga tampilan panel sempit' },
      ],
    },
    antrian: [
      { id: 'qa-1', teks: 'lanjutkan ke langkah berikutnya kalau tes hijau' },
      { id: 'qa-2', teks: 'cek juga tampilan panel sempit' },
    ],
  }));
  return { ok: true, sid: zSid, awal: zAwal };
`);
console.log('INJEKSI', JSON.stringify({ ok: info?.ok, sid: info?.sid }));

if (!info?.ok) {
  await cdp.close();
  process.exitCode = 1;
} else {
  await cdp.runAsync(`
    await wait(700);
    if (!document.querySelector('.ai-side-col')) {
      S.getState().setAiKolomVisible(true);
      await wait(400);
    }
    const dua = document.querySelectorAll('.ai-side-col .exp-todo, .ai-side-col [data-testid="ai-antrian"]');
    return { kartu: dua.length, teks: (document.querySelector('.ai-side-col')?.innerText ?? '').slice(0, 200) };
  `);

  /* 1. Kedua kartu berdampingan: potret dari kartu teratas sampai composer. */
  const kotak = await cdp.runAsync(`
    await wait(300);
    const kolom = document.querySelector('.ai-side-col');
    const toDos = kolom?.querySelector('[data-testid="experts-todos"]');
    const antre = kolom?.querySelector('[data-testid="ai-antrian"]');
    if (!toDos || !antre) return null;
    const a = antre.getBoundingClientRect();
    const b = toDos.getBoundingClientRect();
    const atas = Math.min(a.y, b.y) - 8;
    const bawah = Math.max(a.y + a.height, b.y + b.height) + 8;
    return { x: Math.min(a.x, b.x) - 8, y: atas, width: Math.max(a.width, b.width) + 16, height: bawah - atas };
  `);
  if (kotak) simpan('app-todos-queue', await cdp.screenshot({ x: kotak.x, y: kotak.y, width: kotak.width, height: kotak.height }));
  else console.log('LEWAT: kedua kartu tidak terlihat');

  /* 2. To-dos dikecilkan — antrean tetap di atasnya. */
  await cdp.runAsync(`
    const t = document.querySelector('.ai-side-col [data-testid="experts-todos-toggle"]');
    t?.click();
    await wait(400);
    return !!t;
  `);
  const kotak2 = await cdp.runAsync(`
    const kolom = document.querySelector('.ai-side-col');
    const toDos = kolom?.querySelector('[data-testid="experts-todos"]');
    const antre = kolom?.querySelector('[data-testid="ai-antrian"]');
    if (!toDos || !antre) return null;
    const a = antre.getBoundingClientRect();
    const b = toDos.getBoundingClientRect();
    const atas = Math.min(a.y, b.y) - 8;
    const bawah = Math.max(a.y + a.height, b.y + b.height) + 8;
    return { x: Math.min(a.x, b.x) - 8, y: atas, width: Math.max(a.width, b.width) + 16, height: bawah - atas };
  `);
  if (kotak2) simpan('app-todos-kecil', await cdp.screenshot({ x: kotak2.x, y: kotak2.y, width: kotak2.width, height: kotak2.height }));
  else console.log('LEWAT: potret kecil gagal');

  /* bersihkan: kembalikan semuanya seperti semula */
  await cdp.runAsync(`
    const Xs2 = X.store;
    const zAwal2 = ${JSON.stringify(info.awal)};
    Xs2.setState((st) => ({
      sessions: st.sessions.filter((x) => x.id !== ${JSON.stringify(info.sid)}),
      activeId: zAwal2.activeId,
      activeIds: zAwal2.activeIds,
      agentTodos: zAwal2.agentTodos,
      antrian: zAwal2.antrian,
      antrians: zAwal2.antrians,
    }));
    if (zAwal2.mode !== 'agents') {
      const zUrl2 = (frag) => performance.getEntriesByType('resource').map((e) => e.name)
        .filter((n) => n.includes(frag)).sort().pop();
      const zSt2 = (await import(zUrl2('/src/lib/store.ts'))).useStore;
      zSt2.setState((st) => ({ settings: { ...st.settings, agents: { ...st.settings.agents, agentAktif: zAwal2.mode ?? 'agents' } } }));
    }
    return { ok: true };
  `);
  console.log('BERSIH — sesi demo dihapus, keadaan dikembalikan');
  await cdp.close();
}
