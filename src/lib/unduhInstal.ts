/*
 * UNDUH-INSTAL - jalur "unduh -> periksa -> pasang" untuk paket EKSTENSI.
 *
 * Kenapa berkas ini ada
 * ---------------------
 * Sebelumnya "terpasang" adalah satu-satunya kata yang dilaporkan. Paket yang
 * isinya tidak dibaca siapa pun (tema tanpa warna UI, kumpulan perintah tanpa
 * skrip, contributes.menus) terpasang, muncul di daftar sebagai "Installed",
 * dan tidak mengubah satu piksel pun. Uji yang menyebut ini "diuji" karena
 * cuma memanggil tombol Install tidak membuktikan apa-apa.
 *
 * Berkas ini memegang PORSI YANG BISA DIBUKTIKAN di luar aplikasi:
 *   1. gerbang URL   : allowlist + https saja (tidak dilonggarkan),
 *   2. unduh         : byte masuk ke berkas sementara, dihitung sha256-nya,
 *   3. tolak         : host di luar allowlist, bukan https, paket BERKODE,
 *                      dan hash yang tidak cocok,
 *   4. pasang        : hanya setelah semua gerbang lolos,
 *   5. laporan bukti : ANGKANYA, bukan kata "berhasil" -
 *                      tema  = jumlah token warna + warna UI,
 *                      ikon  = jumlah ikon di iconDefinitions,
 *                      snippet = jumlah paket snippet,
 *                      keymap  = jumlah pintasan di keybindings,
 *                      bahasa  = mode bahasa yang jadi aktif.
 *
 * Batas yang jujur
 * ----------------
 * Ekstraksi `.zext` (zip) dan pemindahan folder tinggal di Rust
 * (`src-tauri/src/ext_pkg.rs`: `unzip_zext`, `extensions_install`) dan butuh
 * aplikasi berjalan, jadi di sini ekstraksi DISUNTIK lewat `bongkar` - penguji
 * mengisi fungsi itu, aplikasi mengisinya dengan perintah Tauri. Yang diuji di
 * sini adalah gerbang + hitungan buktinya, yaitu bagian yang dulu tidak ada.
 *
 * Kebijakan yang dipatuhi: `docs/KEPUTUSAN-MARKETPLACE-j5.md` (opsi C). Paket
 * BERKODE ditolak; yang boleh lewat jalur internet hanya paket deklaratif
 * (themes / iconThemes / snippets / keymaps / grammars-bahasa).
 */

/** Domain yang boleh dipakai mengunduh. Sama dengan `IZIN` di `ext_pkg.rs`. */
export const IZIN_HOST: readonly string[] = ['open-vsx.org', 'www.open-vsx.org'];

/** Batas ukuran satu paket. Sama dengan `MAX_ZEXT_BYTES`. */
export const MAX_ZEXT_BYTE = 1024 * 1024 * 1024;

/** Baris pertama pesan tolak. Sama dengan `TOLAK_PENANDA` di `ext_pkg.rs`. */
export const TOLAK_PENANDA = 'NOTHING TO INSTALL:';

/**
 * Versi Zephyr yang dikutip di pesan tolak. Penguji memastikan ini sama dengan
 * `package.json`, jadi pesannya tidak pernah menyebut versi yang salah.
 */
export const VERSI_ZEPHYR = '1.1.14';

export type Tahap = 'url' | 'unduh' | 'hash' | 'kode' | 'pasang';

export type Alasan =
  | 'URL_TIDAK_VALID'
  | 'HOST_TIDAK_DIIZINKAN'
  | 'BUKAN_HTTPS'
  | 'ID_TIDAK_VALID'
  | 'UNDUH_GAGAL'
  | 'STATUS_BURUK'
  | 'KOSONG'
  | 'TERLALU_BESAR'
  | 'HASH_TIDAK_COCOK'
  | 'BONGKAR_GAGAL'
  | 'MANIFEST_BURUK'
  | 'PAKET_BERKODE'
  | 'TIDAK_ADA_KONTRIBUSI';

