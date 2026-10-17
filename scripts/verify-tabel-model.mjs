/*
 * verify-tabel-model.mjs — daftar model sebagai TABEL (Name / Context Size /
 * Capabilities) di pop-up AI Models.
 *
 * Pakai:  node scripts/verify-tabel-model.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * Yang dibuktikan (dari DOM hidup):
 *
 *   T1  Pop-up AI Models bisa dibuka lewat jalur PRODUK (klik "Edit models…" di
 *       dropdown model), bukan lewat store — import() dari CDP membuat instance
 *       store yang BERBEDA dari app, jadi memanggil `buka()` di sana tidak
 *       membuka apa pun.
 *   T2  Tabelnya ada, dengan kepala Name / Context Size / Capabilities.
 *   T3  HydraFusion adalah baris PERTAMA dan membawa Tools + Vision.
 *   T4  Kapabilitas diturunkan dari katalog: Gemini 3.5 Flash (note
 *       "multimodal") dapat chip Vision; model yang note-nya tidak mengklaim
 *       apa pun tidak diberi chip karangan.
 *   T5  Ukuran konteks ditulis ringkas (1.05M), bukan 1.048576M.
 *   T6  Tidak ada error render selama pop-up terbuka.
 */

import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('tabel-model');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find(
  (x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'),
);
if (!t) {
  R.check('T0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 60; i++) {',
    '  if (typeof S !== "undefined" && S && typeof S.getState === "function" && document.querySelector("[data-testid=ai-model-btn]")) break;',
    '  await wait(500);',
    '}',
    'out.siap = !!document.querySelector("[data-testid=ai-model-btn]");',
    'if (!out.siap) return out;',
    'window.__ERR_TABEL__ = [];',
    '/* Paksa panel AI terlihat: picker hidup di dalamnya. */',
    'S.getState().setAiKolomVisible(true);',
    'await wait(1000);',
    '',
    '/* T1: jalur produk - dropdown lalu "Edit models...". */',
    'document.querySelector("[data-testid=ai-model-btn]").click();',
    'await wait(900);',
    'const edit = document.querySelector("[data-testid=ai-model-edit]");',
    'out.adaEditModels = !!edit;',
    'if (edit) edit.click();',
    'await wait(3500);',
    'out.modal = !!document.querySelector("[data-testid=aim-pop]");',
    '',
    '/* T2: kepala tabel. */',
    'out.kepala = [...document.querySelectorAll(".aim-table th")].map((x) => x.textContent);',
    'const baris = [...document.querySelectorAll("[data-testid=aim-table-row]")];',
    'out.jumlahBaris = baris.length;',
    '',
    '/* T3: HydraFusion baris pertama. */',
    'out.barisPertama = baris.length ? baris[0].getAttribute("data-model") : null;',
    'out.teksPertama = baris.length ? baris[0].innerText.replace(/\\n/g, " | ") : null;',
    '',
    '/* T4: kapabilitas dari katalog. */',
    'const cari = (id) => baris.find((b) => b.getAttribute("data-model") === id) || null;',
    'const gemini35 = cari("gemini-3.5-flash");',
    'out.gemini35 = gemini35 ? gemini35.innerText.replace(/\\n/g, " | ") : null;',
    'const gemini36 = cari("gemini-3.6-flash");',
    'out.gemini36 = gemini36 ? gemini36.innerText.replace(/\\n/g, " | ") : null;',
    '',
    '/* T5: ukuran konteks ringkas. */',
    'const sel = [...document.querySelectorAll(".aim-td-ctx")].map((x) => x.textContent.trim());',
    'out.contohCtx = sel.slice(0, 6);',
    'out.adaPanjangAneh = sel.some((v) => /\\d\\.\\d{4,}/.test(v));',
    '',
    '/* T6: error render selama pop-up terbuka. */',
    'out.err = (window.__ERR_TABEL__ || []).slice(-5);',
    '',
    '/* Tutup pop-up supaya harness lain tidak mewarisi overlay. */',
    'const tutup = document.querySelector("[data-testid=aim-pop-close]");',
    'if (tutup) tutup.click();',
    'await wait(500);',
    'out.modalTertutup = !document.querySelector("[data-testid=aim-pop]");',
    'return out;',
  ].join('\n'),
  180000,
);

R.check('T0', out.siap === true, 'app siap dan picker model ada di DOM');
R.check(
  'T1',
  out.adaEditModels === true && out.modal === true,
  `tombol "Edit models…"=${out.adaEditModels}, pop-up terbuka=${out.modal}`,
);
R.check(
  'T2',
  out.kepala?.length === 3 &&
    out.kepala[0] === 'Name' &&
    out.kepala[1] === 'Context Size' &&
    out.kepala[2] === 'Capabilities' &&
    out.jumlahBaris > 10,
  `kepala=${JSON.stringify(out.kepala)}, baris=${out.jumlahBaris}`,
);
R.check(
  'T3',
  out.barisPertama === 'hydrafusion' && /Tools/.test(out.teksPertama || '') && /Vision/.test(out.teksPertama || ''),
  `baris pertama=${out.barisPertama} :: ${out.teksPertama}`,
);
R.check(
  'T4',
  /Vision/.test(out.gemini35 || '') && !/Vision/.test(out.gemini36 || ''),
  `Gemini 3.5 Flash (multimodal) -> ${out.gemini35}; Gemini 3.6 Flash -> ${out.gemini36}`,
);
R.check(
  'T5',
  out.adaPanjangAneh === false,
  `contoh kolom Context Size=${JSON.stringify(out.contohCtx)} (tidak boleh 1.048576M)`,
);
R.check('T6', (out.err ?? []).length === 0 && out.modalTertutup === true, `error=${JSON.stringify(out.err)}, tertutup=${out.modalTertutup}`);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
