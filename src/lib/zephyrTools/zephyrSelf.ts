/*
 * zephyr_self - introspeksi Zephyr dari sumber-sumber MILIK APLIKASI SENDIRI.
 *
 * Item backlog `ai-tahu-100-3` (didukung `ai-tahu-100-4`): Zeph AI harus bisa
 * memeriksa DIRINYA SENDIRI tanpa lebih dulu meminta folder proyek user. Modul
 * ini membaca, semuanya dari dalam aplikasi:
 *
 *   - setelan  : store aplikasi (nilai EFEKTIF yang sedang dipakai) +
 *                `get_settings` (isi berkas settings.json di dataDir aplikasi)
 *   - log      : metadata log aplikasi dari `get_diagnostics` (berkas, kebijakan
 *                rotasi, status panic). ISI baris log sengaja TIDAK diarang:
 *                lihat catatan jujur di keluaran + usulan Rust di laporan.
 *   - ekstensi : `extensions_list` + `extensions_manifests` +
 *                `extensions_bundled_ids` + `ext_registry_installed` + hasil
 *                loader di `extensionStore`
 *   - docs     : dokumen yang IKUT BUNDEL di indeks fakta (CHANGELOG,
 *                ARCHITECTURE, README, AGENTS, RELEASE_NOTES, docs/*.md) +
 *                pencarian lokal deterministik lewat `zephyrCari`
 *   - versi    : `get_app_info` + `get_diagnostics` + status updater +
 *                `mcp_status` + perbandingan kemutakhiran indeks
 *   - fakta    : indeks fakta bundel (perilaku lama, tetap dipertahankan)
 *   - semua    : ringkasan satu layar
 *
 * ATURAN KELUARAN `ai-tahu-100-7` (sudah disetujui): maksimum 4 potongan, tiap
 * potongan <= 800 token (perkiraan konservatif 4 karakter/token), ada cache
 * per sesi; kalau data bundel lebih tua dari versi aplikasi yang berjalan,
 * jawaban WAJIB menyebut dirinya BASI - bukan mengarang.
 *
 * NOL AKSES JARINGAN. Berkas ini tidak memanggil jaringan sama sekali (tidak
 * ada panggilan HTTP, tidak ada WebSocket) - hanya `import` modul lain dan
 * invoke IPC Tauri. Alasan penting: `zephyr_self` harus tetap bekerja saat
 * tidak ada folder terbuka dan saat mesin offline.
 *
 * Bridge yang SENGAJA tidak disentuh: `builtins.ts` mengimpor `useAi` dari
 * `aiStore.ts`; modul ini tidak mengimpor `aiStore` supaya tidak menambah
 * siklus modul baru.
 */
import type { AgentToolSpec } from '../types';
import type { FaktaKategori } from '../zephyrCari';

/** Aturan `ai-tahu-100-7`. */
export const POTONGAN_MAKS = 4;
export const TOKEN_POTONGAN_MAKS = 800;
export const KARAKTER_PER_TOKEN = 4;
/** Anggaran karakter per potongan, disisakan 16 token untuk penanda potong. */
/*
 * Cadangan token untuk KEPALA/HDR, bukan angka bulat 16.
 *
 * Kepala jawaban `zephyr_self` (pembungkus JSON: bagian, cap versi/hash, jumlah
 * potongan, penanda pemotongan) terukur ~265 karakter ~= 66 token, jauh di atas
 * cadangan 16 token yang lama. Akibatnya muatan satu panggilan bisa mendarat di
 * 840 token walau tiap potongan badan sudah "<=800": yang tidak ikut dihitung
 * adalah pembungkusnya. Angka ini dipakai dua kali - di sini dan oleh pemanggil
 * yang mengoper `bebanAwal` - jadi menaikkannya menutup kedua jalur sekaligus.
 */
const CADANGAN_KEPALA_TOKEN = 80;
const KARAKTER_POTONGAN = (TOKEN_POTONGAN_MAKS - CADANGAN_KEPALA_TOKEN) * KARAKTER_PER_TOKEN;

/** Bagian sumber yang bisa dipilih model lewat `bagian`. */
export const BAGIAN_TAMPAK: readonly string[] = ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'indeks'];
/** Ditambah dua nilai non-sumber: `fakta` (indeks bundel) dan `semua` (ringkasan). */
export const BAGIAN_LAIN: readonly string[] = ['fakta', 'semua'];

/* ------------------------------------------------------------------ */
/* Cache per sesi                                                      */
/* ------------------------------------------------------------------ */

/*
 * Kunci cache ikut memuat versi aplikasi + versi indeks: begitu app reload
 * (HMR saat berkas src disunting) atau versi berubah, kunci lama tidak akan
 * pernah cocok lagi - jadi cache tidak pernah menyajikan jawaban yang dibuat
 * untuk keadaan yang sudah tidak berlaku.
 */
const CACHE_SESI = new Map<string, string>();

export function ukuranCacheSesi(): number {
  return CACHE_SESI.size;
}

export function bersihkanCacheSesi(): void {
  CACHE_SESI.clear();
}

/* ------------------------------------------------------------------ */
/* Bantuan kecil                                                       */
/* ------------------------------------------------------------------ */

function bacaAngka(v: unknown, bawaan: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return bawaan;
}

