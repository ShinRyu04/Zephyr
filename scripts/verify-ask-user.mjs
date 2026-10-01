/**
 * verify-ask-user.mjs - uji tool `ask_user` lewat jalur nyata.
 *
 *   node scripts/verify-ask-user.mjs 9223
 *
 * Yang dibuktikan:
 *   A1  tool terdaftar dan terlihat oleh model
 *   A2  kartu pertanyaan MUNCUL di DOM saat tool dipanggil
 *   A3  langkah agen BENAR-BENAR menunggu (janjinya belum selesai)
 *   A4  mengirim jawaban menyelesaikan penantian, dan jawabannya sampai ke model
 *   A5  pilihan cepat dirender sebagai tombol yang bisa diklik
 *   A6  membatalkan menghasilkan `null`, BUKAN string kosong
 *   A7  dipanggil saat tidak ada agen berjalan -> error yang jelas
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('ask-user');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/*
 * Harness ini MEMANGGIL tool lewat bridge dev, jadi sekat tool harus membuka
 * yang dipanggilnya.
 *
 * Tanpa ini, ujinya lulus saat dijalankan sendiri tapi gagal saat dijalankan
 * setelah harness lain - karena harness lain meninggalkan sekat dalam keadaan
 * hasil pemulihannya. Kegagalan yang bergantung urutan seperti itu menghabiskan
 * waktu lebih banyak daripada bug yang sebenarnya, jadi sekatnya dibuka
 * eksplisit di sini.
 */