export interface KontribItem {
  kind: string;
  label: string;
  detail: string;
}

/** Angka bukti perubahan, satu blok per jenis kontribusi. */
export interface LaporanBukti {
  tema: { jumlahTema: number; warnaUI: number; tokenWarna: number };
  ikon: { jumlahIkonTheme: number; jumlahIkon: number; jumlahDapatDigambar: number };
  snippet: { jumlahSnippet: number };
  keymap: { jumlahKeymap: number; jumlahPintasan: number };
  bahasa: { jumlahBahasa: number; modeAktif: string[] };
  didukung: KontribItem[];
  diabaikan: KontribItem[];
  ringkasan: string[];
}

export interface HasilGagal {
  ok: false;
  tahap: Tahap;
  alasan: Alasan;
  pesan: string;
}

export interface HasilUnduh {
  ok: true;
  bytes: Uint8Array;
  byte: number;
  hash: string;
  /** Path berkas sementara, kalau penguji/aplikasi menyediakan penulisnya. */
  berkas?: string;
}

export interface HasilPasang {
  ok: true;
  id: string;
  byte: number;
  hash: string;
  berkas?: string;
  laporan: LaporanBukti;
}

/** Pembaca berkas di dalam paket yang sudah diekstrak. */
export type Baca = (rel: string) => string | undefined;

export interface PaketTerbuka {
  baca: Baca;
  /** Tempat paket diekstrak, kalau ekstraktornya menaruhnya di disk. */
  dir?: string;
}

export type Bongkar = (bytes: Uint8Array) => PaketTerbuka | Promise<PaketTerbuka>;

export interface BalasanTransport {
  status: number;
  bytes: Uint8Array;
}

export type Transport = (url: string) => Promise<BalasanTransport>;

export interface OpsiUnduh {
  url: string;
  id: string;
  /** sha256 yang diharapkan. Boleh kosong: hash tetap dihitung dan dilaporkan. */
  sha256?: string;
  transport?: Transport;
  maxByte?: number;
  tulisBerkasSementara?: (nama: string, bytes: Uint8Array) => string;
}

export interface OpsiPasang extends OpsiUnduh {
  bongkar: Bongkar;
}

/* ------------------------------------------------------------------ */
/* Nama berkas manifest: sama dengan urutan di `read_manifest` (Rust). */
/* ------------------------------------------------------------------ */
export const MANIFEST_NATIVE = 'zephyr-extension.json';
export const MANIFEST_VSCODE = 'package.json';

export function idAman(id: string): boolean {
  const t = id.trim();
  if (!t || t.length > 128) return false;
  if (t.startsWith('.') || t.includes('..')) return false;
  return /^[A-Za-z0-9._-]+$/.test(t);
}

function gagal(tahap: Tahap, alasan: Alasan, pesan: string): HasilGagal {
  return { ok: false, tahap, alasan, pesan };
}