function bacaTeks(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Perkiraan token: 4 karakter/token (konservatif untuk teks+JSON campuran). */
export function perkirakanToken(s: string): number {
  return Math.ceil((s ?? '').length / KARAKTER_PER_TOKEN);
}

/** Ambil nilai berkunci bertitik dengan aman (tanpa melempar). */
function ambil(obj: unknown, jalur: string, bawaan: unknown = '-'): unknown {
  let x: unknown = obj;
  for (const b of jalur.split('.')) {
    if (x === null || x === undefined || typeof x !== 'object') return bawaan;
    x = (x as Record<string, unknown>)[b];
  }
  return x === undefined || x === null || x === '' ? bawaan : x;
}

/** Key yang nilainya tidak boleh ikut tampil di keluaran. */
const POLA_RAHASIA = /(api[_-]?key|token|secret|password|passwd|authorization)/i;

/** Salin struktur sambil menyunting nilai berkunci rahasia. */
function rahasiakan(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => rahasiakan(x));
  if (v !== null && typeof v === 'object') {
    const keluar: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      keluar[k] = POLA_RAHASIA.test(k) && typeof x === 'string' && x.length > 0 ? '[disunting]' : rahasiakan(x);
    }
    return keluar;
  }
  return v;
}

/**
 * Bagi teks jadi potongan <= 800 token (aturan `ai-tahu-100-7`), maksimum
 * `maks` potongan (<= 4). Baris raksasa dipecah paksa supaya aturan token
 * tetap tegak walau satu barisnya lebih panjang dari satu potongan.
 */
export function potongKePotongan(isi: string, maksDiminta: number, bebanAwal = 0): string[] {
  const maks = Math.max(1, Math.min(POTONGAN_MAKS, maksDiminta));
  /* AI-TAHU-100-7: `bebanAwal` = karakter yang sudah dibayar SEBELUM potongan
   * pertama (kepala/header JSON `zephyr_self`). Beban hanya dibebankan ke
   * potongan PERTAMA supaya "<=800 token/potongan" berlaku untuk SELURUH muatan
   * satu panggilan, bukan cuma badan potongannya. */
  let beban = Math.max(0, Math.min(TOKEN_POTONGAN_MAKS - 1, Math.floor(bebanAwal / KARAKTER_PER_TOKEN)));
  const hasil: string[] = [];
  let sisa = (isi ?? '').trim();
  while (sisa.length > 0 && hasil.length < maks) {
    const jatahKarakter = Math.max(KARAKTER_PER_TOKEN, KARAKTER_POTONGAN - beban * KARAKTER_PER_TOKEN);
    const jatahToken = TOKEN_POTONGAN_MAKS - beban;
    let ambil = sisa;
    if (perkirakanToken(ambil) > jatahToken) {
      let pot = sisa.slice(0, jatahKarakter);
      const akhirBaris = pot.lastIndexOf('\n');
      if (akhirBaris > jatahKarakter / 2) pot = pot.slice(0, akhirBaris);
      ambil = pot;
    }
    if (perkirakanToken(ambil) > jatahToken) {
      ambil = ambil.slice(0, jatahKarakter) + '\n[baris terpotong]';
    }
    hasil.push(ambil.trimEnd());
    sisa = sisa.slice(ambil.length).trimStart();
    beban = 0;
  }
  if (sisa.length > 0 && hasil.length > 0) {
    hasil[hasil.length - 1] += '\n[dipotong: batas potongan/token ai-tahu-100-7]';
  }
  return hasil.length > 0 ? hasil : ['(kosong)'];
}

/** Saring baris yang memuat kueri (pencarian lokal deterministik). */
function saringBaris(teks: string, kueri: string): { cocok: string[]; total: number } {
  const semua = teks.split('\n');
  const q = kueri.toLowerCase();
  return { cocok: semua.filter((l) => l.toLowerCase().includes(q)), total: semua.length };
}

/* ------------------------------------------------------------------ */
/* Data mentah (semuanya milik app, tanpa jaringan)                    */
/* ------------------------------------------------------------------ */

async function versiRingkas(): Promise<{ app: string; indeks: string; mode: string }> {
  let app = '?';
  let indeks = '?';
  try {
    const [cmd, cari] = await Promise.all([import('../commands'), import('../zephyrCari')]);
    const [ai, di] = await Promise.all([
      cmd.getAppInfo().catch(() => null),
      cmd.getDiagnostics().catch(() => null),
    ]);
    app = (ai as { version?: string } | null)?.version ?? (di as { version?: string } | null)?.version ?? '?';
    indeks = cari.versiFakta().aplikasi;
  } catch {
    /* metadata versi tidak tersedia: tetap lanjut, tandai '?' */
  }
  return { app, indeks, mode: import.meta.env.DEV ? 'dev' : 'build' };
}

/* ------------------------------------------------------------------ */
/* bagian=setelan                                                      */
/* ------------------------------------------------------------------ */

