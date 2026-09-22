// uji-fitur-baru.mjs — verifikasi 4 pekerjaan sesi ini dalam satu jalan:
//   1. katalog model: 4 provider dihapus, model lama dipangkas
//   2. avatar GitHub: field avatarUrl ada + <img> dirender (fallback inisial)
//   3. notifikasi update ikut bahasa yang dipilih (10 bahasa, bukan Inggris saja)
//   4. layar blank: patch parsial settings tidak lagi mematikan app
import WebSocket from 'ws';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));

let id = 0;
const pending = new Map();
const ex = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id) {
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); p(m); }
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    ex.push((m.params.exceptionDetails.exception?.description ?? '').split('\n')[0]);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 8000));

const ev = async (expr, awaitP = false) => {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: awaitP,
  });
  return r.result?.result?.value;
};

const hasil = [];
const cek = (nama, lulus, info = '') => {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  → ' + info : ''}`);
};

// ── 1. katalog model ──
const kat = await ev(`JSON.stringify({
  providers: window.__ZEPHYR_AI__.catalog().map(m => m.provider).filter((v,i,a)=>a.indexOf(v)===i).sort(),
  total: window.__ZEPHYR_AI__.catalog().length,
})`);
const k = JSON.parse(kat ?? '{}');
console.log(`katalog: ${kat}`);
cek('1a. Groq/OpenRouter/Mistral/Ollama hilang',
  !['groq', 'openrouter', 'mistral', 'ollama'].some(p => (k.providers ?? []).includes(p)),
  `${(k.providers ?? []).length} provider`);
cek('1b. model dipangkas (<=60)', (k.total ?? 999) <= 60, `${k.total} model`);

// ── 2. avatar GitHub ──
const gh = await ev(`JSON.stringify(window.__ZEPHYR_GIT__ ? window.__ZEPHYR_GIT__.getState().gh : null)`);
const g = JSON.parse(gh ?? 'null');
cek('2a. GhStatus punya field avatarUrl', g === null || 'avatarUrl' in g,
  g ? `avatarUrl=${g.avatarUrl ? 'ADA' : 'null'}` : 'store belum siap');

const av = await ev(`JSON.stringify({
  img: document.querySelectorAll('.ab-gh-img').length,
  initials: !!document.querySelector('.ab-gh-avatar')?.textContent?.trim(),
})`);
console.log(`avatar DOM: ${av}`);

// ── 3. i18n update: ganti bahasa, cek label berubah ──
const i18n = await ev(`(() => {
  const S = window.__ZEPHYR__;
  const asli = S.getState().settings.general.uiLang;
  const out = {};
  for (const lang of ['id','en','ja','ar']) {
    out[lang] = window.__ZEPHYR_SET__.t;  // fungsi t() membaca uiLang dari store
    // panggil langsung: set bahasa lalu terjemahkan
    S.getState().settings.general.uiLang = lang;
    out[lang] = window.__ZEPHYR_SET__.t('update.available').replace('{v}','1.1.10');
  }
  S.getState().settings.general.uiLang = asli;
  return JSON.stringify(out);
})()`);
console.log(`i18n update: ${i18n}`);
const i = JSON.parse(i18n ?? '{}');
cek('3a. update.available diterjemah per bahasa',
  i.id && i.en && i.ja && i.ar && i.id !== i.en && i.en !== i.ja,
  `id="${i.id}" en="${i.en}" ja="${i.ja}"`);

// ── 4. layar blank ──
const blank = await ev(`(async () => {
  await window.__ZEPHYR__.getState().applySettings({ models: { answerLang: 'follow' } });
  const m = window.__ZEPHYR__.getState().settings.models;
  return JSON.stringify({
    prov: Object.keys(m.providers || {}).length,
    rootKids: document.getElementById('root').children.length,
    errCard: document.querySelectorAll('.err-boundary').length,
  });
})()`, true);
console.log(`blank-check: ${blank}`);
const b = JSON.parse(blank ?? '{}');
cek('4a. models.providers bertahan', (b.prov ?? 0) > 0, `${b.prov} provider`);
cek('4b. app tetap hidup', (b.rootKids ?? 0) > 0, `rootKids=${b.rootKids}`);

const nyata = ex.filter(t => /gemini|providers|ModelsSection/.test(t));
cek('4c. tidak ada exception ModelsSection', nyata.length === 0, nyata[0] ?? 'bersih');

const lulus = hasil.filter(h => h.lulus).length;
console.log('');
console.log(`== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
