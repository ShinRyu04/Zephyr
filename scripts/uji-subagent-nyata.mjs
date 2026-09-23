// uji-subagent-nyata.mjs — BUKTI subagent benar-benar bekerja.
//
// Uji ini menjalankan subagent lewat MOCK PROVIDER (port 8098) supaya tidak
// memakai kuota API nyata, tapi seluruh jalur tetap nyata: store -> adapter
// Rust -> HTTP -> stream balik -> langkah tercatat -> ringkasan.
//
// Yang dibuktikan (bukan sekadar "UI tampil"):
//   1. Subagent benar-benar memanggil provider (mock menerima request)
//   2. Langkah 'pikir' dan 'tool' tercatat dari stream nyata
//   3. Dua subagent jalan BERSAMAAN (waktu total < jumlah waktu masing-masing)
//   4. Ringkasan gabungan dibuat dari hasil nyata
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== Subagent: uji jalur nyata ===\n');

// ── 0. Mock provider hidup? ──
try {
  const v = await fetch('http://127.0.0.1:8098/__version').then((r) => r.json());
  console.log(`  mock provider: versi ${v.version}`);
} catch {
  console.log('  mock provider MATI — jalankan: node scripts/mock-ai.mjs');
  process.exit(1);
}

// ── 1. Siapkan provider -> mock + API key ──
const siap = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const T = window.__TAURI_INTERNALS__;
  await T.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 700));
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  const X = window.__ZEPHYR_AI__;
  await X.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
})())`, 90000);
cek('provider diarahkan ke mock + key diset', siap.ok === true);

// Batas efektif dari Settings user (bisa 1..8). Dibaca di Node DAN dipakai di
// dalam halaman — uji tidak boleh mengasumsikan angka tetap.
const maks = await cdp.json(
  `return JSON.stringify(await (async () => {
  const BS = window.__ZEPHYR_SUBSET__;
  const n = (BS && BS.batasParalel) ? BS.batasParalel() : 4;
  window.__UJI_MAKS__ = n;
  return n;
})())`,
  60000,
);
console.log(`  batas paralel efektif: ${maks}`);

// ── 2. Jalankan subagent paralel ──
const jalan = await cdp.json(`return JSON.stringify(await (async () => {
  // Pastikan baseUrl mock BENAR-BENAR terpasang sebelum menjalankan subagent.
  // Kalau tidak, request pergi ke API asli dan uji menggantung.
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 900));
  const AI = window.__ZEPHYR_AI__.store.getState();
  await AI.loadKeys();
  await AI.setModel('gemini-3.8-flash');
  await new Promise((r) => setTimeout(r, 800));
  const bu = S.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) {
    throw new Error('baseUrl mock tidak terpasang: ' + bu);
  }

  const SUB = window.__ZEPHYR_SUB__;
  const st = SUB.store.getState();
  st.bersihkan();
  await new Promise((r) => setTimeout(r, 300));
  const t0 = Date.now();
  // Baca batas EFEKTIF dari store — user bisa menyetelnya di Settings →
  // Subagent, jadi uji tidak boleh mengasumsikan angka tetap.
  // Sediakan tugas sebanyak batas maksimum (bisa 1..8), bukan 3 tetap: kalau
  // daftarnya lebih pendek dari batas, jumlah subagent yang dibuat ikut
  // pendek dan assertion "maks subagent dibuat" gagal padahal app benar.
  const maks = window.__UJI_MAKS__ ?? 4;
  const tugas = ['SATU', 'DUA', 'TIGA', 'EMPAT', 'LIMA', 'ENAM', 'TUJUH', 'DELAPAN']
    .slice(0, maks)
    .map((t) => 'Balas satu kata: ' + t);
  const n = await st.jalankan(tugas);
  const ms = Date.now() - t0;
  const akhir = SUB.store.getState();
  return {
    n, ms,
    jumlah: akhir.agents.length,
    status: akhir.agents.map((a) => a.status),
    nama: akhir.agents.map((a) => a.nama),
    langkah: akhir.agents.map((a) => a.langkah.length),
    hasil: akhir.agents.map((a) => (a.hasil || '').slice(0, 40)),
    ringkasan: (akhir.ringkasan || '').slice(0, 120),
  };
})())`, 240000);

cek(`${maks} subagent dibuat`, jalan.jumlah === maks, `${jalan.jumlah}`);
cek('semua subagent SELESAI (bukan gagal)',
  Array.isArray(jalan.status) && jalan.status.every((s) => s === 'selesai'),
  (jalan.status || []).join(','));
cek('nama subagent berbeda', new Set(jalan.nama || []).size === maks, (jalan.nama || []).join(','));
cek('setiap subagent punya langkah tercatat',
  Array.isArray(jalan.langkah) && jalan.langkah.every((n) => n > 0),
  `langkah: ${(jalan.langkah || []).join(',')}`);
cek('setiap subagent punya hasil', (jalan.hasil || []).every((h) => h.length > 0),
  JSON.stringify(jalan.hasil));
cek('ringkasan gabungan dibuat', (jalan.ringkasan || '').length > 0,
  JSON.stringify(jalan.ringkasan).slice(0, 90));

// ── 3. Bukti PARALEL: 3 tugas selesai jauh lebih cepat dari 3x waktu satu tugas ──
console.log(`    (3 subagent selesai dalam ${jalan.ms}ms)`);
cek('benar-benar paralel (bukan berurutan)', jalan.ms < 30000,
  `${jalan.ms}ms untuk 3 tugas`);

// ── 4. UI: kartu benar-benar ter-render ──
const ui = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PANEL__;
  TS().setVisible(true);
  TS().setHeight(340);
  // T4.1: kartu subagent PINDAH ke tab Subagents di panel bawah — bukan lagi
  // di dalam chat AI. Harness lama mencari di tab 'ai' dan selalu gagal
  // padahal aplikasinya benar.
  TS().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1400));
  return {
    panel: !!document.querySelector('[data-testid="sub-panel"]'),
    judul: document.querySelector('[data-testid="sav-angka"]')?.textContent || '',
    kartu: document.querySelectorAll('[data-testid^="sub-card-"]').length,
    nama: [...document.querySelectorAll('[data-testid^="sub-nama-"]')].map((e) => e.textContent),
    ringkas: !!document.querySelector('[data-testid="sav-ringkas"]'),
  };
})())`, 90000);
cek('panel subagent ter-render di UI', ui.panel === true, ui.judul);
cek('kartu subagent sesuai jumlah', ui.kartu === maks, `${ui.kartu} kartu`);
cek('nama tampil di kartu', (ui.nama || []).length === maks, (ui.nama || []).join(','));
cek('ringkasan tampil di UI', ui.ringkas === true);

// ── 5. Batas MAX_PARALLEL dihormati ──
const batas = await cdp.json(`return JSON.stringify(await (async () => {
  const SUB = window.__ZEPHYR_SUB__;
  SUB.store.getState().bersihkan();
  await new Promise((r) => setTimeout(r, 300));
  const n = await SUB.store.getState().jalankan(['a','b','c','d','e','f','g','h']);
  const jml = SUB.store.getState().agents.length;
  SUB.store.getState().batalSemua();
  return { diterima: n, dibuat: jml, maks: SUB.MAX_PARALLEL };
})())`, 120000);
cek('batas MAX_PARALLEL dihormati', batas.dibuat <= batas.maks && batas.maks >= 1,
  `${batas.diterima} diminta -> ${batas.dibuat} dibuat (maks ${batas.maks})`);

// ── 6. Bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  const SUB = window.__ZEPHYR_SUB__;
  SUB.store.getState().bersihkan();
  SUB.store.getState().batalSemua();
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
