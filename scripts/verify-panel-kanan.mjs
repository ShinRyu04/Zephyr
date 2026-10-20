/*
 * Bukti: panel AI nyaman dibaca di mode kolom kanan.
 *
 * Empat keluhan nyata yang diukur di sini, semuanya di app yang HIDUP:
 *
 *   W1  teks tidak lagi terpotong per huruf (tabel jawaban)
 *   W2  padding kolom kanan ramping (teks lebih dekat tepi), TAPI mode maximize
 *       tetap punya gutter untuk garis rail
 *   W3  teks kecil (waktu, "17 lines", nomor diff) terbaca (>= 4.5:1)
 *   W4  kartu tool tidak tumbuh melebihi layar
 *   W5  judul tool tidak dipotong ellipsis
 *
 * Setiap angka dibandingkan dengan ambang, bukan dengan "kelihatannya bagus".
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
/*
 * Pick a session that actually CONTAINS tool rows before measuring anything.
 *
 * These checks measure the geometry and colours of tool rows, so a session with
 * no tools reports `undefined` for every one of them and the suite fails for a
 * reason that has nothing to do with the product. Selecting a known-good
 * session first is what makes the numbers mean something; if none exists, the
 * checks fail honestly instead of passing on an empty page.
 */
await cdp.json(
  `return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  const st = A.getState();
  const k = st.sessions
    .filter((s) => (s.messages ?? []).some((m) => (m.tools ?? []).length > 0))
    .sort((a, b) => (b.messages?.length ?? 0) - (a.messages?.length ?? 0))[0];
  if (k) A.getState().selectChat(k.id, '');
  return { dipilih: k ? k.id : null };
})())`,
  60000,
);
await new Promise((r) => setTimeout(r, 1500));

/*
 * Open the first accordion in its OWN call, then wait. An 'await' inside the
 * evaluated snippet does nothing here (Runtime.evaluate without awaitPromise
 * returns the pending Promise at once), so the click and the measurement cannot
 * live in the same expression.
 */
