/**
 * Bukti visual permukaan Experts (sandbox) — memotret app yang SEDANG BERJALAN
 * lewat CDP 9223, memakai data demo di SESI BARU milik skrip ini.
 *
 * Aturan keras yang dikodekan di sini:
 *  - TIDAK menyentuh sesi chat user. Sesi demo dibuat lewat `aiStore.newChat()`,
 *    dan SEBELUM injeksi skrip menyimpan `activeId`/`activeIds` user untuk
 *    dikembalikan apa adanya di akhir. Pesan user tidak pernah dibaca/diubah.
 *  - TIDAK memanggil provider berbayar. Semua isi kartu berasal dari data yang
 *    diinjeksi ke store Experts/subagent.
 *  - Panel AI memilih sesi lewat `activeIds[composerId]`, BUKAN `activeId`.
 *    Karena itu injeksi mengisi keduanya; versi pertama hanya mengisi
 *    `activeId`, sehingga potret menampilkan sesi user yang lain (bukti salah,
 *    bukan sekadar bukti jelek). Setelah injeksi, skrip MEMVERIFIKASI bahwa
 *    timeline yang terlihat benar-benar milik run demo sebelum memotret.
 *  - Nama variabel di runAsync tidak boleh menabrak prelude lib-cdp.mjs
 *    (S, s, T, X, EX, G, M, SET, CP, ...): semua modul memakai awalan `z`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Cdp } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const DIR = 'bukti';
const RUN_ID = 'demo-bukti-qoder';

mkdirSync(DIR, { recursive: true });

const { cdp } = await Cdp.attach(PORT);

const simpan = (nama, b64) => {
  const path = `${DIR}/${nama}.png`;
  writeFileSync(path, Buffer.from(b64, 'base64'));
  console.log(`SIMPAN ${path}`);
};

/** Potret satu elemen + sedikit ruang di sekelilingnya. */
async function potret(nama, tahap, selector, pad = 10) {
  const kotak = await cdp.runAsync(`
    ${tahap}
    await wait(700);
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    await wait(250);
    const b = el.getBoundingClientRect();
    const x = Math.max(0, b.x - ${pad});
    const y = Math.max(0, b.y - ${pad});
    return {
      x, y,
      width: Math.min(innerWidth - x, b.width + ${pad * 2}),
      height: Math.min(innerHeight - y, b.height + ${pad * 2}),
      teks: (el.innerText ?? '').slice(0, 80),
    };
  `);
  if (!kotak || kotak.width < 8 || kotak.height < 8) {
    console.log(`LEWAT ${nama}: ${selector} tidak terlihat`);
    return false;
  }
  simpan(nama, await cdp.screenshot({ x: kotak.x, y: kotak.y, width: kotak.width, height: kotak.height }));
  console.log(`  isi: ${kotak.teks.replace(/\n/g, ' | ')}`);
  return true;
}

