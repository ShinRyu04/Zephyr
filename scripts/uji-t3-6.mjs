// uji-t3-6.mjs — verify the labelled timeline view (T3.6).
//
// YANG DIUJI: langkah agent tidak lagi menampilkan nama tool mentah
// (`file_read`), tapi label manusiawi berwarna per jenis aksi:
//   file_read    -> "Read"   (ikon buku, kelas is-baca)
//   editor_write -> "Edit"   (ikon pensil, kelas is-tulis)
//   terminal_exec-> "Run"    (ikon terminal, kelas is-jalan)
// plus sasaran (path file) dan blok "Reasoned" yang bisa dilipat.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.6: timeline langkah berlabel ===\n');

// ── V1: fungsi label memetakan tool ke label manusiawi ──
const label = await cdp.json(`return JSON.stringify(await (async () => {
  const M = await import('/src/lib/labelAksi.ts');
  // Nama tool HARUS yang benar-benar ada di agentTools.ts (22 tool).
  const kasus = [
    ['file_read', 'baca'],
    ['editor_read', 'baca'],
    ['terminal_read', 'baca'],
    ['editor_write', 'tulis'],
    ['file_write', 'tulis'],
    ['file_edit', 'tulis'],
    ['terminal_exec', 'jalan'],
    ['file_list', 'cari'],
    ['list_panes', 'cari'],
    ['memory_read', 'ingat'],
    ['todo_write', 'ingat'],
    ['cron_create', 'ingat'],
  ];
  const hasil = kasus.map(([tool, harap]) => ({
    tool,
    jenis: M.infoAksi(tool).jenis,
    label: M.infoAksi(tool).label,
    cocok: M.infoAksi(tool).jenis === harap,
  }));
  const gagal = hasil.filter((h) => !h.cocok).map((h) => h.tool);
  return { hasil, gagal, adaKelas: Object.keys(M.KELAS_JENIS).length };
})())`, 90000);
cek('labelAksi memetakan 8 tool ke jenis yang benar', label.gagal.length === 0,
  label.gagal.length ? 'salah: ' + label.gagal.join(',') : '');
cek('KELAS_JENIS punya kelas per jenis', label.adaKelas >= 5, `${label.adaKelas} kelas`);
const contoh = label.hasil.slice(0, 3).map((h) => `${h.tool}->${h.label}`).join('  ');
console.log(`         ${contoh}`);

// ── V2: sasaran aksi diekstrak dari args ──
const sasaran = await cdp.json(`return JSON.stringify(await (async () => {
  const M = await import('/src/lib/labelAksi.ts');
  const a = (path) => JSON.stringify({ path });
  return {
    file: M.sasaranAksi(a('D:/Zephyr/src/App.tsx')),
    cmd: M.sasaranAksi(JSON.stringify({ command: 'npm test' })),
    pola: M.sasaranAksi(JSON.stringify({ pattern: 'useEffect' })),
    kosong: M.sasaranAksi(''),
  };
})())`, 90000);
cek('sasaran file dibaca', sasaran.file.includes('App.tsx'), sasaran.file);
cek('sasaran command dibaca', sasaran.cmd.includes('npm test'), sasaran.cmd);
cek('sasaran pattern dibaca', sasaran.pola.includes('useEffect'), sasaran.pola);
cek('args kosong tidak error', sasaran.kosong === '');

