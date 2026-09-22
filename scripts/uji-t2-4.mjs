// uji-t2-4.mjs — verifikasi T2.4 Test Explorer.
//
// UJI NYATA: panel Test Explorer dibuka, deteksi runner dijalankan lewat Rust
// (`test_detect`), lalu satu runner benar-benar dijalankan lewat `tasks_run`.
//
// POLA PENTING (pelajaran harness lain): `cdp.eval` TIDAK menunggu promise.
// Pakai `cdp.json('return JSON.stringify(await (async () => { ... })())')` —
// helper itu yang mengurus await di sisi WebView2.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;

const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

console.log('=== T2.4: Test Explorer ===\n');

// ── V0: buka workspace Zephyr (panel butuh root) ──
await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().openWorkspace('D:/Zephyr');
  await new Promise((r) => setTimeout(r, 1200));
  return { ws: S.getState().workspace };
})())`, 90000);

// ── V0b: percayai workspace (task DIBLOKIR di folder yang belum dipercaya) ──
const trust = await cdp.json(`return JSON.stringify(await (async () => {
  const W = window.__ZEPHYR_WS__;
  if (!W) return { err: 'bridge ws tidak ada' };
  await W.setTrust('D:/Zephyr', true);
  await new Promise((r) => setTimeout(r, 600));
  return { trusted: W.trusted() };
})())`, 60000);
cek('workspace dipercaya (syarat menjalankan task)', trust.trusted === true, JSON.stringify(trust));

// ── V1: tab 'test' terdaftar + bisa dibuka ──
const tab = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PANEL__;
  if (!P) return { err: 'tanpa-bridge' };
  P.store.getState().setActiveTab('test');
  await new Promise((r) => setTimeout(r, 700));
  return { tabs: P.visibleTabs(), aktif: P.activeTab() };
})())`, 60000);
cek('tab "test" terdaftar di panel', Array.isArray(tab.tabs) && tab.tabs.includes('test'), (tab.tabs || []).join(','));
cek('tab "test" jadi aktif', tab.aktif === 'test', String(tab.aktif));

// ── V2: panel Test Explorer ter-render ──
const view = await cdp.json(`return JSON.stringify({
  ada: !!document.querySelector('[data-testid="test-view"]'),
})`);
cek('panel Test Explorer ter-render', view.ada === true);

// ── V3: deteksi runner lewat Rust ──
const detect = await cdp.json(`return JSON.stringify(await (async () => {
  const C = window.__ZEPHYR_TEST__;
  if (!C) return { err: 'bridge test tidak ada' };
  const root = window.__ZEPHYR__.getState().workspace;
  const r = await C.detect(root);
  return { root, n: r.length, ids: r.map((x) => x.id), nama: r.map((x) => x.nama) };
})())`, 90000);
cek('test_detect jalan', !detect.err, `root=${detect.root} n=${detect.n}`);
cek('Zephyr TIDAK menawarkan npm-test (tanpa scripts.test)',
  Array.isArray(detect.ids) && !detect.ids.includes('npm-test'), (detect.ids || []).join(','));
cek('setiap runner punya nama', Array.isArray(detect.nama) && detect.nama.every((x) => x && x.length > 0),
  (detect.nama || []).join(' · '));

// ── V4: UI menampilkan hasil deteksi ──
const ui = await cdp.json(`return JSON.stringify({
  adaList: !!document.querySelector('[data-testid="test-list"]'),
  adaEmpty: !!document.querySelector('[data-testid="test-empty"]'),
  nItem: document.querySelectorAll('.test-item').length,
  teks: (document.querySelector('[data-testid="test-view"]')?.textContent || '').slice(0, 110),
})`);
cek('UI Test Explorer terisi', ui.adaList === true || ui.adaEmpty === true, `item=${ui.nItem} | ${ui.teks}`);

// ── V5: jalankan runner nyata lewat tasks_run ──
const jalan = await cdp.json(`return JSON.stringify(await (async () => {
  const C = window.__ZEPHYR_TEST__;
  const daftar = await C.detect(window.__ZEPHYR__.getState().workspace);
  if (!daftar.length) return { err: 'tidak ada runner terdeteksi' };
  // Pilih yang tercepat: npm run <script> (cargo test bisa menit).
  const pilih = daftar.find((x) => x.id.startsWith('npm-')) || daftar[0];
  const t0 = Date.now();
  // JALUR PRODUK (sama dengan yang dipakai UI): tasksStore.jalankanAdHoc.
  // Memanggil tasksRun mentah akan melewati pembuatan channel output.
  await C.runStore({ label: pilih.nama, command: pilih.command, args: pilih.args });
  await new Promise((res) => setTimeout(res, 400));
  const runs = await C.runs();
  const r = runs.find((x) => x.label === pilih.nama) || runs[runs.length - 1];
  return {
    id: r ? r.id : 'tidak-ada', nama: pilih.nama,
    cmd: pilih.command + ' ' + pilih.args.join(' '), ms: Date.now() - t0,
  };
})())`, 120000);
cek('tasks_run menerima runner test', !jalan.err && !!jalan.id, `${jalan.nama} -> ${jalan.cmd}`);

// ── V6: output task mengalir (bukti benar-benar dijalankan) ──
//
// PENTING: `TaskRun` dari Rust TIDAK memuat isi output — hanya `lines`
// (jumlah baris). Isi output hidup di `outputStore` frontend dengan channel
// `task:<label>`. Harness yang membaca `run.output` akan selalu dapat "".
await new Promise((r) => setTimeout(r, 9000));
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const C = window.__ZEPHYR_TEST__;
  const T = window.__ZEPHYR_TASK__;
  const runs = await C.runs();
  const r = runs.find((x) => String(x.id).startsWith('task-')) || runs[runs.length - 1];
  if (!r) return { err: 'run tidak tercatat' };
  // Output task dibaca lewat bridge __ZEPHYR_TASK__.output(label) —
  // itu membaca outputStore channel task:<label>.
  const baris = T ? T.output(r.label) : [];
  return {
    id: r.id, label: r.label, status: r.status, lines: r.lines,
    channel: 'task:' + r.label, nBaris: baris.length,
    cuplik: baris.join(String.fromCharCode(10)).slice(0, 260),
  };
})())`, 90000);
cek('run tercatat di tasks_runs', !out.err && !!out.id,
  `${out.id} status=${out.status} lines=${out.lines}`);
cek('output test benar-benar mengalir', typeof out.cuplik === 'string' && out.cuplik.length > 10,
  JSON.stringify(out.cuplik || '').slice(0, 160));

// ── V7: root tidak ada -> daftar kosong, BUKAN error ──
const kosong = await cdp.json(`return JSON.stringify(await (async () => {
  const C = window.__ZEPHYR_TEST__;
  const r = await C.detect('D:/folder-tidak-ada-xyz-123');
  return { n: r.length };
})())`, 60000);
cek('root tidak ada -> daftar kosong (bukan error)', kosong.n === 0, JSON.stringify(kosong));

// ── V8: tutup panel supaya harness lain tidak terganggu ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  return 1;
})())`, 30000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
