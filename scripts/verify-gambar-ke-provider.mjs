/*
 * verify-gambar-ke-provider.mjs — gambar benar-benar IKUT di body request.
 *
 * Pakai:  node scripts/verify-gambar-ke-provider.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223, vite di :5173,
 *         dan satu provider yang punya key. TIDAK memanggil jaringan: yang
 *         dibuktikan adalah BODY yang disusun sebelum dikirim, direkam lewat
 *         perekam milik Rust (`ai_capture_*`).
 *
 * Kenapa harness ini ada: selama `PAYLOAD_MAX_CHARS` lebih kecil dari blok tetap
 * (system prompt agen), pass pemotongan menyala di SETIAP request, dan pass
 * terakhir melepas gambar giliran terakhir (`contextBudget.ts`). Gejalanya:
 * pesan di store `adaGambar: true`, body ke provider `image_url: 0`, dan model
 * menjawab seolah tidak ada gambar. Angka itu yang dikunci di sini.
 *
 *   G1  Gambar diterima store (draftImages) setelah addDraftImage.
 *   G2  Ada rekaman request ke provider.
 *   G3  Body memuat `image_url` (adapter OpenAI-compatible) — bukan nol.
 *   G4  Body memuat data PNG-nya (base64 yang kita kirim).
 *   G5  Pesan user di body TIDAK dipotong ke 400 karakter (tanda pass
 *       potong-terakhir tidak menyala untuk giliran ini).
 */

import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('gambar-provider');

/* 1x1 PNG merah yang sah — byte nyata, jadi tidak ada jalur "format ditolak". */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find(
  (x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'),
);
if (!t) {
  R.check('G0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 60; i++) {',
    '  if (typeof S !== "undefined" && S && typeof S.getState === "function" && typeof X !== "undefined" && X && X.store) break;',
    '  await wait(500);',
    '}',
    'out.siap = typeof S !== "undefined" && !!S && typeof S.getState === "function";',
    'if (!out.siap) return out;',
    'const CMDS = await import("/src/lib/commands.ts");',
    'out.payloadMax = (await import("/src/lib/contextBudget.ts")).PAYLOAD_MAX_CHARS;',
    '',
    '/* Keadaan awal. */',
    'const awal = { model: X.store.getState().model, provider: X.store.getState().provider };',
    '',
    '/* G1: gambar masuk draft. */',
    `out.gambarDiterima = await X.store.getState().addDraftImage(${JSON.stringify(PNG)});`,
    'out.draft = X.store.getState().draftImages.length;',
    '',
    '/* Rekam request; bersihkan dulu supaya rekaman lama tidak terbaca. */',
    'await CMDS.aiCaptureClear();',
    'await CMDS.aiCaptureSet(true);',
    'const sesiId = X.store.getState().newChat();',
    'await wait(600);',
    'let err = null;',
    'try { await X.store.getState().send("Sebutkan satu warna dalam satu kata."); }',
    'catch (e) { err = String((e && (e.message || e)) || e); }',
    'out.err = err;',
    'for (let i = 0; i < 300; i++) {',
    '  const b = X.store.getState().agentBusy || X.store.getState().streaming;',
    '  if (!b) break;',
    '  await wait(500);',
    '}',
    'await wait(2500);',
    '',
    '/* G2-G5: periksa rekaman. */',
    'const cap = await CMDS.aiCaptureGet();',
    'const rec = Array.isArray(cap) ? cap[1] : cap;',
    'out.jumlahRekaman = (rec ?? []).length;',
    'const pertama = (rec ?? [])[0] ?? null;',
    'if (pertama) {',
    '  const j = JSON.stringify(pertama.body);',
    '  out.modelDiKabel = pertama.model;',
    '  out.jumlahImageUrl = (j.match(/image_url/g) || []).length;',
    '  out.adaDataPng = j.includes("data:image/png;base64");',
    '  const msgs = (pertama.body && pertama.body.messages) || [];',
    '  const user = msgs.find((m) => m.role === "user");',
    '  /*',
    '   * The OpenAI adapter rewrites a message that carries images into an ARRAY',
    '   * of parts (text + image_url), so reading `.content` as a string here',
    '   * reports 0 and would fail a perfectly correct request. Join the text',
    '   * parts instead - the assertion is about how much TEXT survived.',
    '   */',
    '  const isi = user',
    '    ? typeof user.content === "string"',
    '      ? user.content',
    '      : Array.isArray(user.content)',
    '        ? user.content.filter((p) => p && p.type === "text").map((p) => String(p.text ?? "")).join("\\n")',
    '        : ""',
    '    : "";',
    '  out.userLen = isi.length;',
    '  out.userDipitongKe400 = /hanya 400 pertama yang dikirim/.test(isi);',
    '  out.adaCatatanGambarDilepas = /gambar dilepas/.test(isi);',
    '}',
    '',
    '/* Pulihkan. */',
    'await CMDS.aiCaptureSet(false);',
    'await X.store.getState().setModel(awal.model, awal.provider);',
    'await wait(600);',
    'out.dipulihkan = X.store.getState().model;',
    'return out;',
  ].join('\n'),
  400000,
);

R.check('G0', out.siap === true, `app siap (PAYLOAD_MAX_CHARS=${out.payloadMax})`);
R.check('G1', out.gambarDiterima === true && out.draft === 1, `addDraftImage=${out.gambarDiterima}, draft=${out.draft}`);
R.check('G2', (out.jumlahRekaman ?? 0) > 0, `rekaman request=${out.jumlahRekaman} (err=${out.err ?? 'null'})`);
R.check(
  'G3',
  (out.jumlahImageUrl ?? 0) > 0,
  `image_url di body=${out.jumlahImageUrl} (model=${out.modelDiKabel})`,
);
R.check('G4', out.adaDataPng === true, `data PNG ada di body=${out.adaDataPng}`);
R.check(
  'G5',
  out.userDipitongKe400 === false && out.adaCatatanGambarDilepas === false && (out.userLen ?? 0) > 400,
  `panjang pesan user=${out.userLen}, dipotong-400=${out.userDipitongKe400}, catatan gambar dilepas=${out.adaCatatanGambarDilepas}`,
);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