// ── V3: subagent nyata -> kartu punya baris status hidup / timeline ──
const kartu = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUB__;
  const T = window.__TAURI_INTERNALS__;
  await T.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 700));
  await window.__ZEPHYR__.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  const st = S.store.getState();
  st.bersihkan();
  await new Promise((r) => setTimeout(r, 300));
  const n = await S.store.getState().jalankan(['Balas satu kata: SATU']);
  await new Promise((r) => setTimeout(r, 1500));
  // Ambil ULANG state setelah selesai: snapshot lama tidak ter-update.
  const akhir = S.store.getState();
  return { ok: n >= 1, n: (akhir.agents || []).length, status: (akhir.agents || []).map((a) => a.status) };
})())`, 180000);
cek('subagent berjalan lewat jalur nyata', kartu.n >= 1, `${kartu.n} agen`);

// ── V4: kartu di DOM punya elemen timeline baru ──
const dom = await cdp.json(`return JSON.stringify(await (async () => {
  // T4.1: kartu subagent hidup di TAB Subagents, bukan di dalam panel AI.
  // Harness lama fokus ke tab 'ai' dan tidak pernah menemukan kartunya.
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1400));
  const panel = document.querySelector('[data-testid="sub-panel"]');
  if (!panel) return { err: 'panel tidak ada' };
  const kartu = document.querySelector('[data-testid^="sub-card-"]');
  const id = kartu?.getAttribute('data-testid')?.replace('sub-card-', '');
  // buka daftar langkah
  const toggle = document.querySelector('[data-testid="sub-toggle-' + id + '"]');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
  await new Promise((r) => setTimeout(r, 700));
  return {
    id,
    // Di tab Subagents, judul ada di kepala SubAgentView (sav-angka), bukan
    // sub-title yang disembunyikan saat mode polos.
    judul: document.querySelector('[data-testid="sav-angka"]')?.textContent?.trim()
      ?? document.querySelector('[data-testid="sub-title"]')?.textContent?.trim(),
    adaMeta: !!document.querySelector('[data-testid="sub-meta-' + id + '"]'),
    metaTeks: document.querySelector('[data-testid="sub-meta-' + id + '"]')?.textContent?.trim(),
    nLangkah: document.querySelectorAll('[data-testid="sub-langkah-' + id + '"] .sub-step').length,
    nPikir: document.querySelectorAll('[data-step="pikir"]').length,
    nTool: document.querySelectorAll('[data-step="tool"]').length,
    labelAksi: [...document.querySelectorAll('[data-step="tool"] .sub-aksi-label')].map((e) => e.textContent.trim()).slice(0, 4),
    jenisAksi: [...document.querySelectorAll('[data-step="tool"]')].map((e) => e.getAttribute('data-jenis')).slice(0, 4),
  };
})())`, 90000);
cek('judul batch menyebut jumlah', /\d+/.test(dom.judul || ''), dom.judul);
cek('kartu punya meta langkah + durasi', !!dom.adaMeta && /langkah/.test(dom.metaTeks || ''), dom.metaTeks);
cek('timeline langkah ter-render', dom.nLangkah >= 1, `${dom.nLangkah} langkah`);
cek('blok Reasoned ada', dom.nPikir >= 1, `${dom.nPikir} pikir`);
cek('label aksi manusiawi (bukan nama tool mentah)',
  (dom.labelAksi || []).length === 0 || (dom.labelAksi || []).every((l) => !l.includes('_')),
  (dom.labelAksi || []).join(','));

// ── V5: label di bubble chat utama juga berubah ──
const chat = await cdp.json(`return JSON.stringify(await (async () => {
  // Cek kode: apakah AiPanel memakai infoAksi?
  const src = await fetch('/src/components/ai/AiPanel.tsx?raw').then((r) => r.text());
  return {
    pakaiInfoAksi: src.includes('infoAksi(st.name)'),
    pakaiSasaran: src.includes('sasaranAksi(st.args)'),
    pakaiKelas: src.includes('KELAS_JENIS[info.jenis]'),
    adaIkon: src.includes('ai-agent-ikon'),
  };
})())`, 60000);
cek('AiPanel memakai infoAksi (label manusiawi)', chat.pakaiInfoAksi === true);
cek('AiPanel memakai sasaranAksi (path file)', chat.pakaiSasaran === true);
cek('AiPanel memakai KELAS_JENIS (warna per aksi)', chat.pakaiKelas === true);
cek('AiPanel menampilkan ikon aksi', chat.adaIkon === true);

// ── V6: CSS kelas warna ada ──
const css = await cdp.json(`return JSON.stringify(await (async () => {
  const src = await fetch('/src/styles/ai.css').then((r) => r.text());
  const perlu = ['is-baca', 'is-tulis', 'is-jalan', 'is-cari', 'is-ingat', 'sub-aksi-label', 'sub-aksi-sasaran', 'ai-agent-ikon'];
  return perlu.map((k) => ({ k, ada: src.includes(k) }));
})())`, 60000);
const cssHilang = css.filter((c) => !c.ada).map((c) => c.k);
cek('CSS semua kelas aksi ada', cssHilang.length === 0, cssHilang.length ? 'hilang: ' + cssHilang.join(',') : '');

// ── bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
// Pastikan baseUrl mock benar-benar terpasang — kalau tidak, request pergi
// ke API asli dan uji menggantung sampai timeout.
{
  const bu = window.__ZEPHYR__.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) throw new Error('baseUrl mock tidak terpasang: ' + bu);
}

  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