export function hostDari(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Gerbang URL. Urutannya http/https lebih dulu supaya pesannya jelas, lalu
 * allowlist. Bukan `startsWith` yang bisa dilewati trik host seperti
 * `open-vsx.org.evil.example` - host diperiksa sebagai host.
 */
export function periksaUrl(url: string): { ok: true; host: string } | HasilGagal {
  const u = hostDari(url);
  if (u === undefined) {
    return gagal('url', 'URL_TIDAK_VALID', `not a usable URL: ${url}`);
  }
  let protokol = '';
  try {
    protokol = new URL(url).protocol;
  } catch {
    return gagal('url', 'URL_TIDAK_VALID', `not a usable URL: ${url}`);
  }
  if (protokol !== 'https:') {
    return gagal(
      'url',
      'BUKAN_HTTPS',
      `only https downloads are allowed (got ${protokol || 'no scheme'}): ${url}`,
    );
  }
  if (!IZIN_HOST.includes(u)) {
    return gagal(
      'url',
      'HOST_TIDAK_DIIZINKAN',
      `downloads are only allowed from a trusted registry (${IZIN_HOST.join(', ')}); refusing ${u}`,
    );
  }
  return { ok: true, host: u };
}

export function normalisasiHash(h: string): string {
  return h.trim().toLowerCase().replace(/^sha256:/, '').trim();
}

/** sha256 heksadesimal huruf kecil. Ada di browser (WebCrypto) dan Node >= 18. */
export async function hashSha256(bytes: Uint8Array): Promise<string> {
  const salinan = bytes.slice();
  const d = await crypto.subtle.digest('SHA-256', salinan.buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashCocok(dapat: string, harap: string): boolean {
  const a = normalisasiHash(dapat);
  const b = normalisasiHash(harap);
  return a.length === 64 && a === b;
}

const transportBawaan: Transport = async (url) => {
  const r = await fetch(url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'Zephyr-Editor/1.0' },
  });
  return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
};

/**
 * Unduh ke berkas sementara lalu hitung hash. TIDAK memasang apa pun.
 *
 * Urutan gerbangnya sengaja: URL diperiksa SEBELUM menyentuh jaringan, hash
 * diperiksa SEBELUM byte-nya dikembalikan ke pemanggil. Jadi paket yang tidak
 * lolos tidak pernah sampai ke langkah pasang.
 */
export async function unduhKeSementara(o: OpsiUnduh): Promise<HasilUnduh | HasilGagal> {
  const url = periksaUrl(o.url);
  if (url.ok !== true) return url;

  if (!idAman(o.id)) {
    return gagal('unduh', 'ID_TIDAK_VALID', `invalid id: ${o.id}`);
  }

  const transport = o.transport ?? transportBawaan;
  let balasan: BalasanTransport;
  try {
    balasan = await transport(o.url);
  } catch (e) {
    return gagal('unduh', 'UNDUH_GAGAL', `failed to download: ${String(e)}`);
  }

  if (balasan.status !== 200) {
    return gagal('unduh', 'STATUS_BURUK', `registry answered ${balasan.status} while downloading ${o.id}`);
  }
  const bytes = balasan.bytes;
  const max = o.maxByte ?? MAX_ZEXT_BYTE;
  if (bytes.length > max) {
    return gagal('unduh', 'TERLALU_BESAR', `package exceeds the ${Math.floor(max / 1024 / 1024)} MB limit`);
  }
  if (bytes.length === 0) {
    return gagal('unduh', 'KOSONG', 'the downloaded package is empty');
  }

  const hash = await hashSha256(bytes);
  if (o.sha256 !== undefined && o.sha256.trim() !== '' && !hashCocok(hash, o.sha256)) {
    return gagal(
      'hash',
      'HASH_TIDAK_COCOK',
      `sha256 mismatch: got ${hash}, expected ${normalisasiHash(o.sha256)}`,
    );
  }

  // Berkas sementara ditulis HANYA setelah hash lolos, supaya paket yang
  // ditolak tidak meninggalkan artefak yang bisa terpasang belakangan.
  let berkas: string | undefined;
  if (o.tulisBerkasSementara) {
    berkas = o.tulisBerkasSementara(`${o.id}.zext`, bytes);
  }

  const hasil: HasilUnduh = { ok: true, bytes, byte: bytes.length, hash };
  if (berkas !== undefined) hasil.berkas = berkas;
  return hasil;
}

/* ------------------------------------------------------------------ */
/* Pembacaan kontribusi (murni data, tidak menyentuh jaringan)         */
/* ------------------------------------------------------------------ */

function bacaJson(baca: Baca, rel: string | undefined): unknown {
  if (!rel || rel.trim() === '') return undefined;
  const teks = baca(rel);
  if (teks === undefined) return undefined;
  try {
    return JSON.parse(teks) as unknown;
  } catch {
    return undefined;
  }
}

/** Panjang objek/array anggota, 0 untuk apa pun yang lain (mirror `hitung`). */
export function hitung(v: unknown, kunci: string): number {
  if (!v || typeof v !== 'object') return 0;
  const n = (v as Record<string, unknown>)[kunci];
  if (Array.isArray(n)) return n.length;
  if (n && typeof n === 'object') return Object.keys(n).length;
  return 0;
}

/**
 * Pintasan yang benar-benar dikandung berkas keymap.
 *
 * `muatKeymap` (src/lib/extLoader.ts) menerima DUA bentuk: array polos, dan
 * objek yang membungkusnya di `keybindings`. Mirror Rust (`hitung_binding`) —
 * dulu hanya bentuk terbungkus yang dihitung, jadi keymap ber-array polos
 * (termasuk keempat keymap bawaan) dilaporkan "declares 0 key bindings" dan
 * ditolak di gerbang.
 */
export function hitungBinding(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  return hitung(v, 'keybindings');
}

/**
 * Ikon yang benar-benar BISA DIGAMBAR pemuat Zephyr.
 *
 * DUA bentuk dihitung, karena pemuat menerima keduanya:
 *   - `iconPath` - gambar SVG asli (bentuk VS Code). Ini yang dipakai semua
 *     icon theme marketplace sungguhan, dan inilah yang membuat ikonnya
 *     BENAR-BENAR berubah, bukan cuma huruf di kotak.
 *   - `glyph` / `fontCharacter` - tanda teks pendek. Masih sah, tapi hasilnya
 *     huruf berwarna, bukan gambar.
 *
 * Sebelum `iconPath` dihitung, setiap paket marketplace dilaporkan "0 icons"
 * dan ditolak di gerbang walau isinya 200 definisi gambar - kegagalan yang
 * membuat icon theme "terpasang tapi tidak mengubah apa pun".
 */
export function jumlahIkonDapatDigambar(v: unknown): number {
  if (!v || typeof v !== 'object') return 0;
  const akar = v as Record<string, unknown>;
  const defs = akar.iconDefinitions;
  if (defs && typeof defs === 'object' && !Array.isArray(defs)) {
    let n = 0;
    for (const e of Object.values(defs as Record<string, unknown>)) {
      if (!e || typeof e !== 'object') continue;
      const d = e as { iconPath?: unknown; glyph?: unknown; fontCharacter?: unknown };
      const path = typeof d.iconPath === 'string' ? d.iconPath.trim() : '';
      const glyph = typeof d.glyph === 'string' ? d.glyph.trim() : '';
      const font = typeof d.fontCharacter === 'string' ? d.fontCharacter.trim() : '';
      if (path || glyph || font) n += 1;
    }
    return n;
  }
  const peta =
    akar.icons && typeof akar.icons === 'object' && !Array.isArray(akar.icons)
      ? (akar.icons as Record<string, unknown>)
      : akar;
  let n = 0;
  for (const e of Object.values(peta)) {
    if (!e || typeof e !== 'object') continue;
    const d = e as { iconPath?: unknown; glyph?: unknown };
    const path = typeof d.iconPath === 'string' ? d.iconPath.trim() : '';
    const glyph = typeof d.glyph === 'string' ? d.glyph.trim() : '';
    if (path || glyph) n += 1;
  }
  return n;
}

function adaBerkas(baca: Baca, rel: string): boolean {
  return baca(rel) !== undefined;
}

/** Nama file yang sama dengan `skrip_utama` (Rust): polos -> .js/.cjs/.mjs. */
export function skripUtama(baca: Baca, main: string | undefined): string | undefined {
  const m = (main ?? '').trim();
  if (m === '') return undefined;
  const bersih = m.replace(/^\.\//, '');
  if (adaBerkas(baca, bersih)) return bersih;
  for (const akhiran of ['.js', '.cjs', '.mjs']) {
    if (adaBerkas(baca, `${bersih}${akhiran}`)) return `${bersih}${akhiran}`;
  }
  return undefined;
}

export interface ContributesPaket {
  themes?: { label?: string; path?: string }[];
  iconThemes?: { label?: string; path?: string }[];
  snippets?: { language?: string; path?: string }[];
  keymaps?: { label?: string; path?: string }[];
  languages?: {
    id?: string;
    label?: string;
    extensions?: string[];
    cmLang?: string;
    grammars?: unknown[];
  }[];
  debuggers?: { type?: string; label?: string; program?: string; runtime?: string }[];
  debugAdapters?: { type?: string; label?: string; program?: string; runtime?: string }[];
  commands?: { command?: string; title?: string }[];
}

export interface ManifestPaket {
  name?: string;
  publisher?: string;
  version?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: ContributesPaket;
}

function c(m: ManifestPaket): ContributesPaket {
  return m.contributes ?? {};
}

function daftar<T>(x: T[] | undefined): T[] {
  return Array.isArray(x) ? x : [];
}

/**
 * Alasan paket ini termasuk BERKODE (dijalankan, bukan cuma data). Kosong =
 * deklaratif. Ini gerbang kebijakan j5, dan SENGAJA lebih ketat dari
 * `pengaruh_paket` di Rust: di sana skrip utama masih dihitung "didukung"
 * karena `extensions_install` menerima paket lokal; di jalur internet (berkas
 * ini) paket berkode ditolak lebih dulu, sesuai keputusan opsi C.
 */
export function pemicuKode(m: ManifestPaket, baca: Baca): string[] {
  const r: string[] = [];
  const main = (m.main ?? '').trim();
  const skrip = skripUtama(baca, main);
  if (skrip !== undefined) {
    r.push(`runs the script ${skrip} (a package that executes JavaScript needs an extension host)`);
  } else if (main !== '') {
    r.push(`declares main '${main}' (a code package, and the script is not even in the archive)`);
  } else if (adaBerkas(baca, 'extension.js')) {
    r.push('ships extension.js (a package that executes JavaScript needs an extension host)');
  }
  const n = daftar(c(m).commands).length;
  if (n > 0) r.push(`${n} command${n === 1 ? '' : 's'} registered by a host-side script`);
  const ae = daftar(m.activationEvents).length;
  if (ae > 0) r.push(`${ae} activation event${ae === 1 ? '' : 's'}`);
  return r;
}

function jumlahNama(n: number, satu: string, jamak: string): string {
  return n === 1 ? satu : `${n} ${jamak}`;
}

function ki(kind: string, label: string, detail: string): KontribItem {
  return { kind, label, detail };
}

/**
 * Laporan bukti perubahan, satu blok angka per jenis. Isinya harus dibaca dari
 * berkas yang benar-benar ikut paket, bukan diasumsikan dari nama kontribusi.
 */
export function laporanBuktiPerubahan(m: ManifestPaket, baca: Baca): LaporanBukti {
  const out: LaporanBukti = {
    tema: { jumlahTema: 0, warnaUI: 0, tokenWarna: 0 },
    ikon: { jumlahIkonTheme: 0, jumlahIkon: 0, jumlahDapatDigambar: 0 },
    snippet: { jumlahSnippet: 0 },
    keymap: { jumlahKeymap: 0, jumlahPintasan: 0 },
    bahasa: { jumlahBahasa: 0, modeAktif: [] },
    didukung: [],
    diabaikan: [],
    ringkasan: [],
  };
  const cc = c(m);

  /* Tema: dua bagian terpisah. colors = UI, tokenColors = kode. Tema tanpa
     warna UI tidak mengubah piksel apa pun, jadi diabaikan - bukan dihitung. */
  for (const t of daftar(cc.themes)) {
    const label = (t.label ?? '').trim() || t.path || 'theme';
    const v = bacaJson(baca, t.path);
    if (v === undefined) {
      out.diabaikan.push(ki('theme', label, `${t.path} is missing, oversized, or not JSON - there is nothing to apply`));
      continue;
    }
    const ui = hitung(v, 'colors');
    const kode = hitung(v, 'tokenColors');
    if (ui === 0) {
      out.diabaikan.push(
        ki('theme', label, `${jumlahNama(kode, '1 code color', 'code colors')} (tokenColors) and 0 UI colors - the window would look exactly the same`),
      );
    } else {
      out.tema.jumlahTema += 1;
      out.tema.warnaUI += ui;
      out.tema.tokenWarna += kode;
      out.didukung.push(
        ki('theme', label, `${jumlahNama(ui, '1 UI color', 'UI colors')} + ${jumlahNama(kode, '1 code color', 'code colors')}`),
      );
    }
  }
  if (out.tema.jumlahTema > 0) {
    out.ringkasan.push(
      `${jumlahNama(out.tema.jumlahTema, '1 theme', 'themes')}: ${jumlahNama(out.tema.warnaUI, '1 UI color', 'UI colors')} + ${jumlahNama(out.tema.tokenWarna, '1 code color', 'code colors')}`,
    );
  }

  /* Ikon: dua format, dan hanya satu yang bisa digambar. `jumlahIkon` tetap
     melaporkan definisi yang DIKLAIM berkasnya (angka yang tampil di laporan),
     tetapi yang menentukan paket ini lulus gerbang adalah `jumlahDapatDigambar`
     - entri format Zephyr (`icons` + glyph) yang benar-benar diterapkan
     `muatIconTheme`. Berkas gaya VS Code (`iconDefinitions`) tidak mengubah
     satu ikon pun, jadi masuk `diabaikan`, bukan dihitung sebagai kontribusi;
     paket yang isinya HANYA itu ditolak sebagai TIDAK_ADA_KONTRIBUSI. */
  for (const i of daftar(cc.iconThemes)) {
    const label = (i.label ?? '').trim() || i.path || 'icon theme';
    const v = bacaJson(baca, i.path);
    if (v === undefined) {
      out.diabaikan.push(ki('iconTheme', label, `${i.path} is missing, oversized, or not JSON - the file tree keeps its default icons`));
      continue;
    }
    const nVs = hitung(v, 'iconDefinitions');
    const nZephyr = jumlahIkonDapatDigambar(v);
    const n = nVs + nZephyr;
    if (n === 0) {
      out.diabaikan.push(ki('iconTheme', label, `0 icon definitions in ${i.path} - no icon changes`));
    } else {
      out.ikon.jumlahIkonTheme += 1;
      out.ikon.jumlahIkon += n;
      if (nZephyr > 0) {
        out.ikon.jumlahDapatDigambar += nZephyr;
        out.didukung.push(ki('iconTheme', label, `${nZephyr} icons`));
      } else {
        out.diabaikan.push(
          ki(
            'iconTheme',
            label,
            `${jumlahNama(nVs, '1 icon definition', 'icon definitions')} in ${i.path} use the VS Code format (iconDefinitions); Zephyr draws only its own {"icons":{".ext":{"glyph","color"}}} format, so the file tree keeps its default icons`,
          ),
        );
      }
    }
  }
  if (out.ikon.jumlahDapatDigambar > 0) {
    out.ringkasan.push(
      `${jumlahNama(out.ikon.jumlahIkonTheme, '1 icon theme', 'icon themes')}: ${out.ikon.jumlahDapatDigambar} icons`,
    );
  }

  /* Snippet: berkasnya harus ada, karena pemuatnya membaca berkas itu. */
  for (const s of daftar(cc.snippets)) {
    const label = (s.language ?? '').trim() || s.path || 'snippets';
    if (s.path === undefined || !adaBerkas(baca, s.path)) {
      out.diabaikan.push(ki('snippet', label, `the snippet file ${s.path} is missing from the package`));
      continue;
    }
    out.snippet.jumlahSnippet += 1;
    out.didukung.push(ki('snippet', label, `snippet pack ${s.path}`));
  }
  if (out.snippet.jumlahSnippet > 0) {
    out.ringkasan.push(jumlahNama(out.snippet.jumlahSnippet, '1 snippet pack', 'snippet packs'));
  }

  /* Keymap: jumlah pintasan yang benar-benar dikandung berkasnya, dalam kedua
     bentuk yang diterima pemuat (array polos atau pembungkus `keybindings`). */
  for (const k of daftar(cc.keymaps)) {
    const label = (k.label ?? '').trim() || k.path || 'keymap';
    const v = bacaJson(baca, k.path);
    if (v === undefined) {
      out.diabaikan.push(ki('keymap', label, `${k.path} is missing, oversized, or not JSON - no key bindings are added`));
      continue;
    }
    const n = hitungBinding(v);
    if (n === 0) {
      out.diabaikan.push(ki('keymap', label, `${k.path} declares 0 key bindings`));
    } else {
      out.keymap.jumlahKeymap += 1;
      out.keymap.jumlahPintasan += n;
      out.didukung.push(ki('keymap', label, `${n} key bindings`));
    }
  }
  if (out.keymap.jumlahKeymap > 0) {
    out.ringkasan.push(`${jumlahNama(out.keymap.jumlahKeymap, '1 keymap', 'keymaps')}: ${out.keymap.jumlahPintasan} key bindings`);
  }

  /* Bahasa: yang dilaporkan adalah mode yang jadi aktif saat berkasnya dibuka.
     Yang TIDAK bisa diputuskan di modul ini: apakah akhiran berkas yang
     diklaim sudah dipegang bahasa bawaan (`lang.ts` `extLangUntuk`: akhiran
     yang dikenal selalu menang). Modul ini sengaja tanpa impor supaya jalur
     gerbang bisa diuji sendiri, jadi pertanyaan itu dijawab pemakai laporan
     dengan data yang dia punya - lihat `catatanBahasaTerpasang()` di
     `src/components/extensions/bahasaTerpasang.ts` (dipakai panel detail dan
     harness `scripts/uji-ekstensi-jenis.mjs`). */
  for (const l of daftar(cc.languages)) {
    const ext = daftar(l.extensions);
    const cm = (l.cmLang ?? '').trim();
    const label = (l.label ?? '').trim() || l.id || 'language';
    if (ext.length === 0 && cm === '') {
      out.diabaikan.push(ki('language', label, 'declares no file extensions and no grammar mode - no file is claimed'));
      continue;
    }
    out.bahasa.jumlahBahasa += 1;
    out.bahasa.modeAktif.push(cm !== '' ? cm : (l.id ?? label));
    const detail = ext.length === 0 ? `language mode '${cm}'` : `claims ${ext.map((e) => `.${e}`).join(' ')}`;
    out.didukung.push(ki('language', label, detail));
  }
  if (out.bahasa.jumlahBahasa > 0) {
    out.ringkasan.push(jumlahNama(out.bahasa.jumlahBahasa, '1 language', 'languages'));
  }

  /* Grammar TextMate: deklaratif (bukan kode), tapi Zephyr belum punya mesin
     TextMate - dilaporkan sebagai diabaikan, bukan dihitung sebagai bukti. */
  const grammar = daftar((cc as { grammars?: unknown[] }).grammars);
  if (grammar.length > 0) {
    out.diabaikan.push(
      ki('grammar', 'grammars', `${jumlahNama(grammar.length, '1 TextMate grammar', 'TextMate grammars')} - Zephyr has no TextMate engine, so highlighting stays with the built-in languages`),
    );
  }

  /* Debug adapter: deklaratif juga, dan Zephyr memang bicara DAP (`dap.rs`) -
     tetapi registry adapter-nya tetap (node, python) dan tidak ada jalur kode
     yang membaca program/runtime dari manifest. Jadi ini dilaporkan sebagai
     diabaikan dengan sebab yang nyata, bukan dihitung sebagai bukti - dan
     BUKAN "unsupported", karena protokolnya ada. Cermin dari blok yang sama di
     `ext_pkg.rs::pengaruh_paket`. */
  const dap = [
    ...daftar(cc.debuggers),
    ...daftar(cc.debugAdapters),
  ];
  if (dap.length > 0) {
    const nama = dap
      .map((d) => (d.label ?? '').trim() || (d.type ?? '').trim() || '(unnamed)')
      .join(', ');
    out.diabaikan.push(
      ki(
        'debugAdapter',
        'debuggers',
        `${jumlahNama(dap.length, '1 debug adapter', 'debug adapters')} (${nama}) - detected but not started: Zephyr's adapter registry is fixed (node, python - dap.rs) and no code path reads program/runtime from a manifest, so an adapter from a package is never launched`,
      ),
    );
  }

  return out;
}

function cariManifest(baca: Baca): { teks: string; dari: string } | undefined {
  for (const nama of [MANIFEST_NATIVE, MANIFEST_VSCODE]) {
    const teks = baca(nama);
    if (teks !== undefined) return { teks, dari: nama };
  }
  return undefined;
}

export function bacaManifest(baca: Baca): ManifestPaket | undefined {
  const f = cariManifest(baca);
  if (f === undefined) return undefined;
  try {
    const v = JSON.parse(f.teks) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    return v as ManifestPaket;
  } catch {
    return undefined;
  }
}

function namaPaket(m: ManifestPaket, id: string): string {
  return (m.name ?? '').trim() || id;
}

/** Pesan tolak paket berkode - draf dari `docs/KEPUTUSAN-MARKETPLACE-j5.md`. */
export function pesanBerkode(m: ManifestPaket, id: string, sebab: string[]): string {
  return (
    `${namaPaket(m, id)} was not installed: it contains a code extension (it runs JavaScript). ` +
    'Zephyr has no extension host yet, so this package cannot be used. ' +
    'What can be used: themes, icon themes, snippets, keymaps, and language packages.\n' +
    'What the package ships:\n' +
    sebab.map((s) => `  - ${s}`).join('\n')
  );
}

/** Pesan tolak paket tanpa satu pun kontribusi yang bisa dipakai (mirror Rust). */
export function pesanTanpaKontribusi(l: LaporanBukti, versi: string): string {
  const baris =
    l.diabaikan.length === 0
      ? '  - no contributions at all (no contributes block, no main script)'
      : l.diabaikan.map((i) => `  - ${i.label} (${i.kind}): ${i.detail}`).join('\n');
  return (
    `${TOLAK_PENANDA} nothing in this package is something Zephyr can use yet.\nWhat the package declares:\n` +
    `${baris}\nZephyr ${versi} can apply themes that carry UI colors, icon themes, snippet packs, keymaps, and language declarations. ` +
    'Nothing else in the list above is read, so installing it would have changed nothing. Nothing was written to disk - fix the package and install it again.'
  );
}

/**
 * Jalur lengkap: unduh -> hash -> tolak paket berkode -> pasang -> laporan bukti.
 * Setiap kegagalan membawa `tahap` dan `alasan`, jadi uji bisa memastikan
 * penolakan terjadi DI GERBANG yang benar, bukan sekadar "gagal".
 */
export async function alurUnduhInstal(o: OpsiPasang): Promise<HasilPasang | HasilGagal> {
  const unduh = await unduhKeSementara(o);
  if (unduh.ok !== true) return unduh;

  let paket: PaketTerbuka;
  try {
    paket = await o.bongkar(unduh.bytes);
  } catch (e) {
    return gagal('pasang', 'BONGKAR_GAGAL', `could not unpack the package: ${String(e)}`);
  }
  const baca = paket.baca;

  const m = bacaManifest(baca);
  if (m === undefined) {
    return gagal('pasang', 'MANIFEST_BURUK', `the package has neither a usable ${MANIFEST_NATIVE} nor a usable ${MANIFEST_VSCODE}`);
  }

  const sebab = pemicuKode(m, baca);
  if (sebab.length > 0) {
    return gagal('kode', 'PAKET_BERKODE', pesanBerkode(m, o.id, sebab));
  }

  const laporan = laporanBuktiPerubahan(m, baca);
  if (!laporan.didukung.length) {
    return gagal('pasang', 'TIDAK_ADA_KONTRIBUSI', pesanTanpaKontribusi(laporan, VERSI_ZEPHYR));
  }

  const hasil: HasilPasang = { ok: true, id: o.id, byte: unduh.byte, hash: unduh.hash, laporan };
  if (unduh.berkas !== undefined) hasil.berkas = unduh.berkas;
  return hasil;
}
