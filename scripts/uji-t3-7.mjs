// uji-t3-7.mjs — verifikasi system prompt baru (T3.7).
//
// YANG DIUJI:
//   1. Prompt memuat identitas, cara kerja, aturan, daftar tool
//   2. Daftar tool di prompt SINKRON dengan AGENT_TOOLS (tidak menyebut tool
//      yang tidak ada — ini kesalahan paling umum pada prompt manual)
//   3. Instruksi bahasa mengikuti setting (id/en/follow)
//   4. File aturan proyek (AGENTS.md) benar-benar terbaca & disisipkan
//   5. Prompt yang dikirim ke provider benar-benar berisi semua bagian itu
//      (dibuktikan dari request nyata ke mock provider, bukan dari kode)
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.7: system prompt pintar ===\n');

// ── V1: struktur prompt ──
const struktur = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT__;
  const p = P.system('follow', 'MEMORI-UJI', 'ATURAN-UJI');
  return {
    panjang: p.length,
    adaIdentitas: p.includes('Zeph'),
    adaAgent: p.includes('agent'),
    adaCaraKerja: p.includes('# Cara kerja'),
    adaAturan: p.includes('# Aturan yang tidak boleh dilanggar'),
    adaTool: p.includes('# Tool yang tersedia'),
    adaKonteks: p.includes('MEMORI-UJI'),
    adaAturanProyek: p.includes('ATURAN-UJI'),
    laranganMengarang: p.includes('JANGAN mengarang'),
    verifikasi: p.includes('VERIFIKASI'),
  };
})())`, 60000);
cek('prompt punya identitas Zeph', struktur.adaIdentitas && struktur.adaAgent);
cek('prompt punya bagian "Cara kerja"', struktur.adaCaraKerja);
cek('prompt punya aturan keras', struktur.adaAturan && struktur.laranganMengarang);
cek('prompt menyebut urutan VERIFIKASI', struktur.verifikasi);
cek('prompt memuat daftar tool', struktur.adaTool);
cek('prompt memuat konteks memori', struktur.adaKonteks);
cek('prompt memuat aturan proyek', struktur.adaAturanProyek);
cek('prompt cukup panjang (bukan 3 baris lagi)', struktur.panjang > 1500, `${struktur.panjang} char`);

// ── V2: daftar tool sinkron dengan AGENT_TOOLS ──
const sinkron = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT__;
  const p = P.system('follow');
  const mod = await import('/src/lib/agentTools.ts');
  const nama = mod.AGENT_TOOLS.map((t) => t.spec.name);
  const hilang = nama.filter((n) => !p.includes(n));
  // Tool yang disebut prompt tapi TIDAK ada di AGENT_TOOLS = halusinasi
  const disebut = [...p.matchAll(/^- ([a-z_]+):/gm)].map((m) => m[1]);
  const hantu = disebut.filter((n) => !nama.includes(n));
  return { n: nama.length, hilang, hantu, disebut: disebut.length };
})())`, 90000);
cek('semua tool asli ada di prompt', sinkron.hilang.length === 0,
  sinkron.hilang.length ? 'hilang: ' + sinkron.hilang.join(',') : `${sinkron.n} tool`);
cek('prompt tidak menyebut tool hantu', sinkron.hantu.length === 0,
  sinkron.hantu.length ? 'hantu: ' + sinkron.hantu.join(',') : '');

// ── V3: instruksi bahasa ──
const bhs = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT__;
  return {
    id: P.system('id').includes('bahasa Indonesia'),
    en: P.system('en').includes('English'),
    follow: !P.system('follow').includes('# Bahasa'),
    jepang: P.system('Jepang').includes('bahasa Jepang'),
  };
})())`, 60000);
cek('bahasa id -> instruksi Indonesia', bhs.id === true);
cek('bahasa en -> instruksi English', bhs.en === true);
cek('follow -> tanpa bagian bahasa', bhs.follow === true);
cek('bahasa bebas -> dipakai apa adanya', bhs.jepang === true);

// ── V4: file aturan proyek benar-benar dibaca ──
const aturan = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT__;
  const S = window.__ZEPHYR__;
  // App yang baru restart belum punya workspace — buka dulu, kalau tidak
  // AGENTS.md tidak akan pernah ketemu (dan uji ini gagal palsu).
  if (!S.getState().workspace) {
    await S.getState().openWorkspace('D:/Zephyr');
    await new Promise((r) => setTimeout(r, 2500));
  }
  P.resetAturan();
  const ws = S.getState().workspace;
  const teks = await P.aturanProyek();
  return {
    ws,
    panjang: teks.length,
    adaAgents: teks.includes('AGENTS.md'),
    // Zephyr punya AGENTS.md sendiri -> harus terbaca
    adaIsi: teks.includes('Zephyr') || teks.includes('ZEPHYR'),
  };
})())`, 90000);
cek('workspace terbuka', !!aturan.ws, aturan.ws || '');
cek('AGENTS.md terbaca dari workspace', aturan.adaAgents && aturan.panjang > 200,
  `${aturan.panjang} char`);

// ── V5: prompt NYATA yang dikirim ke provider ──
// Bukti terkuat: baca request yang benar-benar sampai ke mock provider.
const terkirim = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__TAURI_INTERNALS__;
  await T.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));

  // Kirim pesan singkat ke chat biasa
  const A = window.__ZEPHYR_AI__;
  const s = A.store.getState();
  if (!s.activeSession()) s.newChat();
  await new Promise((r) => setTimeout(r, 600));
  await A.store.getState().send('Balas satu kata: UJI');
  await new Promise((r) => setTimeout(r, 6000));

  return { terkirim: true, n: (A.store.getState().activeSession()?.messages || []).length };
})())`, 180000);

// Log mock dibaca dari SISI NODE: fetch dari webview ke port 8098 diblokir
// CORS (origin beda), jadi hasilnya selalu kosong kalau dibaca dari sana.
let logMock = [];
try {
  logMock = await fetch('http://127.0.0.1:8098/__log').then((r) => r.json());
} catch (e) {
  console.log('  (mock log tidak terbaca: ' + e.message + ')');
}
const reqTerakhir = Array.isArray(logMock) ? logMock[logMock.length - 1] : null;
const body = (reqTerakhir && reqTerakhir.body) || {};
let sys = '';
if (body.systemInstruction) {
  const parts = body.systemInstruction.parts || [];
  sys = parts.map((x) => x.text || '').join('');
} else if (Array.isArray(body.messages)) {
  sys = body.messages.filter((m) => m.role === 'system').map((m) => m.content || '').join('');
}
const nyata = {
  adaLog: !!reqTerakhir,
  panjangSys: sys.length,
  adaCaraKerja: sys.includes('# Cara kerja'),
  adaAturan: sys.includes('JANGAN mengarang'),
  adaTool: sys.includes('# Tool yang tersedia'),
  adaIdentitas: sys.includes('Zeph'),
};
cek('request nyata sampai ke provider', nyata.adaLog === true);
cek('system prompt NYATA memuat bagian baru', nyata.adaCaraKerja && nyata.adaAturan && nyata.adaTool,
  `${nyata.panjangSys} char`);

// ── V6: pengingat identitas ikut di pesan user ──
const reminder = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT__;
  const r = P.reminder();
  return { panjang: r.length, adaZeph: r.includes('Zeph'), adaLarangan: r.includes('JANGAN') || r.includes('Jangan') };
})())`, 60000);
cek('pengingat identitas ada', reminder.adaZeph === true);
cek('pengingat memuat larangan mengarang', reminder.adaLarangan === true);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