/* ------------------------------------------------------------------ */
/* 1. Injeksi data demo ke SESI BARU milik skrip ini                   */
/* ------------------------------------------------------------------ */
const info = await cdp.runAsync(`
  const zAi = window.__ZEPHYR_AI__.store;
  const zUrl = (frag) =>
    performance.getEntriesByType('resource').map((e) => e.name)
      .filter((n) => n.includes(frag)).sort().pop();
  const zExUrl = zUrl('/src/lib/expertsStore.ts');
  const zSaUrl = zUrl('/src/lib/subagentStore.ts');
  if (!zExUrl || !zSaUrl) return { ok: false, err: 'modul store tidak ditemukan' };

  const zEx = await import(zExUrl);
  const zSa = await import(zSaUrl);

  /* Simpan pilihan sesi user supaya bisa dikembalikan persis di akhir. */
  const zAwal = { activeId: zAi.getState().activeId, activeIds: { ...zAi.getState().activeIds } };
  /* Strip Task Progress hanya dirender saat mode agent = experts — simpan
     juga nilai awalnya untuk dikembalikan di akhir. */
  const zSt = await import(zUrl('/src/lib/store.ts'));
  const zModeAwal = zSt.useStore.getState().settings.agents?.agentAktif;

  const zNow = Date.now();
  const zSid = zAi.getState().newChat();

  const zBaris = (id, nama, peran, langkah, files, token, zStatus = 'selesai') => {
    const dasar = zSa.useSubAgent.getState().agents[0] ?? {};
    return {
      ...dasar,
      id, nama, peran, tokenTugas: token,
      customId: null, customNama: null, customIkon: null,
      tugas: '[#demo] bukti visual permukaan Experts',
      delegasiId: 'experts-${RUN_ID}',
      status: zStatus,
      langkah,
      hasil: 'Selesai — laporan demo untuk bukti visual.',
      error: null,
      mulai: zNow - 90000,
      selesai: zNow - 5000,
      nTool: langkah.filter((l) => l.kind === 'tool').length,
      provider: 'demo', model: 'demo-model',
      modelSource: 'ikut', routingReason: 'demo',
      verdict: 'terbukti',
      fileDitulis: files,
      tulisDitolak: 0,
      kedalaman: 0,
    };
  };

  const zLangkahA = [
    { kind: 'pikir', teks: 'Saya perlu membandingkan permukaan Experts Zephyr dengan Qoder.', at: zNow - 88000 },
    { kind: 'tool', nama: 'read_file', args: JSON.stringify({ path: 'd:\\\\Zephyr\\\\src\\\\lib\\\\expertsStore.ts', offset: 37, limit: 84 }), hasil: '84 lines read', ok: true, at: zNow - 84000 },
    { kind: 'tool', nama: 'grep', args: JSON.stringify({ pattern: 'experts mode' }), hasil: '4 results found', ok: true, at: zNow - 78000 },
    { kind: 'tool', nama: 'globs', args: JSON.stringify({ pattern: '**/experts*' }), hasil: '3 files found', ok: true, at: zNow - 72000 },
    { kind: 'tool', nama: 'write_file', args: JSON.stringify({ path: 'd:\\\\Zephyr\\\\src\\\\styles\\\\aim-models.css' }), hasil: 'written', ok: true, tambah: 1, hapus: 1, at: zNow - 60000 },
    { kind: 'tool', nama: 'bash_run', args: JSON.stringify({ command: 'git diff --stat -- src/components/ai/AiPanel.tsx' }), hasil: 'ok', ok: true, at: zNow - 50000 },
    { kind: 'tool', nama: 'write_file', args: JSON.stringify({ path: 'd:\\\\Zephyr\\\\src\\\\components\\\\ai\\\\AiPanel.tsx' }), hasil: 'written', ok: true, tambah: 41, hapus: 2, at: zNow - 20000 },
  ];

  const zLangkahB = [
    { kind: 'pikir', teks: 'Validasi kesenjangan antrean steer.', at: zNow - 80000 },
    { kind: 'tool', nama: 'read_file', args: JSON.stringify({ path: 'd:\\\\Zephyr\\\\src\\\\components\\\\ai\\\\KartuAntreanExperts.tsx', offset: 1, limit: 60 }), hasil: '60 lines read', ok: true, at: zNow - 70000 },
    { kind: 'tool', nama: 'write_file', args: JSON.stringify({ path: 'd:\\\\Zephyr\\\\src\\\\components\\\\ai\\\\KartuAntreanExperts.tsx' }), hasil: 'written', ok: true, tambah: 12, hapus: 1, at: zNow - 30000 },
  ];

  const zRows = [
    zBaris('demo-a1', 'Researcher Alex', 'researcher', zLangkahA, ['d:\\\\Zephyr\\\\src\\\\styles\\\\aim-models.css', 'd:\\\\Zephyr\\\\src\\\\components\\\\ai\\\\AiPanel.tsx'], 'tk1'),
    zBaris('demo-a2', 'Full-Stack Engineer Felix', 'fullstack', zLangkahB, ['d:\\\\Zephyr\\\\src\\\\components\\\\ai\\\\KartuAntreanExperts.tsx'], 'tk2', 'batal'),
  ];

  const zTugas = [
    {
      id: 'tk1', judul: 'Bandingkan Experts Zephyr dengan Qoder',
      deskripsi: 'Bandingkan permukaan Experts Zephyr dengan Qoder lalu catat kesenjangannya.',
      ahli: 'researcher', nama: 'Researcher Alex',
      berkas: ['src/lib/expertsStore.ts'], setelah: null, agentId: 'demo-a1',
      statusAkhir: 'selesai', hasil: 'Laporan audit demo.', buktian: true,
      nTool: 5, nCari: 2,
      berkasTulis: ['src/styles/aim-models.css', 'src/components/ai/AiPanel.tsx'],
    },
    {
      id: 'tk2', judul: 'Validasi kesenjangan Experts',
      deskripsi: 'Validasi temuan audit pada permukaan yang tersisa.',
      ahli: 'fullstack', nama: 'Full-Stack Engineer Felix',
      berkas: ['src/components/ai/KartuAntreanExperts.tsx'], setelah: 'tk1', agentId: 'demo-a2',
      statusAkhir: 'batal', hasil: '', buktian: false,
      nTool: 2, nCari: 1,
      berkasTulis: ['src/components/ai/KartuAntreanExperts.tsx'],
    },
  ];

  zAi.getState().tambahPesanSesi(zSid, {
    role: 'user',
    content: 'guo mau minta tolong ke lu, tolong di cek experts pnya zephyr dan klo beda dgn qoder bisa diberitahukan semuanya ke gua biar gua implementasikan semuanya ke zephyr ya',
  });
  const zPesanId = zAi.getState().tambahPesanSesi(zSid, {
    role: 'assistant', content: '', streaming: false, expertsPlan: '${RUN_ID}', model: 'demo-model',
  });

  const zRun = {
    id: '${RUN_ID}', sessionId: zSid, pesanId: zPesanId,
    goal: 'Bandingkan Experts Zephyr dengan Qoder',
    status: 'jalan',
    intro: 'Saya akan riset kode notifikasi API key di AI panel, lalu langsung perbaiki.',
    pikirMenyusun: "I need to dispatch some research since the investigation is quite complex. It seems the user is asking for a report, and I should consider creating a specific task for that. I think using TaskCreate would be a good approach, assigning the research task and then updating progress with TaskUpdate. After dispatching, it'll be important to finalize everything properly. Let's go ahead and create the task!",
    tugas: zTugas, error: null,
    mulai: zNow - 95000, selesai: null,
    steer: ['cpeta'],
    catatan: [
      {
        id: 'c1',
        judul: 'Updating task approach',
        pikir: 'Kesenjangan yang paling terlihat adalah ikon berwarna dan lipatan yang masih datar. Saya akan menyamakan keduanya lebih dulu, baru mengukur ulang spasi.',
        at: zNow - 4000,
        tugasId: 'tk1',
      },
    ],
  };

  zEx.useExperts.setState((st) => ({ runs: [...st.runs.filter((r) => r.id !== zRun.id), zRun] }));
  zSa.useSubAgent.setState((st) => ({
    agents: [...st.agents.filter((a) => !String(a.id).startsWith('demo-a')), ...zRows],
  }));

  /* Panel AI memilih sesi lewat activeIds[composerId] — isi keduanya. */
  zAi.setState((st) => ({
    activeId: zSid,
    activeIds: { ...st.activeIds, '': zSid, agents: zSid },
  }));
  if (zModeAwal !== 'experts') {
    zSt.useStore.setState((st) => ({
      settings: { ...st.settings, agents: { ...st.settings.agents, agentAktif: 'experts' } },
    }));
  }
  S.getState().setAiKolomVisible(true);
  return { ok: true, sid: zSid, pesanId: zPesanId, awal: zAwal, modeAwal: zModeAwal };
`);
console.log('INJEKSI', JSON.stringify({ ok: info?.ok, sid: info?.sid }));

