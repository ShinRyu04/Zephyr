/**
 * Uji TERMINAL pada exe RILIS, dengan urutan yang benar.
 *
 * Pelajaran dari percobaan sebelumnya: panel bottom default membuka tab
 * Problems/Output/Debug, dan di tab itu .pane-empty menawarkan "Shell",
 * "Private" dan "AI Agent…". Jadi menekan Ctrl+J saja TIDAK membuka terminal -
 * itu membuka panelnya. Terminal baru ada setelah "Shell" diklik.
 *
 * Yang diperiksa:
 *  1. Panel bottom benar-benar muncul.
 *  2. Tab Terminal aktif dan pane-nya ter-mount (.xterm-pane + .xterm).
 *  3. Prompt shell benar-benar datang - bukti PTY hidup, bukan kotak kosong.
 *  4. PTY punya ukuran masuk akal (bukan 0x0 - jebakan klasik saat fit).
 *  5. Tidak ada error console.
 *
 * Pakai: node scripts/uji-terminal-rilis.mjs <port>
 */
const PORT = Number(process.argv[2] ?? 9444);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.url.includes('tauri.localhost')) ?? list.find((t) => t.type === 'page');
if (!page) {
  console.error('exe rilis tidak ketemu di port ' + PORT);
  process.exit(1);
}
console.log('target:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const tunggu = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m);
    tunggu.delete(m.id);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push((m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION: ' + (m.params.exceptionDetails?.text ?? ''));
  }
};

function kirim(method, params = {}) {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((r) => tunggu.set(n, r));
}
async function ev(x) {
  const r = await kirim('Runtime.evaluate', { expression: x, returnByValue: true });
  return r.result?.result?.value;
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const hasil = [];
function cek(nama, lulus, catatan) {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${catatan ? '  -> ' + catatan : ''}`);
}

await kirim('Runtime.enable');

// 1. Buka panel bottom. Ctrl+J memunculkan panelnya; tab terminal dipilih di
//    langkah berikutnya.
await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(e => /terminal/i.test(e.getAttribute('aria-label') || e.title || ''));
  if (b) b.click();
  return 1;
})()`);
await tidur(2500);

const panel = JSON.parse(await ev(`JSON.stringify({ panel: !!document.querySelector('.panel-area'), tabs: document.querySelectorAll('.pts-tab').length })`));
cek('panel bottom muncul', panel.panel && panel.tabs > 0, JSON.stringify(panel));

// 2. Pilih tab yang benar-benar tab terminal (bukan Problems/Output/Debug).
const tabTerpilih = await ev(`(() => {
  const tabs = [...document.querySelectorAll('.pts-tab')];
  const nama = tabs.map(t => t.dataset.tab || '');
  const target = tabs.find(t => /term|terminal|shell/i.test((t.dataset.tab || '') + ' ' + t.innerText));
  if (target) { target.click(); return 'tab:' + (target.dataset.tab || target.innerText); }
  // Tidak ada tab bernama terminal -> pakai tab terakhir (biasanya terminal).
  const last = tabs[tabs.length - 1];
  if (last) { last.click(); return 'tab-terakhir:' + nama.join('/'); }
  return 'tidak-ada-tab';
})()`);
await tidur(2500);
cek('tab terminal dipilih', String(tabTerpilih).startsWith('tab:'), String(tabTerpilih));

// 3. Klik "Shell" pada tawaran pane kosong, kalau ada.
const klikShell = await ev(`(() => {
  const kandidat = [...document.querySelectorAll('button, [role="menuitem"], .pane-empty button, li')];
  const b = kandidat.find(e => /^\\s*shell\\s*$/i.test((e.innerText || '').trim()));
  if (!b) return 'tidak-ada-tawaran-shell';
  b.click();
  return 'shell-diklik';
})()`);
await tidur(5000);

const setelah = JSON.parse(
  await ev(`JSON.stringify({
    paneEmpty: document.querySelectorAll('.pane-empty').length,
    xtermPane: document.querySelectorAll('.xterm-pane').length,
    xterm: document.querySelectorAll('.xterm').length,
    canvas: document.querySelectorAll('.xterm canvas').length,
    layar: document.querySelectorAll('.xterm-screen').length,
    pesan: document.querySelector('.pane-empty')?.innerText?.slice(0,120) ?? null
  })`),
);
/*
 * xterm's DEFAULT renderer is the DOM one, not canvas, so a healthy terminal
 * legitimately reports canvas=0. What proves it rendered is .xterm-screen plus
 * the row elements - asserting on canvas here produced a false failure the
 * first time this harness ran against a release build.
 */
cek('pane terminal ter-mount', setelah.xterm > 0 && setelah.layar > 0, JSON.stringify(setelah));

// 4. Prompt shell benar-benar datang.
let teksPrompt = '';
for (let i = 0; i < 24; i++) {
  teksPrompt = await ev(`[...document.querySelectorAll('.xterm-rows > div')].map(r => r.textContent).join('\\n')`);
  if (teksPrompt && /[A-Za-z]:\\\\|\\(|\\)|PS |>|\\$/.test(teksPrompt)) break;
  await tidur(500);
}
const bersihPrompt = (teksPrompt || '').replace(/\u00a0/g, ' ').trim();
cek('prompt shell muncul (PTY hidup)', bersihPrompt.length > 0, bersihPrompt.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 140));

// 5. Ukuran sel terminal - bukan 0x0.
const ukuran = await ev(`(() => {
  const s = document.querySelector('.xterm-screen');
  const r = s?.getBoundingClientRect();
  const baris = document.querySelectorAll('.xterm-rows > div').length;
  return JSON.stringify({ w: Math.round(r?.width || 0), h: Math.round(r?.height || 0), baris });
})()`);
const u = JSON.parse(ukuran);
cek('terminal punya ukuran wajar (bukan 0x0)', u.w > 40 && u.h > 20, ukuran);

cek('tidak ada error console', errors.length === 0, errors.slice(0, 2).join(' ;; '));

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