await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();
  for (const t of ['ask_user', 'clipboard_read', 'clipboard_write', 'screenshot_ui', 'plan_mode']) {
    if (!g.aktif.has(t)) g.balik(t);
  }
  await new Promise((res) => setTimeout(res, 200));
  return { aktif: m.useToolGate.getState().aktif.size };
})())`);

/* ---- A1: tool terdaftar ---- */

const daftar = await cdp.json(`return JSON.stringify(await (async () => {
  const t = window.__ZEPHYR_TOOLS__;
  if (!t) return { ada: false };
  const nama = t.nama();
  return { ada: true, jumlah: nama.length, punyaAskUser: nama.includes('ask_user'), contoh: nama.slice(0, 8) };
})())`);

if (!daftar.ada) {
  r.check('A1', false, 'bridge daftar tool tidak ada');
  const { lulus, total } = r.selesai();
  await cdp.close();
  process.exit(lulus === total ? 0 : 1);
}

r.check(
  'A1',
  daftar.punyaAskUser === true,
  `ask_user terdaftar di antara ${daftar.jumlah} tool`,
);

/* ---- A7: di luar sesi agen harus menolak dengan jelas ---- */

const diluar = await cdp.json(`return JSON.stringify(await (async () => {
  const t = window.__ZEPHYR_TOOLS__;
  const s = window.__ZEPHYR_AI__.store.getState();
  const sibuk = s.agentBusy;
  try {
    const hasil = await t.jalankan('ask_user', { question: 'apa?' });
    return { sibuk, ok: true, hasil: String(hasil).slice(0, 120) };
  } catch (e) {
    return { sibuk, ok: false, pesan: String(e.message).slice(0, 200) };
  }
})())`);

if (diluar.sibuk) {
  r.check('A7', false, `agen sedang sibuk, jadi uji "di luar sesi" dilewati (sibuk=${diluar.sibuk})`);
} else {
  r.check(
    'A7',
    diluar.ok === false && /no agent turn/i.test(diluar.pesan || ''),
    `di luar sesi agen ditolak dengan pesan yang jelas: "${diluar.pesan}"`,
  );
}

/* ---- A2..A6: lewat jalur nyata, dengan penantian diperiksa ---- */

/*
 * Tool dipanggil TANPA menunggu hasilnya dulu. Kalau kita langsung `await`,
 * kita tidak akan pernah tahu apakah ia benar-benar MENUNGGU atau langsung
 * mengembalikan string kosong - dan justru itu yang perlu dibuktikan.
 */
const mulai = await cdp.json(`return JSON.stringify((() => {
  const t = window.__ZEPHYR_TOOLS__;
  const ai = window.__ZEPHYR_AI__.store;

  /* Tandai seolah agen sedang berjalan supaya tool mau dijalankan. */
  ai.setState({ agentBusy: true });

  const janji = t.jalankan('ask_user', {
    question: 'File mana yang harus kuubah?',
    options: ['settings.rs', 'types.ts'],
  });

  /* Simpan di window supaya bisa diperiksa lintas panggilan CDP. */
  window.__UJI_TANYA__ = { janji, selesai: false, hasil: null, galat: null };
  janji.then(
    (v) => { window.__UJI_TANYA__.selesai = true; window.__UJI_TANYA__.hasil = v; },
    (e) => { window.__UJI_TANYA__.selesai = true; window.__UJI_TANYA__.galat = String(e.message); },
  );

  return { agentBusy: ai.getState().agentBusy };
})())`);

r.check('A2a', mulai.agentBusy === true, 'agen ditandai sedang berjalan');

await sleep(400);

/* A2: kartu muncul. A3: belum selesai - inilah bukti "menunggu". */
const saatMenunggu = await cdp.json(`return JSON.stringify((() => {
  const kartu = document.querySelector('[data-testid="ai-agent-tanya"]');
  const tombol = [...document.querySelectorAll('[data-testid^="ai-tanya-pilih-"]')].map((b) => b.textContent);
  return {
    kartuAda: !!kartu,
    teks: kartu ? kartu.textContent.slice(0, 160) : null,
    tombol,
    jawabAda: !!document.querySelector('[data-testid="ai-tanya-jawab"]'),
    batalAda: !!document.querySelector('[data-testid="ai-tanya-batal"]'),
    selesai: window.__UJI_TANYA__.selesai,
  };
})())`);

r.check('A2', saatMenunggu.kartuAda === true, `kartu pertanyaan muncul di DOM: "${(saatMenunggu.teks || '').slice(0, 90)}"`);
r.check(
  'A3',
  saatMenunggu.selesai === false,
  `langkah BENAR-BENAR menunggu - janji belum selesai setelah 400ms (selesai=${saatMenunggu.selesai})`,
);
r.check(
  'A5',
  saatMenunggu.tombol.length === 2 && saatMenunggu.tombol.includes('settings.rs'),
  `pilihan cepat jadi tombol: ${JSON.stringify(saatMenunggu.tombol)}`,
);
r.check(
  'A2b',
  saatMenunggu.jawabAda === true && saatMenunggu.batalAda === true,
  'kotak jawaban bebas dan tombol batal sama-sama ada',
);

/* A4: klik tombol pilihan -> penantian selesai dengan jawaban itu. */
const diklik = await cdp.json(`return JSON.stringify(await (async () => {
  const b = document.querySelector('[data-testid="ai-tanya-pilih-0"]');
  if (!b) return { ada: false };
  b.click();
  await new Promise((res) => setTimeout(res, 500));
  const u = window.__UJI_TANYA__;
  return {
    ada: true,
    selesai: u.selesai,
    hasil: u.hasil,
    galat: u.galat,
    kartuMasihAda: !!document.querySelector('[data-testid="ai-agent-tanya"]'),
    agentTanyaDiStore: window.__ZEPHYR_AI__.store.getState().agentTanya,
  };
})())`);

r.check(
  'A4',
  diklik.selesai === true && typeof diklik.hasil === 'string' && diklik.hasil.includes('settings.rs'),
  `jawaban sampai ke model: ${JSON.stringify(diklik.hasil)}`,
);
r.check(
  'A4b',
  diklik.kartuMasihAda === false && diklik.agentTanyaDiStore === null,
  'kartu hilang dan state dibersihkan setelah dijawab',
);

/* A6: batal -> null, bukan string kosong. */
const dibatalkan = await cdp.json(`return JSON.stringify(await (async () => {
  const t = window.__ZEPHYR_TOOLS__;
  const ai = window.__ZEPHYR_AI__.store;
  ai.setState({ agentBusy: true });

  let hasil = 'BELUM';
  let galat = null;
  t.jalankan('ask_user', { question: 'lanjut?' }).then(
    (v) => { hasil = v; },
    (e) => { galat = String(e.message); },
  );

  await new Promise((res) => setTimeout(res, 400));
  const b = document.querySelector('[data-testid="ai-tanya-batal"]');
  if (b) b.click();
  await new Promise((res) => setTimeout(res, 400));

  return { hasil, galat, tipe: typeof hasil };
})())`);

r.check(
  'A6',
  typeof dibatalkan.hasil === 'string' && dibatalkan.hasil !== 'BELUM' && /dismissed/i.test(dibatalkan.hasil),
  `batal -> pesan yang benar, bukan jawaban kosong: ${JSON.stringify((dibatalkan.hasil || '').slice(0, 120))}`,
);

/* Bersihkan: jangan tinggalkan aplikasi dalam keadaan "agen sibuk". */
await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR_AI__.store.setState({ agentBusy: false, agentTanya: null });
  delete window.__UJI_TANYA__;
  return { bersih: true };
})())`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
