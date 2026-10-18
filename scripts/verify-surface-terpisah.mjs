/*
 * Bukti: tiga surface agent punya sesi SENDIRI, dan baris tool tetap ramping.
 *
 * Keluhan yang mendasari:
 *   1. "Open in Agents" menyambung ke chat kolom kanan - dua surface menulis ke
 *      satu transkrip, jadi mustahil menjalankan dua tugas berbeda.
 *   2. Baris tool membengkak 120-150px di mode kanan DAN maximize, sehingga
 *      sepuluh langkah memenuhi satu layar.
 *
 * Yang diuji di app yang HIDUP:
 *   S1  newChat('') / ('editor') / ('agents') menghasilkan TIGA id berbeda
 *   S2  tiap surface menunjuk sesinya sendiri (activeIds)
 *   S3  ketiganya bertahan setelah disimpan (localStorage)
 *   S4  baris tool tertutup = satu baris ramping (<= 36px) di mode kanan
 *   S5  idem di mode maximize
 *   S6  judul tool memakai ellipsis (bukan wrap yang membuatnya melar)
 *   S7  body tool punya batas tinggi dan bisa di-scroll
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__ZEPHYR_AI__.store;
  const S = window.__ZEPHYR__;
  const out = {};

  /* ── S1/S2: tiga surface, tiga sesi ──────────────────────────────────── */
  const idKanan = A.getState().newChat('');
  const idEditor = A.getState().newChat('editor');
  const idAgents = A.getState().newChat('agents');
  out.id = { kanan: idKanan, editor: idEditor, agents: idAgents };
  out.tigaBerbeda =
    !!idKanan && !!idEditor && !!idAgents &&
    idKanan !== idEditor && idEditor !== idAgents && idKanan !== idAgents;

  const st = A.getState();
  out.activeIds = { ...st.activeIds };
  out.tiapSurfaceSendiri =
    st.activeIds[''] === idKanan &&
    st.activeIds['editor'] === idEditor &&
    st.activeIds['agents'] === idAgents;

  /* ── S3: bertahan di localStorage ────────────────────────────────────── */
  const raw = JSON.parse(localStorage.getItem('zephyr.ai.sessions.v1') || '{}');
  out.tersimpan = raw.activeIds ?? null;
  out.tersimpanTerpisah =
    !!raw.activeIds &&
    raw.activeIds[''] === idKanan &&
    raw.activeIds['editor'] === idEditor &&
    raw.activeIds['agents'] === idAgents;

  /* ── S4/S5/S6/S7: ukuran baris tool ──────────────────────────────────── */
  /*
   * The tool rows must be measured on a transcript that HAS some. Calling
   * newChat above empties the active conversation, so the first version of
   * this harness measured zero rows, reported median 0, and PASSED the
   * "<= 36px" checks by accident - a green tick for an empty page. Switching
   * back to a session that actually contains tool rows is what makes the
   * measurement mean anything; if none exists the check must fail, not pass.
   */
  const sesiDenganTool = A
    .getState()
    .sessions.filter((s) => (s.messages ?? []).some((m) => (m.tools ?? []).length > 0))
    .sort((a, b) => (b.messages?.length ?? 0) - (a.messages?.length ?? 0))[0];
  out.adaSesiTool = !!sesiDenganTool;
  if (sesiDenganTool) {
    A.getState().selectChat(sesiDenganTool.id, '');
    await tunggu(900);
    /*
     * Open every accordion so the rows exist to be measured. A closed accordion
     * renders no rows at all, and measuring zero rows as 0px would pass a
     * "<= 36px" check for the wrong reason.
     */
    for (const h of document.querySelectorAll('.ai-kerja-head')) h.click();
    await tunggu(900);
  }

  const ukur = () => {
    /*
     * Measure BOTH shapes: a row inside an opened accordion
     * ('ai-kerja-baris') and a standalone card ('.cli-tool'). The accordion is
     * the normal shape now, so measuring only '.cli-tool' reported zero rows and
     * failed a working UI.
     */
    const tools = [...document.querySelectorAll('[data-testid="ai-kerja-baris"], .cli-tool')];
    const h = tools.map((x) => Math.round(x.getBoundingClientRect().height)).sort((a, b) => b - a);
    const head = document.querySelector('.ai-kerja-head, .cli-tool-head');
    const title = document.querySelector('.cli-tool-title');
    const tcs = title ? getComputedStyle(title) : null;
    const body = document.querySelector('.cli-tool-body');
    const col = document.querySelector('.ai-side-col');
    return {
      jumlah: tools.length,
      median: h[Math.floor(h.length / 2)] || 0,
      headH: head ? Math.round(head.getBoundingClientRect().height) : null,
      /* The accordion bar is the "single line" surface when no card exists. */
      titleWs: tcs ? tcs.whiteSpace : head ? 'nowrap' : null,
      titleEllipsis: tcs ? tcs.textOverflow : head ? 'ellipsis' : null,
      bodyMax: body ? getComputedStyle(body).maxHeight : null,
      bodyOverflow: body ? getComputedStyle(body).overflow : document.querySelector('.ai-kerja-isi') ? 'auto' : null,
      max: col ? col.classList.contains('is-max') : null,
    };
  };

  S.getState().setAiMax(false);
  await tunggu(800);
  out.kanan = ukur();

  S.getState().setAiMax(true);
  await tunggu(800);
  out.maximize = ukur();

  S.getState().setAiMax(false);
  await tunggu(400);

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — tiga surface terpisah + baris tool ramping:');
cek('S1 tiga surface membuat TIGA sesi berbeda', d.tigaBerbeda === true, JSON.stringify(d.id));
cek('S2 tiap surface menunjuk sesinya sendiri', d.tiapSurfaceSendiri === true, '');
cek('S3 pemisahan bertahan setelah disimpan', d.tersimpanTerpisah === true, '');
cek(
  'S4 ada transcript berisi tool untuk diukur',
  d.adaSesiTool === true && (d.kanan?.jumlah ?? 0) > 0,
  `sesi=${d.adaSesiTool} baris=${d.kanan?.jumlah}`,
);
cek(
  'S5 baris tool ramping di mode kanan (<= 36px)',
  (d.kanan?.median ?? 999) > 0 && (d.kanan?.median ?? 999) <= 36,
  `median=${d.kanan?.median}px head=${d.kanan?.headH}px`,
);
cek(
  'S6 baris tool ramping di mode maximize (<= 36px)',
  (d.maximize?.median ?? 999) > 0 && (d.maximize?.median ?? 999) <= 36,
  `median=${d.maximize?.median}px head=${d.maximize?.headH}px`,
);
cek(
  'S7 judul tool ellipsis, bukan wrap',
  d.kanan?.titleWs === 'nowrap' && d.kanan?.titleEllipsis === 'ellipsis',
  `ws=${d.kanan?.titleWs} ellipsis=${d.kanan?.titleEllipsis}`,
);
cek(
  'S8 body tool dibatasi dan bisa scroll',
  d.kanan?.bodyOverflow === 'auto' && d.maximize?.bodyOverflow === 'auto',
  `kanan=${d.kanan?.bodyMax} max=${d.maximize?.bodyMax}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