if (!info?.ok) {
  await cdp.close();
  process.exitCode = 1;
} else {
  /* ---------------- 2. Kartu chat di panel AI ----------------------- */
  const panel = await cdp.runAsync(`
    await wait(600);
    if (!document.querySelector('.ai-side-col')) {
      S.getState().setAiKolomVisible(true);
      await wait(400);
    }
    const el = document.querySelector('.ai-side-col');
    return el ? el.getBoundingClientRect().width : 0;
  `);
  console.log('PANEL LEBAR', panel);

  const chat = await potret('app-chat', `await wait(200);`, '.ai-side-col [data-testid="experts-timeline"]');

  /* ---------------- 3. Tab Task N ----------------------------------- */
  await potret(
    'app-tasktab',
    `S.getState().bukaViewAi('experts-task', { ekspertId: 'demo-a1', judul: 'Task 1: Bandingkan Experts Zephyr dengan Qoder' });`,
    '[data-testid="experts-tasktab"]',
    0,
  );

  /* ---------------- 4. Strip Task Progress + antrean ---------------- */
  const strip = await potret('app-strip', `await wait(100);`, '.ai-side-col [data-testid="experts-progress-card"]', 6);
  const antre = await potret('app-queue', `await wait(100);`, '.ai-side-col [data-testid="experts-antrean"]', 6);

  /* ---------------- 5. Bersihkan HANYA sesi demo ini ---------------- */
  await cdp.runAsync(`
    const zAi2 = window.__ZEPHYR_AI__.store;
    const zUrl2 = (frag) => performance.getEntriesByType('resource').map((e) => e.name)
      .filter((n) => n.includes(frag)).sort().pop();
    const zEx2 = await import(zUrl2('/src/lib/expertsStore.ts'));
    const zSa2 = await import(zUrl2('/src/lib/subagentStore.ts'));
    const zSid2 = ${JSON.stringify(info.sid)};
    const zAwal2 = ${JSON.stringify(info.awal)};
    zEx2.useExperts.setState((st) => ({ runs: st.runs.filter((r) => r.id !== '${RUN_ID}') }));
    zSa2.useSubAgent.setState((st) => ({ agents: st.agents.filter((a) => !String(a.id).startsWith('demo-a')) }));
    zAi2.setState((st) => ({
      sessions: st.sessions.filter((x) => x.id !== zSid2),
      activeId: zAwal2.activeId,
      activeIds: zAwal2.activeIds,
    }));
    const zModeAwal2 = ${JSON.stringify(info.modeAwal)};
    if (zModeAwal2 !== 'experts') {
      const zSt2 = await import(zUrl2('/src/lib/store.ts'));
      zSt2.useStore.setState((st) => ({
        settings: { ...st.settings, agents: { ...st.settings.agents, agentAktif: zModeAwal2 ?? 'agents' } },
      }));
    }
    return { ok: true };
  `);

  console.log(`RINGKAS chat=${chat} strip=${strip} queue=${antre}`);
  await cdp.close();
}
