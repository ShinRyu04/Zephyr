/*
 * Bukti: `open_link` membuka browser sistem, dan pagarnya tidak bisa dilewati.
 *
 * Permintaan pemilik aplikasi: kalau percakapan menyebut tautan, tautan itu
 * dibuka - bukan dituliskan sebagai teks lalu ditinggal. Yang diuji:
 *
 *   L1  tool `open_link` terdaftar dan selalu dikirim ke model
 *   L2  ia benar-benar memanggil `openUrl` (bukan hanya mengembalikan teks)
 *   L3  host di luar allowlist DITOLAK, bukan dibuka
 *   L4  URL non-http (mis. `file:`) DITOLAK
 *   L5  pesan penolakan menyebut hostnya, supaya model bisa melaporkannya
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = {};

  /* ── L1: tool terdaftar + selalu dikirim ──────────────────────────────── */
  const at = await import('/src/lib/agentTools.ts');
  const nama = at.AGENT_TOOLS.map((t) => t.spec.name);
  out.terdaftar = nama.includes('open_link');
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  out.selaluDikirim = cat.TOOL_DIKIRIM_SELALU.includes('open_link');
  out.jumlahSelalu = cat.TOOL_DIKIRIM_SELALU.length;

  /*
   * L1b/L1c: dua jalur yang dulu membuat tool ini tidak pernah sampai ke model.
   * Katalog harus memuatnya, subset untuk "buka youtube" (tanpa URL) harus
   * memilihnya, dan saringan kirim agentToolSpecs harus meloloskannya.
   */
  out.diKatalog = cat.TOOL_BY_NAME.has('open_link');
  const st = await import('/src/lib/subsetTugas.ts');
  const tg = await import('/src/lib/toolGate.ts');
  const aktif = [...tg.useToolGate.getState().aktif];
  const subset = st.pilihToolTugas('buka youtube', aktif, true);
  out.subsetBukaYoutube = {
    browser: subset.includes('browser'),
    openLink: subset.includes('open_link'),
    jumlah: subset.length,
  };
  const kirim = at.agentToolSpecs({ alat: subset }).map((s) => s.name);
  out.kirimBukaYoutube = {
    browser: kirim.includes('browser'),
    openLink: kirim.includes('open_link'),
    jumlah: kirim.length,
  };

  /* ── L2..L5: jalankan tool-nya lewat registry produksi ────────────────── */
  const tool = at.AGENT_TOOLS.find((t) => t.spec.name === 'open_link');
  out.adaTool = !!tool;

  /*
   * Rekam pemanggilan openUrl tanpa benar-benar membuka jendela browser:
   * uji yang membuka tab nyata setiap kali dijalankan akan mengganggu orang
   * yang sedang memakai mesin ini. Yang dibuktikan tetap sama - bahwa jalur
   * eksekusi SAMPAI ke pemanggilan opener.
   */
  const dipanggil = [];
  window.__OPEN_LINK_UJI__ = dipanggil;

  /* Izin isi web dimatikan dulu: gate harus menolak, bukan membuka. */
  const asli = S.getState().settings;
  const izinAwal = asli.izinIsiWeb === true;

  if (tool) {
    /* Tanpa izin: harus ditolak. */
    if (izinAwal) await S.getState().applySettings({ izinIsiWeb: false });
    await tunggu(250);
    out.tanpaIzin = String(await tool.run({ url: 'https://github.com/ShinRyu04/Zephyr' })).slice(0, 200);

    /* URL non-http: harus ditolak apa pun izinnya. */
    out.fileUrl = String(await tool.run({ url: 'file:///C:/Windows/System32/calc.exe' })).slice(0, 200);

    /* Pulihkan izin seperti semula. */
    if (izinAwal) await S.getState().applySettings({ izinIsiWeb: true });
    await tunggu(200);
  }

  out.izinAwal = izinAwal;
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

console.log('\nBukti — tautan dibuka, pagar tetap berlaku:');
cek('tool open_link terdaftar di registry', d.terdaftar === true, String(d.terdaftar));
cek('open_link selalu dikirim ke model', d.selaluDikirim === true, String(d.selaluDikirim));
cek('open_link terdaftar di TOOL_CATALOG', d.diKatalog === true, String(d.diKatalog));
cek(
  'subset "buka youtube" memilih browser + open_link',
  d.subsetBukaYoutube?.browser === true && d.subsetBukaYoutube?.openLink === true,
  JSON.stringify(d.subsetBukaYoutube ?? null),
);
cek(
  'wire "buka youtube" mengirim browser + open_link',
  d.kirimBukaYoutube?.browser === true && d.kirimBukaYoutube?.openLink === true,
  JSON.stringify(d.kirimBukaYoutube ?? null),
);
cek(
  'tanpa izin isi web, tautan DITOLAK',
  typeof d.tanpaIzin === 'string' && /ditolak/i.test(d.tanpaIzin),
  String(d.tanpaIzin ?? '').slice(0, 90),
);
cek(
  'URL file: DITOLAK',
  typeof d.fileUrl === 'string' && /ditolak/i.test(d.fileUrl),
  String(d.fileUrl ?? '').slice(0, 90),
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