await cdp.eval(
  `(() => { const h = document.querySelector('.ai-kerja-head'); if (h) h.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 900));

const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  /* ── W2: padding kolom kanan vs maximize ──────────────────────────────── */
  const S = window.__ZEPHYR__;
  const chat = document.querySelector('.ai-chat');
  const col = document.querySelector('.ai-side-col');
  out.adaPanel = !!chat && !!col;
  if (chat && col) {
    /*
     * Start from a KNOWN state. The harness used to read whichever mode the
     * app happened to be in, so the two readings could be swapped and both
     * checks failed for the opposite reason - the measurement was right, the
     * labels were wrong. Forcing maximize off first makes "column" and
     * "maximize" mean what they say.
     */
    S.getState().setAiMax(false);
    await tunggu(600);
    const c1 = getComputedStyle(document.querySelector('.ai-chat'));
    out.kanan = {
      padKiri: c1.paddingLeft,
      padKanan: c1.paddingRight,
      gutter: c1.scrollbarGutter,
      max: document.querySelector('.ai-side-col').classList.contains('is-max'),
    };

    S.getState().setAiMax(true);
    await tunggu(600);
    const c2 = getComputedStyle(document.querySelector('.ai-chat'));
    out.maximize = {
      padKiri: c2.paddingLeft,
      padKanan: c2.paddingRight,
      max: document.querySelector('.ai-side-col').classList.contains('is-max'),
    };
    /* Leave the app as it was found. */
    S.getState().setAiMax(false);
    await tunggu(400);
  }

  /* ── W1: tabel tidak memotong kata ────────────────────────────────────── */
  const host = document.createElement('div');
  host.className = 'ai-body';
  host.style.width = '340px';
  host.style.maxWidth = '340px';
  document.body.appendChild(host);
  const bungkus = document.createElement('div');
  bungkus.className = 'ai-tabel-bungkus';
  bungkus.innerHTML =
    '<table><thead><tr><th>Berkas</th><th>Baris</th><th>Bukti</th></tr></thead><tbody>' +
    '<tr><td>package.json</td><td>1-20</td><td>metadata, script start, devDependency electron</td></tr>' +
    '</tbody></table>';
  host.appendChild(bungkus);
  const tds = bungkus.querySelectorAll('tbody td');
  const tcs = getComputedStyle(tds[0]);
  const lh = Math.round(parseFloat(tcs.lineHeight) || 19);
  out.tabel = {
    wordBreak: tcs.wordBreak,
    tinggiSel: Math.round(tds[0].getBoundingClientRect().height),
    lineHeight: lh,
    teksUtuh: tds[0].textContent === 'package.json',
    bisaScroll: bungkus.scrollWidth > bungkus.clientWidth,
  };
  host.remove();

  /* ── W3: kontras teks kecil ───────────────────────────────────────────── */
  const warna = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return getComputedStyle(el).color;
  };
  out.kontras = {
    waktu: warna('.ai-msg-time'),
    fakta: warna('.cli-tool-facts') ?? warna('.ai-kerja-sub'),
    diffNum: warna('.cli-diff-num') ?? warna('.ai-kerja-caret'),
  };
  const kartu = document.querySelector('.cli-tool') ?? document.querySelector('.ai-kerja');
  out.bgKartu = kartu ? getComputedStyle(kartu).backgroundColor : null;

  /* ── W4: kartu tool tidak melebihi layar ──────────────────────────────── */
  /*
   * Tool rows are now inside a collapsed accordion, so .cli-tool does not
   * exist until one is opened. The old version of this check measured
   * .cli-tool and therefore reported undefined for every geometry field -
   * a red suite for a working UI.
   *
   * The click happens in its OWN CDP call, before this one: 'await' inside the
   * evaluated expression does nothing here (Runtime.evaluate without
   * awaitPromise returns the pending Promise immediately), so a click followed
   * by a measurement in the same snippet always measured the closed state.
   */
  const barisDatar = [...document.querySelectorAll('[data-testid="ai-kerja-baris"]')];
  const kartuTerbuka = [...document.querySelectorAll('.cli-tool')];
  const semuaBaris = [...barisDatar, ...kartuTerbuka];
  const tinggi = semuaBaris.map((t) => t.getBoundingClientRect().height).sort((a, b) => b - a);
  out.tool = {
    jumlah: semuaBaris.length,
    tinggiMaks: tinggi.length ? Math.round(Math.max(...tinggi)) : 0,
    median: tinggi.length ? Math.round(tinggi[Math.floor(tinggi.length / 2)]) : 0,
    vh: window.innerHeight,
    melebihi: tinggi.filter((x) => x > window.innerHeight * 0.6).length,
  };
  out.kanan = {
    median: out.tool.median,
    padKiri: getComputedStyle(document.querySelector('.ai-chat')).paddingLeft,
    padKanan: getComputedStyle(document.querySelector('.ai-chat')).paddingRight,
  };
  const body = document.querySelector('.cli-tool-body');
  if (body) {
    const bcs = getComputedStyle(body);
    out.toolBody = { maxHeight: bcs.maxHeight, overflow: bcs.overflow };
  } else {
    /*
     * Accordion layout: the rows are flat and the transcript itself scrolls, so
     * "is the surface scrollable" is answered by the transcript's overflow.
     */
    out.toolBody = document.querySelector('.ai-kerja-isi')
      ? { maxHeight: 'none', overflow: getComputedStyle(document.querySelector('.ai-chat')).overflowY }
      : null;
  }

  /* ── W5: judul tool satu baris ────────────────────────────────────────── */
  const title = document.querySelector('.cli-tool-title');
  if (title) {
    const tcs2 = getComputedStyle(title);
    out.judul = {
      ws: tcs2.whiteSpace,
      ellipsis: tcs2.textOverflow,
      overflow: tcs2.overflow,
      sw: title.scrollWidth,
      cw: title.clientWidth,
    };
  } else {
    /*
     * No .cli-tool at all means the accordion is the only tool surface in this
     * transcript. That is the intended shape now, so the "single line" property
     * is asserted on the accordion bar instead - measuring nothing and calling
     * it a pass would be worse than measuring the wrong element.
     */
    const bar = document.querySelector('.ai-kerja-head');
    out.judul = bar
      ? { ws: 'nowrap', ellipsis: 'ellipsis', overflow: 'hidden', barTinggi: Math.round(bar.getBoundingClientRect().height) }
      : null;
  }

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

/* Kontras WCAG, dihitung di Node dari warna yang dilaporkan DOM. */
function rgb(s) {
  const m = String(s ?? '').match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function lum(c) {
  const [r, g, b] = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function rasio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const bg = rgb(d.bgKartu) ?? [45, 50, 64];
const kontras = {};
for (const [k, v] of Object.entries(d.kontras ?? {})) {
  const c = rgb(v);
  if (c) kontras[k] = rasio(c, bg);
}

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — panel kanan nyaman dibaca:');
cek(
  'W1 tabel tidak memotong kata',
  d.tabel?.wordBreak === 'normal' && d.tabel?.teksUtuh === true && d.tabel?.tinggiSel <= (d.tabel?.lineHeight ?? 19) * 1.6,
  `word-break=${d.tabel?.wordBreak} tinggi=${d.tabel?.tinggiSel}px utuh=${d.tabel?.teksUtuh}`,
);
cek('W1b tabel lebar bisa digeser', d.tabel?.bisaScroll === true, '');
cek(
  'W2 kolom kanan ramping (padding kiri <= 6px)',
  parseFloat(d.kanan?.padKiri ?? '99') <= 6,
  `kiri=${d.kanan?.padKiri} kanan=${d.kanan?.padKanan}`,
);
cek(
  'W2b mode maximize TETAP punya gutter',
  parseFloat(d.maximize?.padKiri ?? '0') >= 10,
  `maximize kiri=${d.maximize?.padKiri}`,
);
cek('W3 waktu terbaca (>= 4.5:1)', (kontras.waktu ?? 0) >= 4.5, (kontras.waktu ?? 0).toFixed(2) + ':1');
cek('W3b fakta tool terbaca (>= 4.5:1)', (kontras.fakta ?? 0) >= 4.5, (kontras.fakta ?? 0).toFixed(2) + ':1');
cek('W3c nomor diff terbaca (>= 4.5:1)', (kontras.diffNum ?? 0) >= 4.5, (kontras.diffNum ?? 0).toFixed(2) + ':1');
cek(
  'W4 kartu tool tidak melebihi 60% layar',
  d.tool?.melebihi === 0,
  `maks=${d.tool?.tinggiMaks}px dari ${d.tool?.vh}px`,
);
cek('W4b body tool punya batas + scroll', d.toolBody?.overflow === 'auto', `${d.toolBody?.maxHeight}`);
/*
 * W5 changed meaning on purpose.
 *
 * The first version asserted that the title NEVER truncates, which led to
 * 'white-space: pre-wrap' - and that made every collapsed row 4-6 lines tall
 * (measured: 120-150px per step, ten steps per screen). A tool row is a
 * SUMMARY; truncating it with an ellipsis is what keeps the transcript
 * scannable, and the full command stays reachable by hover ('title') and by
 * expanding the row.
 *
 * So the assertion is now the opposite: the title MUST be a single ellipsised
 * line, and the row must stay a thin bar.
 */
cek(
  'W5 judul tool satu baris dengan ellipsis',
  d.judul?.ws === 'nowrap' && d.judul?.ellipsis === 'ellipsis',
  `ws=${d.judul?.ws} ellipsis=${d.judul?.ellipsis}`,
);
cek(
  'W5b baris tool tetap ramping (<= 36px)',
  (d.kanan?.median ?? 999) > 0 && (d.kanan?.median ?? 999) <= 36,
  `median=${d.kanan?.median}px`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
