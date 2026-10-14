import { writeFileSync } from 'node:fs';

const G = ((globalThis as any).__UJI = { ipc: 0, calls: [] as string[], versiApp: process.env.UJI_VERSI_APP || '1.1.13' });
const jaringan: string[] = ((globalThis as any).__JARINGAN ??= []);
const keluar = process.env.ANGKA_KELUAR || '';

const S: any = await import('../../src/lib/zephyrTools/zephyrSelf');
const C: any = await import('../../src/lib/zephyrCari');
const I: any = await import('../../src/lib/zephyrIndeks');

const tok = (s: unknown) => S.perkirakanToken(String(s ?? ''));
const NL = String.fromCharCode(10);
const SEP = NL + NL + '--- potongan berikutnya ---' + NL + NL;
const DUA_NL = NL + NL;
const badan = (teks: string) => { const t = String(teks); const i = t.indexOf(DUA_NL); return i >= 0 ? t.slice(i + 2) : t; };
const potongan = (teks: string) => badan(teks).split(SEP);
const kepalaBadan = (teks: string) => { const t = String(teks); const i = t.indexOf(DUA_NL); return i >= 0 ? t.slice(0, i) : ''; };
const kepalaJson = (teks: string) => {
  const baris = String(teks).split('\n')[0];
  return JSON.parse(baris.slice('ZEPHYR_SELF '.length));
};
const ipcSejak = (n: number) => G.ipc - n;

/* ---- blok potongan: batas 4 dan 800 token, dari isi indeks nyata ---- */
const TEKS = I.FAKTA_INDEKS.slice(0, 400).map((e: any) => '[' + e[0] + '] ' + e[1] + ': ' + e[2]).join('\n');
const potonganNyata = {
  sumberChar: TEKS.length,
  sumberToken: tok(TEKS),
  empat: S.potongKePotongan(TEKS, 4),
  diminta5: S.potongKePotongan(TEKS, 5),
  diminta1: S.potongKePotongan(TEKS, 1),
  diminta0: S.potongKePotongan(TEKS, 0),
};
const b900 = 'kata '.repeat(720);
potonganNyata.char900 = b900.length;
potonganNyata.token900 = tok(b900);
potonganNyata.hasil900 = S.potongKePotongan(b900, 1);
/* AI-TAHU-100-7: bebanAwal = kepala/header yang ikut dibayar. Kontrol NEGATIF:
 * bebanAwal 0 harus byte-identik dengan perilaku lama. */
potonganNyata.empatBeban0 = S.potongKePotongan(TEKS, 4, 0);
potonganNyata.satuBeban = S.potongKePotongan(TEKS, 1, 2000);

/* ---- cache per sesi JALUR SUNTIKAN otomatis (zephyrCari, AI-TAHU-100-6) ---- */
const cacheSuntik: any = {
  eksporUkuran: typeof (C as any).ukuranCacheSuntikSesi,
  eksporBersihkan: typeof (C as any).bersihkanCacheSuntikSesi,
};
if (typeof (C as any).bersihkanCacheSuntikSesi === 'function') {
  (C as any).bersihkanCacheSuntikSesi();
  const cs1 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1]);
  cacheSuntik.miss = (C as any).ukuranCacheSuntikSesi();
  const cs2 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1]);
  cacheSuntik.hit = (C as any).ukuranCacheSuntikSesi();
  cacheSuntik.identik = cs1 === cs2;
  const cs3 = C.suntikanIndeks(I.FAKTA_INDEKS[1][1], { batas: 2 });
  cacheSuntik.bedaOpsi = (C as any).ukuranCacheSuntikSesi();
  cacheSuntik.bedaIsi = cs3 !== cs1;
} else {
  cacheSuntik.miss = -1;
  cacheSuntik.hit = -1;
  cacheSuntik.identik = false;
  cacheSuntik.bedaOpsi = -1;
  cacheSuntik.bedaIsi = false;
}