async function bagianSetelan(kueri: string): Promise<string> {
  const [{ useStore }, cmd] = await Promise.all([import('../store'), import('../commands')]);
  const efektif: unknown = useStore.getState().settings ?? {};
  const [diBerkas, app] = await Promise.all([
    cmd.getSettings().catch(() => null),
    cmd.getAppInfo().catch(() => null),
  ]);
  const dataDir = (app as { dataDir?: string } | null)?.dataDir;
  const berkas = dataDir ? `${dataDir}\\settings.json` : '(dataDir tidak tersedia)';

  const baris: string[] = [];
  baris.push('Sumber: store aplikasi (nilai EFEKTIF yang sedang dipakai) + get_settings (isi berkas).');
  baris.push(`Berkas settings.json: ${berkas}`);
  baris.push(`Tersinkron dengan berkas: ${diBerkas ? 'ya (get_settings menjawab)' : 'tidak diketahui'}`);
  baris.push('-- nilai efektif terpilih --');
  const pilihan: Array<[string, string]> = [
    ['general.theme', 'general.theme'],
    ['general.uiLang', 'general.uiLang'],
    ['general.fontSize', 'general.fontSize'],
    ['general.zoom', 'general.zoom'],
    ['general.checkUpdates', 'general.checkUpdates'],
    ['editor.tabSize', 'editor.tabSize'],
    ['editor.insertSpaces', 'editor.insertSpaces'],
    ['editor.wordWrap', 'editor.wordWrap'],
    ['editor.formatOnSave', 'editor.formatOnSave'],
    ['models.activeProvider', 'models.activeProvider'],
    ['models.answerLang', 'models.answerLang'],
    ['models.answerStyle', 'models.answerStyle'],
    ['models.ragEnabled', 'models.ragEnabled'],
    ['layout', 'layout'],
    ['sidebar', 'sidebar'],
    ['agents.maxPanes', 'agents.maxPanes'],
    ['agents.attachActiveFile', 'agents.attachActiveFile'],
    ['lsp.enabled', 'lsp.enabled'],
  ];
  // Kunci yang TIDAK ada di skema tidak ditampilkan sebagai '-' palsu: yang
  // benar-benar kosong dilaporkan sebagai '(tidak diset)' supaya bedanya
  // "belum ada" dan "ada tapi null" tidak hilang.
  for (const [label, jalur] of pilihan) {
    const v = ambil(efektif, jalur, '(tidak diset)');
    baris.push(`- ${label} = ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  const pintasan = ambil(efektif, 'shortcuts', {}) as Record<string, unknown>;
  const izin = ambil(efektif, 'allowCommands', []) as unknown[];
  baris.push(`- pintasan terpasang = ${Object.keys(pintasan ?? {}).length}`);
  baris.push(`- izin perintah (allowCommands) = ${Array.isArray(izin) ? izin.length : 0}`);
  baris.push('-- setelan efektif lengkap (nilai rahasia disunting) --');
  baris.push(JSON.stringify(rahasiakan(efektif), null, 2));

  const gabung = baris.join('\n');
  if (!kueri) return gabung;
  const { cocok, total } = saringBaris(gabung, kueri);
  if (cocok.length === 0) {
    return `Tidak ada baris setelan yang memuat "${kueri}" (0 dari ${total} baris). Jangan mengarang nilai; buang kueri untuk melihat seluruh setelan efektif.`;
  }
  return `${cocok.length} dari ${total} baris setelan memuat "${kueri}":\n${cocok.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* bagian=log                                                          */
/* ------------------------------------------------------------------ */

async function bagianLog(): Promise<string> {
  const cmd = await import('../commands');
  const [d, app, ekor] = await Promise.all([
    cmd.getDiagnostics().catch(() => null),
    cmd.getAppInfo().catch(() => null),
    // Isi baris log dibaca perintah Rust `log_tail` (READ-ONLY, berkas log app
    // sendiri). Kalau app-nya versi lama / perintahnya belum ada, jangan gagalkan
    // seluruh bagian - cukup jujur bilang belum bisa dibaca.
    cmd.logTail(20).catch(() => [] as string[]),
  ]);
  const diag = d as { logFile?: string; debug?: boolean; panicked?: boolean; lastPanic?: string; version?: string; os?: string; cpuCount?: number } | null;
  const dataDir = (app as { dataDir?: string } | null)?.dataDir;

  const baris: string[] = [];
  baris.push('Sumber: get_diagnostics (milik app) + kebijakan logger Rust.');
  baris.push('Kebijakan log: folder <dataDir>/logs, nama zephyr-YYYY-MM-DD.log, rotate pada 2 MB, simpan 3 berkas terakhir.');
  baris.push(`Berkas log terkini: ${diag?.logFile && diag.logFile.length > 0 ? diag.logFile : '(belum ada berkas)'}`);
  if (dataDir) baris.push(`Folder log: ${dataDir}\\logs`);
  baris.push(`Kanal: info${diag?.debug ? '+debug' : ''} (debug=${diag?.debug ? 'ya' : 'tidak'})`);
  baris.push(
    diag?.panicked
      ? `Status panic: PANIC TERCATAT - pesan terakhir: ${diag.lastPanic && diag.lastPanic.length > 0 ? diag.lastPanic : '(tanpa pesan)'}`
      : 'Status panic: tidak ada panic tercatat',
  );
  baris.push(`Runtime: versi ${diag?.version ?? '?'} - OS ${diag?.os ?? '?'} - ${diag?.cpuCount ?? '?'} inti CPU`);
  baris.push('');
  if (ekor.length > 0) {
    const bersih = ekor.map((l) => (l.length > 300 ? `${l.slice(0, 300)}...` : l));
    baris.push(`Isi log terakhir - ${bersih.length} baris TERAKHIR dari berkas log app, dibaca langsung (read-only) oleh perintah Rust log_tail:`);
    for (const l of bersih) baris.push(`| ${l}`);
  } else {
    baris.push('Isi log terakhir: (belum bisa dibaca - berkas log kosong, belum ada, atau perintah log_tail belum tersedia di build ini)');
  }
  baris.push('');
  baris.push('CATATAN JUJUR (ai-tahu-100-3): isi baris log di atas dibaca READ-ONLY dari berkas log APP');
  baris.push('(folder <dataDir>/logs) lewat perintah Rust log_tail - jadi bukan dikarang, dan bukan dari folder');
  baris.push('user. log_tail tidak menerima path dari pemanggil dan tidak menulis/memutar berkas apa pun.');
  baris.push('Kalau barisnya kosong, itu memang berkasnya kosong - bukan isi log yang disamarkan.');
  return baris.join('\n');
}

/* ------------------------------------------------------------------ */
/* bagian=ekstensi                                                     */
/* ------------------------------------------------------------------ */

async function bagianEkstensi(kueri: string): Promise<string> {
  const [cmd, ext] = await Promise.all([import('../commands'), import('../extensionStore')]);
  const [list, bundled, manifes, pasang] = await Promise.all([
    cmd.extensionsList().catch(() => []),
    cmd.extensionsBundledIds().catch(() => [] as string[]),
    cmd.extensionsManifests().catch(() => []),
    cmd.extRegistryInstalled().catch(() => [] as Array<{ id: string; version: string; enabled: boolean }>),
  ]);
  const loaded = ext.useExtensions.getState().loaded;
  const extError = ext.useExtensions.getState().extError;

  const baris: string[] = [];
  baris.push('Sumber: extensions_list + extensions_manifests + extensions_bundled_ids + ext_registry_installed + loader extensionStore.');
  baris.push(`Ringkasan: ${list.length} terdaftar, ${bundled.length} bundel, ${pasang.length} tercatat di registry ekstensi.`);
  baris.push('-- manifest terdaftar (urut id) --');
  const terurut = [...list].sort((a, b) => a.id.localeCompare(b.id));
  for (const e of terurut) {
    const muat = loaded[e.id] ? (loaded[e.id].executed ? 'dieksekusi' : 'tidak dieksekusi') : 'belum dimuat';
    const gagal = e.error ? ` GAGAL: ${e.error}` : '';
    baris.push(`- ${e.id} (${e.name}) v${e.version} [${e.builtin ? 'bawaan' : 'pasang'}] [${e.enabled ? 'nyala' : 'mati'}] loader:${muat}${gagal}`);
  }
  const gagalMuat = terurut.filter((e) => e.error);
  baris.push(`Gagal termuat: ${gagalMuat.length === 0 ? 'tidak ada' : gagalMuat.map((e) => `${e.id} (${e.error})`).join(', ')}`);
  baris.push(`Error store ekstensi: ${extError ?? 'tidak ada'}`);
  baris.push('-- id bundel (ikut pemasangan) --');
  baris.push(bundled.length > 0 ? [...bundled].sort().join(', ') : '(tidak ada yang dilaporkan)');
  baris.push('-- manifest dengan galat --');
  const galatManifes = manifes.filter((m) => m.error);
  if (galatManifes.length === 0) {
    baris.push('(tidak ada)');
  } else {
    for (const m of galatManifes) {
      const mm = m.manifest as Record<string, unknown> | null;
      baris.push(`- ${String(mm?.id ?? '(tanpa id)')} @ ${m.path}: ${m.error} (tercatat=${m.tercatat ? 'ya' : 'tidak'})`);
    }
  }
  baris.push('-- registry ekstensi (terpasang) --');
  baris.push(
    pasang.length > 0
      ? [...pasang].sort((a, b) => a.id.localeCompare(b.id)).map((p) => `${p.id} v${p.version}${p.enabled ? '' : ' (nonaktif)'}`).join(', ')
      : '(registry kosong)',
  );

  const gabung = baris.join('\n');
  if (!kueri) return gabung;
  const { cocok, total } = saringBaris(gabung, kueri);
  if (cocok.length === 0) {
    return `Tidak ada baris ekstensi yang memuat "${kueri}" (0 dari ${total} baris). Jangan mengarang id ekstensi; buang kueri untuk melihat seluruh daftar.`;
  }
  return `${cocok.length} dari ${total} baris ekstensi memuat "${kueri}":\n${cocok.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* bagian=docs                                                         */
/* ------------------------------------------------------------------ */

async function bagianDocs(kueri: string): Promise<string> {
  const [cari, indeks] = await Promise.all([import('../zephyrCari'), import('../zephyrIndeks')]);
  const semua = indeks.FAKTA_INDEKS as readonly (readonly [string, string, string])[];
  const dok = semua.filter((e) => e[0] === 'dokumen');
  const perBerkas = new Map<string, number>();
  for (const e of dok) {
    const nama = String(e[1] ?? '').split('#')[0].trim() || '(tanpa nama berkas)';
    perBerkas.set(nama, (perBerkas.get(nama) ?? 0) + 1);
  }
  const daftar = [...perBerkas.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const baris: string[] = [];
  const versi = cari.versiFakta();
  baris.push(`Sumber: dokumen yang IKUT BUNDEL di indeks fakta (kategori dokumen), indeks versi ${versi.aplikasi}.`);
  baris.push(`Total ${dok.length} potongan dari ${daftar.length} berkas dokumen:`);
  for (const [nama, jml] of daftar) baris.push(`- ${nama} (${jml} potongan)`);
  baris.push('');
  baris.push('Batas jujur (ai-tahu-100-4): hanya potongan di atas yang terbundel. Dokumen repo lain');
  baris.push('(plan kerja, catatan internal, screenshot) TIDAK ikut pemasangan dan keberadaannya tidak');
  baris.push('bisa dipastikan tanpa folder proyek user - tool ini tidak menebaknya.');

  if (!kueri) return baris.join('\n');

  const hasil = cari.cariFakta(kueri, { kategori: 'dokumen', batas: 12 });
  const takDikenal = cari.kataTakDikenal(kueri);
  if (hasil.length === 0) {
    const catatan = takDikenal.length > 0
      ? ` Kata berikut tidak ada sama sekali di indeks: ${takDikenal.join(', ')} - kemungkinan besar memang tidak ada di dokumen bundel. Jangan mengarang.`
      : ' Jangan mengarang isi dokumen; coba kata kunci lain atau satu kata saja.';
    return `Tidak ada potongan dokumen bundel yang cocok dengan "${kueri}".${catatan}`;
  }
  const catatan2: string[] = [];
  if (takDikenal.length > 0) catatan2.push(`Catatan: kata ${takDikenal.join(', ')} tidak ada di indeks - jangan mengarang.`);
  if (hasil.some((h) => h.longgar)) catatan2.push('Catatan: sebagian hasil cocok SEBAGIAN saja - pakai sebagai petunjuk arah, bukan bukti.');
  return [`${hasil.length} potongan dokumen bundel cocok (indeks versi ${versi.aplikasi}):`, ...catatan2, cari.formatHasil(hasil)].join('\n');
}

/* ------------------------------------------------------------------ */
/* bagian=versi                                                        */
/* ------------------------------------------------------------------ */

async function bagianVersi(): Promise<string> {
  const [cmd, upd, mcpS, cari] = await Promise.all([
    import('../commands'),
    import('../updaterStore'),
    import('../mcpStore'),
    import('../zephyrCari'),
  ]);
  const [ai, di, mcp] = await Promise.all([
    cmd.getAppInfo().catch(() => null),
    cmd.getDiagnostics().catch(() => null),
    cmd.mcpStatus().catch(() => null),
  ]);
  const a = ai as { version?: string; identifier?: string; arch?: string; webview?: string; portable?: boolean; profile?: string; dataDir?: string; exeDir?: string } | null;
  const d = di as { version?: string; mcpPort?: number; os?: string; cpuCount?: number; debug?: boolean } | null;
  const f = cari.versiFakta();
  const cap = cari.capTersimpan();
  const u = upd.useUpdater.getState();
  const m = mcpS.useMcp.getState();
  const vApp = a?.version ?? d?.version ?? '?';
  const basi = vApp !== '?' && vApp !== f.aplikasi;

  const baris: string[] = [];
  baris.push(`Versi aplikasi: ${vApp}${a?.version !== undefined && d?.version !== undefined && a.version !== d.version ? ` (peringatan: get_app_info=${a.version} vs get_diagnostics=${d.version})` : ''}`);
  baris.push(`Mode: ${import.meta.env.DEV ? 'dev (Vite)' : 'build'} - identifier ${a?.identifier ?? '?'} - arsitektur ${a?.arch ?? '?'} - webview ${a?.webview ?? '?'} - portable ${a?.portable ? 'ya' : 'tidak'}${a?.profile ? ` - profil ${a.profile}` : ''}`);
  baris.push(`dataDir: ${a?.dataDir ?? '?'}${a?.exeDir ? ` - exeDir: ${a.exeDir}` : ''}`);
  baris.push(`Indeks fakta bundel: versi ${f.aplikasi} - hash sumber ${f.hashSumber} (label hasil pembangunan; aplikasi yang berjalan tidak bisa menghitung ulang hash sumbernya sendiri)`);
  /* AI-TAHU-100-4/5: saat versi sama, dulu keluaran bilang "segar (sama dengan
   * versi app yang berjalan)" - klaim SEGAR MUTLAK padahal yang dibandingkan
   * hanya VERSI, bukan hash. Sekarang dasar penilaiannya disebut apa adanya dan
   * kata BASI tetap tersedia (hash sumber yang basi tidak bisa dibedakan dari
   * dalam app, jadi jangan pernah mengklaim segar tanpa syarat). */
  baris.push(`Kemutakhiran indeks: ${basi ? `BASI - indeks dibuat untuk versi ${f.aplikasi}, aplikasi berjalan ${vApp}` : 'segar menurut VERSI (versi app == versi indeks) - hash sumber tidak bisa dihitung ulang dari dalam aplikasi, jadi kesegaran hash TIDAK terbukti di sini; itu diuji saat build oleh: node scripts/gen-fakta-zephyr.mjs --check (exit != 0 = BASI)'} - cap ${f.aplikasi} / ${f.hashSumber} (${cap.berkas} berkas, ${cap.entri} entri); cara memeriksa dari app: zephyr_self bagian=indeks`);
  baris.push(`MCP: ${mcp?.running ? 'hidup' : 'mati'} - port ${mcp?.port ?? '?'} (diminta ${mcp?.requestedPort ?? '?'}) - store port ${m.status?.port ?? '?'} - diagnostics mcpPort ${d?.mcpPort ?? '?'}${mcp && !mcp.enabled ? ' - nonaktif di setelan' : ''}`);
  baris.push(`Pembaruan: status=${u.status}${u.version ? ` - versi terbaru ${u.version}` : ' - belum ada versi yang dilaporkan'}${u.message ? ` - ${u.message}` : ''}${import.meta.env.DEV ? ' (mode dev: pengecekan update dimatikan)' : ''}`);
  baris.push(`Sistem: ${d?.os ?? '?'} - ${d?.cpuCount ?? '?'} inti CPU - debug ${d?.debug ? 'ya' : 'tidak'}`);
  return baris.join('\n');
}

/* ------------------------------------------------------------------ */
/* bagian=indeks                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cap indeks bundel + jalur perbaikannya. TIDAK menulis apa pun: yang dijalankan
 * hanya alat pemeriksa, dan penyegaran tetap perintah yang di-Enter user.
 *
 * Kenapa hash sumber tidak dihitung di sini: aplikasi terpasang tidak membawa
 * pohon sumber, dan cap itu sha1 - yang tidak tersedia di webview. Jadi cap
 * NYATA memang tidak bisa dihitung dari dalam app. Yang bisa dilakukan app:
 * (a) menyebut cap tersimpannya apa adanya (versi + hash + angka berkas/entri),
 * (b) bilang TIDAK BISA DIVERIFIKASI - bukan "segar", lewat capBasi(null), dan
 * (c) menunjuk pemeriksa yang bisa dijalankan di mesin yang punya sumbernya.
 */
async function bagianIndeks(): Promise<string> {
  const [cmd, cari, { useStore }] = await Promise.all([
    import('../commands'),
    import('../zephyrCari'),
    import('../store'),
  ]);
  const cap = cari.capTersimpan();
  const ai = (await cmd.getAppInfo().catch(() => null)) as { version?: string } | null;
  const vApp = ai?.version ?? ((await cmd.getDiagnostics().catch(() => null)) as { version?: string } | null)?.version ?? '?';
  const ws = useStore.getState().workspace;
  const nilai = cari.capBasi(null);
  const baris = [
    `Cap indeks bundel: versi ${cap.aplikasi} - hash sumber ${cap.hashSumber} - ${cap.berkas} berkas - ${cap.entri} entri.`,
    `Versi aplikasi yang berjalan: ${vApp}${vApp !== '?' && vApp !== cap.aplikasi ? ' (BEDA - indeks dibuat untuk versi lain)' : vApp === '?' ? ' (tidak terbaca)' : ' (sama)'}.`,
    `Kesegaran hash (bisa diverifikasi dari dalam app: ${nilai.bisaDiverifikasi ? 'ya' : 'tidak'}): ${nilai.alasan}.`,
    'Pemeriksa yang bisa menghitungnya dijalankan di mesin yang punya pohon sumber Zephyr - bukan dari dalam app.',
  ];
  if (ws) {
    baris.push(`Workspace terbuka: ${ws}. Kalau folder itu pohon sumber Zephyr, jalankan di terminal pane:`);
    baris.push('  node scripts/cek-indeks-sinkron.mjs');
    baris.push('  node scripts/gen-fakta-zephyr.mjs --check');
    baris.push('Pemeriksa mencetak cap tersimpan vs cap nyata + jumlah berkas/entri yang tertinggal; --check keluar 1 saat basi. Jangan menyegarkan tanpa perintah user.');
  } else {
    baris.push('Tidak ada workspace terbuka, jadi tidak ada tempat menjalankan pemeriksa. Sebutkan cap di atas apa adanya.');
  }
  return baris.join('\n');
}

/* ------------------------------------------------------------------ */
/* bagian=fakta (perilaku lama, dipertahankan)                          */
/* ------------------------------------------------------------------ */

async function bagianFakta(kueri: string, kategori: string, batas: number): Promise<string> {
  const cari = await import('../zephyrCari');
  const { cariFakta, formatHasil, hitungCocok, kategoriTersedia, versiFakta, kataTakDikenal, BATAS_HASIL_BAWAAN, BATAS_HASIL_MAKS } = cari;
  const batasAman = Math.min(BATAS_HASIL_MAKS, Math.max(1, batas || BATAS_HASIL_BAWAAN));
  const kat = (kategori || 'semua') as FaktaKategori | 'semua';
  const versi = versiFakta();

  if (!kueri) {
    const daftar = kategoriTersedia().map((k) => `${k.kategori} (${k.jumlah})`).join(', ');
    return [
      `Indeks fakta Zephyr yang ikut terpasang: versi aplikasi ${versi.aplikasi}, hash sumber ${versi.hashSumber}.`,
      `Kategori: ${daftar}.`,
      'Kirim `kueri` (boleh beberapa kata) dan opsional `kategori`.',
      'Isi berkas sumber TIDAK ikut pemasangan: yang ada di sini peta berkas -> simbol dan ringkasan.',
    ].join('\n');
  }

  const hasil = cariFakta(kueri, { kategori: kat, batas: batasAman });
  if (hasil.length === 0) {
    const petunjuk = kategoriTersedia().map((k) => `${k.kategori}(${k.jumlah})`).join(', ');
    const takDikenal = kataTakDikenal(kueri);
    const catatan = takDikenal.length > 0
      ? ` Kata ini tidak ada di fakta Zephyr: ${takDikenal.join(', ')} - kemungkinan besar yang kamu cari memang belum ada. Jangan mengarang jawabannya.`
      : '';
    return `Tidak ada fakta yang cocok dengan "${kueri}".${catatan} Kategori yang bisa dicari: ${petunjuk}. Coba kata kunci lain, atau satu kata saja.`;
  }
  const total = hitungCocok(kueri, kat);
  const catatan2: string[] = [];
  const takDikenal = kataTakDikenal(kueri);
  if (takDikenal.length > 0) catatan2.push(`Catatan: kata ${takDikenal.join(', ')} tidak ada di fakta Zephyr - jangan mengarang.`);
  if (hasil.some((h) => h.longgar)) catatan2.push('Catatan: sebagian hasil cocok SEBAGIAN saja - pakai sebagai petunjuk arah, bukan bukti.');
  return [`${hasil.length} dari ${total} fakta cocok (indeks versi ${versi.aplikasi}, hash sumber ${versi.hashSumber}).`, ...catatan2, formatHasil(hasil)].join('\n');
}

/* ------------------------------------------------------------------ */
/* bagian=semua                                                        */
/* ------------------------------------------------------------------ */

async function bagianSemua(): Promise<string> {
  const [cmd, cari, { useStore }] = await Promise.all([
    import('../commands'),
    import('../zephyrCari'),
    import('../store'),
  ]);
  const [ai, di, mcp, list, bundled] = await Promise.all([
    cmd.getAppInfo().catch(() => null),
    cmd.getDiagnostics().catch(() => null),
    cmd.mcpStatus().catch(() => null),
    cmd.extensionsList().catch(() => []),
    cmd.extensionsBundledIds().catch(() => [] as string[]),
  ]);
  const a = ai as { version?: string; dataDir?: string } | null;
  const f = cari.versiFakta();
  const cap = cari.capTersimpan();
  const ws = useStore.getState().workspace;
  const vApp = a?.version ?? (di as { version?: string } | null)?.version ?? '?';
  return [
    `Zephyr ${vApp} (mode ${import.meta.env.DEV ? 'dev' : 'build'}) - dataDir ${a?.dataDir ?? '?'}.`,
    `Workspace: ${ws ? `terbuka (${ws})` : 'TIDAK ADA folder terbuka - zephyr_self tetap jalan'}.`,
    `MCP: ${mcp?.running ? `hidup di port ${mcp.port}` : 'mati'} - diag mcpPort ${(di as { mcpPort?: number } | null)?.mcpPort ?? '?'}.`,
    `Ekstensi: ${list.length} terdaftar (${bundled.length} bundel).`,
    `Indeks fakta: versi ${f.aplikasi}, hash ${f.hashSumber}, ${cap.berkas} berkas / ${cap.entri} entri${vApp !== '?' && vApp !== f.aplikasi ? ' (BASI menurut versi - lebih tua dari app)' : ''}.`,
    'Rinciannya: bagian=setelan|log|ekstensi|docs|versi|indeks (plus fakta untuk isi indeks).',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Spesifikasi tool                                                    */
/* ------------------------------------------------------------------ */

export const SPEC_ZEPHYR_SELF: AgentToolSpec = {
  name: 'zephyr_self',
  description:
    'Periksa ZEPHYR SENDIRI dari sumber milik aplikasi - tidak butuh folder proyek user dan tidak butuh jaringan. bagian: setelan (settings.json + nilai efektif), log (berkas log, kebijakan rotasi, status panic), ekstensi (terdaftar/mati/gagal + alasan), docs (dokumen bundel + pencarian lokal), versi (versi app, status update, port MCP), indeks (cap versi + hash sumber indeks fakta + angka berkas/entri, dan cara memeriksa kesegarannya), fakta (indeks fakta Zephyr: label, setelan, perintah, pintasan, tool, ekstensi, dokumen), semua (ringkasan). kueri = pencarian lokal deterministik; maks = jumlah potongan (1-4, <=800 token/potongan). Kalau bagian=indeks melaporkan cap BEDA atau pemeriksa mengeluh BASI, sebutkan angka yang tertinggal apa adanya dan jangan mengaku fakta Zephyr sudah segar; untuk menyegarkan, jalankan sendiri `node scripts/gen-fakta-zephyr.mjs` lewat bash_run di folder sumber Zephyr (bukan folder proyek user) lalu laporkan keluaran apa adanya.',
  parameters: {
    type: 'object',
    properties: {
      bagian: {
        type: 'string',
        enum: ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'indeks', 'fakta', 'semua'],
        description: 'Sumber app yang diperiksa (bawaan: fakta kalau ada kueri, kalau tidak: semua).',
      },
      kueri: { type: 'string', description: 'Kata kunci pencarian lokal deterministik di dalam bagian terpilih.' },
      maks: { type: ['number', 'string'], description: 'Jumlah potongan keluaran (1-4, bawaan 4). Tiap potongan <= 800 token.' },
      kategori: {
        type: 'string',
        description:
          'Khusus bagian=fakta: label, layar, menu, panel, setelan, pintasan, perintah, tool, ekstensi, seksi, port, dokumen, kode, bridge, atau semua. ' +
          '`label` = teks antarmuka dari kamus i18n; `layar` = tombol/tooltip/teks yang dirender tiap komponen; `menu` = menu bar + itemnya; `panel` = tab dan ikon sidebar.',
      },
      batas: { type: ['number', 'string'], description: 'Khusus bagian=fakta: jumlah hasil (bawaan 8, maksimum 40).' },
    },
    required: [],
  },
};

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export async function jalankanZephyrSelf(args: Record<string, unknown> = {}): Promise<string> {
  const kueri = bacaTeks(args.kueri);
  const bagian = bacaTeks(args.bagian) || (kueri ? 'fakta' : 'semua');
  const maks = Math.max(1, Math.min(POTONGAN_MAKS, bacaAngka(args.maks, POTONGAN_MAKS)));
  const kategori = bacaTeks(args.kategori) || 'semua';
  const batas = bacaAngka(args.batas, 8);

  if (!BAGIAN_TAMPAK.includes(bagian) && !BAGIAN_LAIN.includes(bagian)) {
    return `bagian tidak dikenal: "${bagian}". Bagian yang tersedia: ${BAGIAN_TAMPAK.join('|')}|${BAGIAN_LAIN.join('|')}. Ini kontrol negatif yang disengaja - jangan mengarang isi bagian yang tidak ada.`;
  }

  const { app: vApp, indeks: vIndeks } = await versiRingkas();
  const kunci = `${bagian}|${kueri}|${maks}|${kategori}|${batas}|${vApp}|${vIndeks}`;
  const tersimpan = CACHE_SESI.get(kunci);
  if (tersimpan !== undefined) return tersimpan;

  // BASI hanya bisa terjadi pada data yang IKUT BUNDEL (indeks fakta/dokumen);
  // setelan/log/ekstensi/versi dibaca hidup dari app saat itu juga.
  const pakaiIndeks = bagian === 'docs' || bagian === 'fakta' || bagian === 'semua' || bagian === 'indeks';
  const basi = pakaiIndeks && vApp !== '?' && vIndeks !== '?' && vApp !== vIndeks;

  let isi: string;
  let sumber: string[];
  switch (bagian) {
    case 'setelan':
      isi = await bagianSetelan(kueri);
      sumber = ['store.settings (efektif)', 'get_settings', 'get_app_info.dataDir'];
      break;
    case 'log':
      isi = await bagianLog();
      sumber = ['get_diagnostics.logFile', 'logging.rs (kebijakan rotasi)', 'log_tail (isi baris log, read-only)'];
      break;
    case 'ekstensi':
      isi = await bagianEkstensi(kueri);
      sumber = ['extensions_list', 'extensions_manifests', 'extensions_bundled_ids', 'ext_registry_installed', 'extensionStore.loaded'];
      break;
    case 'docs':
      isi = await bagianDocs(kueri);
      sumber = ['zephyrIndeks(dokumen)', 'zephyrCari'];
      break;
    case 'versi':
      isi = await bagianVersi();
      sumber = ['get_app_info', 'get_diagnostics', 'updaterStore', 'mcp_status', 'zephyrCari.versiFakta'];
      break;
    case 'indeks':
      isi = await bagianIndeks();
      sumber = ['zephyrCari.capTersimpan', 'zephyrCari.capBasi', 'get_app_info', 'get_diagnostics', 'store.workspace', 'scripts/cek-indeks-sinkron.mjs'];
      break;
    case 'fakta':
      isi = await bagianFakta(kueri, kategori, batas);
      sumber = ['zephyrIndeks', 'zephyrCari'];
      break;
    default:
      isi = await bagianSemua();
      sumber = ['get_app_info', 'get_diagnostics', 'mcp_status', 'extensions_list', 'store.workspace', 'zephyrCari'];
  }

  /* AI-TAHU-100-7: kepala/header JSON IKUT dibebankan ke potongan PERTAMA supaya
   * "<=800 token/potongan" berlaku untuk SELURUH muatan satu panggilan, bukan
   * cuma badan potongannya. Panjang kepala bergantung pada potongannya sendiri
   * (header memuat token tiap potongan), jadi dihitung sampai stabil. */
  const rakitHeader = (p: string[]) => ({
    bagian,
    potongan: p.length,
    maks,
    token: p.map(perkirakanToken),
    versiApp: vApp,
    versiIndeks: vIndeks,
    basi,
    sumber,
    aturan: 'ai-tahu-100-7 (maks 4 potongan, <=800 token/potongan TERMASUK kepala/header, cache per sesi)',
  });
  let bebanKepala = 0;
  for (let putaran = 0; putaran < 4; putaran += 1) {
    const panjangKepala = `ZEPHYR_SELF ${JSON.stringify(rakitHeader(potongKePotongan(isi, maks, bebanKepala)))}\n\n`.length;
    if (panjangKepala <= bebanKepala) break;
    bebanKepala = panjangKepala;
  }
  const potongan = potongKePotongan(isi, maks, bebanKepala);
  const header = rakitHeader(potongan);
  const kepala = basi
    ? `PERINGATAN: data di bawah ini BASI - indeks bundel dibuat untuk versi ${vIndeks} sedangkan aplikasi yang berjalan ${vApp}. Sebutkan kebasian ini saat menjawab; jangan mengarang.\n\n`
    : '';
  const kepalaJson = `ZEPHYR_SELF ${JSON.stringify(header)}\n\n`;
  const keluaran = `${kepalaJson}${kepala}${potongan.join('\n\n--- potongan berikutnya ---\n\n')}`;
  CACHE_SESI.set(kunci, keluaran);
  return keluaran;
}

/** Entri tool untuk `AGENT_TOOLS` (dipasang dari `agentTools.ts`). */
export const TOOL_ZEPHYR_SELF: {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
} = {
  spec: SPEC_ZEPHYR_SELF,
  run: jalankanZephyrSelf,
};