/* ---- cache per sesi: hit/miss dihitung dari panggilan IPC ---- */
const cache: any = { sebelumBersih: S.ukuranCacheSesi() };
S.bersihkanCacheSesi();
cache.setelahBersih = S.ukuranCacheSesi();
let a = G.ipc;
let idx = G.calls.length;
const setelan1 = await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'theme' });
cache.missDelta = ipcSejak(a);
cache.missCalls = G.calls.slice(idx);
cache.missUkuran = S.ukuranCacheSesi();
a = G.ipc;
idx = G.calls.length;
const setelan2 = await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'theme' });
cache.hitDelta = ipcSejak(a);
cache.hitCalls = G.calls.slice(idx);
cache.hitUkuran = S.ukuranCacheSesi();
cache.hitIdentik = setelan1 === setelan2;
a = G.ipc;
idx = G.calls.length;
await S.jalankanZephyrSelf({ bagian: 'setelan', kueri: 'ganti' });
cache.bedaDelta = ipcSejak(a);
cache.bedaCalls = G.calls.slice(idx);
cache.bedaUkuran = S.ukuranCacheSesi();

/* ---- aturan potongan lewat handler tool (maks diminta > 4, dan maks = 1) ---- */
S.bersihkanCacheSesi();
const maks9 = await S.jalankanZephyrSelf({ bagian: 'setelan', maks: 9 });
const maks1 = await S.jalankanZephyrSelf({ bagian: 'fakta', kueri: I.FAKTA_INDEKS[0][1], maks: 1 });
const potonganTool = {
  maks9Diminta: 9,
  maks9Kepala: kepalaJson(maks9),
  maks9Token: potongan(maks9).map(tok),
  maks9Jumlah: potongan(maks9).length,
  maks9KepalaChar: kepalaBadan(maks9).length,
  maks9Panjang: String(maks9).length,
  maks1Token: potongan(maks1).map(tok),
  maks1Jumlah: potongan(maks1).length,
  maks1KepalaChar: kepalaBadan(maks1).length,
  maks1Panjang: String(maks1).length,
  maks1PotonganChar: potongan(maks1).map((p: string) => p.length),
};

/* ---- BASIS: kontrol positif (versi beda) + negatif (versi sama) ---- */
S.bersihkanCacheSesi();
(G as any).versiApp = '1.1.13';
const segar = await S.jalankanZephyrSelf({ bagian: 'semua' });
S.bersihkanCacheSesi();
const segarVersi = await S.jalankanZephyrSelf({ bagian: 'versi' });
S.bersihkanCacheSesi();
(G as any).versiApp = '9.9.9';
const basi = await S.jalankanZephyrSelf({ bagian: 'semua' });
S.bersihkanCacheSesi();
const basiVersi = await S.jalankanZephyrSelf({ bagian: 'versi' });
const basiUji = {
  segarKepala: kepalaJson(segar),
  basiKepala: kepalaJson(basi),
  segarAdaBasi: String(segar).includes('BASI'),
  basiAdaBasi: String(basi).includes('BASI'),
  basiAdaPeringatan: String(basi).includes('PERINGATAN'),
  basiVersiAdaBasi: String(basiVersi).includes('BASI'),
  segarVersiAdaBasi: String(segarVersi).includes('BASI'),
  barisKemutakhiranBasi: String(basiVersi).split('\n').find((l: string) => l.includes('Kemutakhiran')) ?? '',
  barisKemutakhiranSegar: String(segarVersi).split('\n').find((l: string) => l.includes('Kemutakhiran')) ?? '',
  basiHashRuntimeAda: String(segar).includes('BASI') || String(segarVersi).includes('BASI'),
};

/* ---- bukti jaringan + identitas keluaran ---- */
const keluaran = {
  potonganNyata,
  cache,
  potonganTool,
  basiUji,
  konstanta: {
    POTONGAN_MAKS: S.POTONGAN_MAKS,
    TOKEN_POTONGAN_MAKS: S.TOKEN_POTONGAN_MAKS,
    KARAKTER_PER_TOKEN: S.KARAKTER_PER_TOKEN,
    ukuranCacheSesi: S.ukuranCacheSesi(),
  },
  cariEksporCache: {
    ukuranCacheSesi: typeof C.ukuranCacheSesi,
    bersihkanCacheSesi: typeof C.bersihkanCacheSesi,
    ukuranCacheSuntikSesi: typeof C.ukuranCacheSuntikSesi,
    bersihkanCacheSuntikSesi: typeof C.bersihkanCacheSuntikSesi,
  },
  cacheSuntik,
  versiFakta: C.versiFakta(),
  suntikanLapis2: C.suntikanIndeks(I.FAKTA_INDEKS[0][1]),
  jaringanDipakai: jaringan.slice(),
  ipcTotal: G.ipc,
  ipcPanggilan: G.calls.slice(),
};
writeFileSync(keluar, JSON.stringify(keluaran));
