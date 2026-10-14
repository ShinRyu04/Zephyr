/**
 * analisGambar.ts - the image (vision) path: how a picture gets IN, and how it
 * is SHAPED for the provider.
 *
 * Why this file exists
 * --------------------
 * Everything downstream already understood images: the Rust adapters
 * (`adapters/openai.rs`, `anthropic.rs`, `gemini.rs`) turn each string in
 * `ChatMsg.images` into a content part, and `aiStore` has carried `images: string[]`
 * for a while. What was missing was a single, checked front door: nothing
 * decided WHICH formats are acceptable, HOW BIG is too big, what happens when it
 * is too big, and what a rejection is allowed to say. That decision was spread
 * across paste handlers, file pickers and drag-and-drop, each with its own
 * regex, so a `.svg` pasted in one place and a 12 MB PNG in another produced
 * two different behaviours - and both of them silent.
 *
 * The split that makes this testable
 * ----------------------------------
 * The transport contract is a DATA URL string: `data:<mime>;base64,<payload>`.
 * `split_data_url` in `src-tauri/src/adapters/mod.rs` reads exactly that, so
 * the payload never has to be re-encoded on the way out and the picture is
 * never turned into a wall of base64 TEXT (which is what "the photo did not
 * arrive" always turned out to be).
 *
 * Everything here except `adapterKanvas()` is pure: no DOM, no network, no
 * clock. Resizing is expressed as a PLANNER (`rencanaPerkecil`, pure: numbers
 * in, steps out) plus an injected `PengubahGambar` adapter, so the whole size
 * policy is exercised in node with a fake adapter - and `adapterKanvas()` is the
 * only piece that needs a real browser, which is why it is 20 lines and takes a
 * data URL it can be unit-tested around rather than raw bytes.
 *
 * Hard rules enforced here
 * ------------------------
 *  - mime is an allow-list, not a guess: png / jpeg / webp / gif;
 *  - the declared mime must MATCH the bytes (a text file renamed .png is refused);
 *  - a picture over the ceiling is shrunk, or refused with a message that names
 *    the actual size and the limit - never silently dropped;
 *  - NO log line ever contains the payload. `ringkasGambar` has no base64 field
 *    at all, and `sensorBase64` scrubs anything that might carry one.
 */

/** The four formats a vision model is actually served. Nothing else. */
export type MimeGambar = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/** Where the picture came from. Kept because it changes what we can say about it. */
export type SumberGambar = 'tempel' | 'berkas' | 'lampiran';

export type KodeTolak =
  | 'kosong'
  | 'mime_ditolak'
  | 'mime_tidak_cocok'
  | 'data_url_rusak'
  | 'terlalu_besar'
  | 'terlalu_banyak';

export type HasilGambar<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeTolak; pesan: string };

/** A checked picture, ready to be put in a request. */
export interface GambarSiap {
  mime: MimeGambar;
  /** Decoded size in bytes (not the base64 length). */
  byte: number;
  /** Payload only, no `data:` prefix. */
  base64: string;
  /** The transport form the Rust adapters split. */
  dataUrl: string;
  sumber: SumberGambar;
  /** File name for the file/attachment paths. Never a full path. */
  nama?: string;
  lebar?: number;
  tinggi?: number;
}

/** Whatever a paste / picker / attachment hands us, before any checks. */
export interface KandidatGambar {
  sumber: SumberGambar;
  /** Preferred: the whole `data:<mime>;base64,<payload>` string. */
  dataUrl?: string;
  /** Or the two halves separately. */
  mime?: string;
  base64?: string;
  nama?: string;
  /**
   * Dimensions, when the caller already decoded them (an `<img>` or the Tauri
   * image reader knows them). Optional, and only used to compute the scale
   * step: a picture with unknown dimensions is never assumed to be small.
   */
  lebar?: number;
  tinggi?: number;
}

/** The loggable face of a picture: metadata only, by construction. */
export interface RingkasGambar {
  mime: MimeGambar;
  byte: number;
  sumber: SumberGambar;
  nama?: string;
  lebar?: number;
  tinggi?: number;
}

export const MIME_DIIZINKAN: readonly MimeGambar[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/**
 * Ceiling per picture: 3.5 MB decoded (3_500_000 bytes).
 *
 * The same number `aiStore.IMAGE_MAX_BYTES` already refuses on, kept equal on
 * purpose: two different ceilings in one app is how a picture passes the panel
 * and then gets dropped by the store. Guidelines for the common providers sit
 * near this without being a hard protocol limit - the reason it is not higher
 * is that base64 inflates by ~33%, so 3.5 MB of file is ~4.7 MB of body, and
 * that is already the largest single request this app wants to serialise.
 */
export const ANALIS_MAKS_BYTE = 3_500_000;

/** Pictures per message: 10 (same as `aiStore.MAX_IMAGES`). */
export const ANALIS_MAKS_GAMBAR = 10;

/** Longest side after downscaling, in pixels (same target `clipboard.ts` uses). */
export const ANALIS_SISI_MAKS = 1600;

/**
 * Quality ladder. Index i is attempt i; the scale factors are multiplied by the
 * initial scale (never above 1), so a small picture is never upscaled.
 *
 * Four attempts because the reduction sources are different: attempt 1-2 buy
 * bytes from the encoder alone (cheap, no visible loss at 1600px), attempt 3-4
 * shrink the pixel grid. Stopping before the grid steps is how a picture ends
 * up refused while still looking like it would obviously fit.
 */
export const KUALITAS_TANGGA: readonly number[] = [0.85, 0.7, 0.7, 0.6];
export const SKALA_TANGGA: readonly number[] = [1, 1, 0.6, 0.35];

/** One resize attempt. */
export interface LangkahPerkecil {
  skala: number;
  kualitas: number;
}

export interface HasilUbah {
  dataUrl: string;
  lebar?: number;
  tinggi?: number;
}

/** The only impure dependency of the resize path; injected so tests stay offline. */
export interface PengubahGambar {
  ubah(dataUrl: string, langkah: LangkahPerkecil): Promise<HasilUbah>;
}

export interface OpsiBatas {
  maksByte?: number;
  sisiMaks?: number;
}

interface Batas {
  maksByte: number;
  sisiMaks: number;
}

function batasDari(opsi?: OpsiBatas): Batas {
  return {
    maksByte: opsi?.maksByte ?? ANALIS_MAKS_BYTE,
    sisiMaks: opsi?.sisiMaks ?? ANALIS_SISI_MAKS,
  };
}

const tolak = (kode: KodeTolak, pesan: string): HasilGambar<never> => ({ ok: false, kode, pesan });

/* ------------------------------------------------------------------ *
 * mime
 * ------------------------------------------------------------------ */

/** `image/jpg`, `image/x-png`, `IMAGE/PNG`, `image/jpeg; charset=x` -> canonical. */
export function normalisasiMime(mime: string): string {
  const dasar = String(mime ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (dasar === 'image/jpg' || dasar === 'image/pjpeg') return 'image/jpeg';
  if (dasar === 'image/x-png') return 'image/png';
  return dasar;
}

export function mimeDiizinkan(mime: string): mime is MimeGambar {
  return (MIME_DIIZINKAN as readonly string[]).includes(normalisasiMime(mime));
}

/**
 * Extension -> mime, for the attachment path where a path is all we get.
 * Deliberately NOT a general lookup: `.svg` and `.bmp` are left out so the
 * allow-list check refuses them with its own message instead of this function
 * inventing a capability the providers do not have.
 */
export function mimeDariNama(nama: string): MimeGambar | null {
  const bersih = String(nama ?? '')
    .trim()
    .toLowerCase()
    .split('#')[0]
    .split('?')[0];
  if (bersih.endsWith('.png')) return 'image/png';
  if (bersih.endsWith('.jpg') || bersih.endsWith('.jpeg')) return 'image/jpeg';
  if (bersih.endsWith('.webp')) return 'image/webp';
  if (bersih.endsWith('.gif')) return 'image/gif';
  return null;
}

/* ------------------------------------------------------------------ *
 * bytes and base64
 * ------------------------------------------------------------------ */

/** Decoded byte count of a base64 payload, padding optional, whitespace ignored. */
export function hitungByteBase64(b64: string): number {
  const tanpaSpasi = String(b64 ?? '').replace(/\s+/g, '');
  const tanpaPad = tanpaSpasi.replace(/=+$/, '');
  return Math.floor((tanpaPad.length * 3) / 4);
}

/** True when the payload is base64 and nothing else. */
function payloadSah(b64: string): boolean {
  const bersih = String(b64 ?? '').replace(/\s+/g, '');
  if (bersih.length === 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(bersih);
}

/*
 * Cheap fast-path prefixes, each one the base64 of a WHOLE number of leading
 * bytes of the format's signature:
 *
 *   PNG  89 50 4E 47 0D 0A   -> 'iVBORw0K'  (6 of the 8 signature bytes)
 *   JPEG FF D8 FF            -> '/9j'       (3 bytes)
 *   GIF  "GIF"               -> 'R0lG'      (3 bytes)
 *
 * Whole bytes only, because base64 packs 6 bits per character: one more
 * character would reach into the byte AFTER the magic, and that byte differs
 * between files (a PNG's 7th byte is 0x1A but its 9th is the chunk length, a
 * GIF's 4th is the version digit). Such a prefix refuses valid pictures - the
 * exact bug `F4`/`F5` in `scripts/uji-analis-gambar.mjs` pin down.
 *
 * The full 8-byte PNG signature is still required, by shape: a false positive
 * would take 6 matching signature bytes, which is not a thing that happens.
 *
 * This exists because a DECLARED mime is worth nothing on its own: a text file
 * renamed `.png` reaches the provider as `image/png` and comes back as either a
 * provider error or - worse - a confidently wrong description of nothing.
 */
const AWALAN: readonly (readonly [string, MimeGambar])[] = [
  ['iVBORw0K', 'image/png'],
  ['/9j', 'image/jpeg'],
  ['R0lG', 'image/gif'],
];

function byteKe(b64: string, mulai: number, jumlah: number): string | null {
  try {
    const biner = atob(b64);
    if (biner.length < mulai + jumlah) return null;
    return biner.slice(mulai, mulai + jumlah);
  } catch {
    return null;
  }
}

/** What the BYTES say this is, or null when they say nothing recognisable. */
export function tebakMimeDariBase64(b64: string): MimeGambar | null {
  const bersih = String(b64 ?? '').replace(/\s+/g, '');
  for (const [awal, mime] of AWALAN) {
    if (bersih.startsWith(awal)) return mime;
  }
  /* WebP is RIFF<4 size bytes>WEBP, so the magic is not a contiguous prefix. */
  if (bersih.startsWith('UklG') && byteKe(bersih, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/* ------------------------------------------------------------------ *
 * data URL
 * ------------------------------------------------------------------ */

export function bangunDataUrl(mime: MimeGambar, base64: string): string {
  return `data:${mime};base64,${base64.replace(/\s+/g, '')}`;
}

/**
 * Strict `data:` reader. Refuses anything without `;base64` (a plain-URL form
 * would be sent as text, which is the failure this whole file exists to stop),
 * anything whose payload is not base64, and anything with an empty payload.
 */
export function uraiDataUrl(dataUrl: string): HasilGambar<{ mime: string; base64: string }> {
  const teks = String(dataUrl ?? '');
  if (!teks) return tolak('kosong', 'No image data was handed over.');
  const m = /^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+)((?:;[A-Za-z0-9.+-]+)*),(.*)$/s.exec(teks);
  if (!m) {
    return tolak(
      'data_url_rusak',
      'Image data is not a data: URL. Expected "data:image/png;base64,...".',
    );
  }
  const mime = normalisasiMime(m[1]);
  const meta = m[2] ?? '';
  const payload = (m[3] ?? '').replace(/\s+/g, '');
  if (!/;base64$/i.test(meta) && !/;base64;/i.test(`${meta};`)) {
    return tolak(
      'data_url_rusak',
      `Image data URL for ${mime} is not base64-encoded, so it cannot be sent as a picture.`,
    );
  }
  if (payload.length === 0) return tolak('kosong', 'Image data URL is empty.');
  if (!payloadSah(payload)) {
    return tolak(
      'data_url_rusak',
      `Image payload is not valid base64 (${payload.length} chars).`,
    );
  }
  return { ok: true, nilai: { mime, base64: payload } };
}

/* ------------------------------------------------------------------ *
 * the front door
 * ------------------------------------------------------------------ */

function pesanMimeDitolak(mime: string): string {
  return `Image format "${mime || 'unknown'}" is not supported. Allowed: ${MIME_DIIZINKAN.join(', ')} (max ${fmtByte(ANALIS_MAKS_BYTE)} each).`;
}

function pesanTerlaluBesar(byte: number, maksByte: number, bisaDiperkecil: boolean): string {
  const sisa = bisaDiperkecil
    ? ' Zeph will try to shrink it first.'
    : ' A GIF cannot be resized without destroying the animation, so it must be replaced with a smaller GIF or a still image.';
  return `Image is ${pemisah(byte)} bytes (${fmtByte(byte)}), over the ${pemisah(maksByte)}-byte limit (${fmtByte(maksByte)}).${sisa}`;
}

/** Human byte string with a dot thousands separator, matching the panel's copy. */
export function fmtByte(byte: number): string {
  if (!Number.isFinite(byte)) return 'unlimited';
  const mb = byte / 1_000_000;
  if (byte >= 1_000_000) return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`;
  if (byte >= 1_000) return `${Math.round(byte / 1000)} KB`;
  return `${byte} B`;
}

/**
 * Exact byte count with a dot separator: 3500001 -> "3.500.001". Written by hand
 * because `toLocaleString()` follows the machine's locale, and a refusal message
 * that reads differently depending on the user's system locale - or that hides
 * whether the picture is 1 byte or 1 MB over the line - is a refusal the user
 * cannot act on. Doubles as the separator used in the copy beside it.
 */
export function pemisah(angka: number): string {
  const s = String(Math.trunc(Math.abs(angka)));
  let keluar = '';
  for (let i = 0; i < s.length; i++) {
    const dariKanan = s.length - i;
    if (i > 0 && dariKanan % 3 === 0) keluar += '.';
    keluar += s[i];
  }
  return angka < 0 ? `-${keluar}` : keluar;
}

/** Can this format be re-encoded smaller? Animated GIF cannot, so it cannot. */
export function bisaDiperkecil(mime: MimeGambar): boolean {
  return mime !== 'image/gif';
}

/**
 * Check one candidate WITHOUT the size ceiling. Used internally by the resize
 * path: it needs a validated picture to hand to the adapter even though that
 * picture is, by definition, still too big.
 */
function siapkanTanpaBatas(k: KandidatGambar): HasilGambar<GambarSiap> {
  let mimeMentah: string;
  let payload: string;

  if (k.dataUrl) {
    const urai = uraiDataUrl(k.dataUrl);
    if (!urai.ok) return urai;
    mimeMentah = urai.nilai.mime;
    payload = urai.nilai.base64;
  } else if (k.base64) {
    const dariNama = k.nama ? mimeDariNama(k.nama) : null;
    mimeMentah = normalisasiMime(k.mime ?? dariNama ?? '');
    payload = String(k.base64).replace(/\s+/g, '');
    if (!payloadSah(payload)) {
      return tolak(
        'data_url_rusak',
        `Image payload (${payload.length} chars) is not valid base64.`,
      );
    }
  } else {
    return tolak('kosong', 'No image data was handed over.');
  }

  if (!mimeDiizinkan(mimeMentah)) return tolak('mime_ditolak', pesanMimeDitolak(mimeMentah));
  const mime = mimeMentah;

  const tebak = tebakMimeDariBase64(payload);
  if (tebak === null) {
    return tolak(
      'mime_tidak_cocok',
      `Declared as ${mime}, but the bytes are not a recognised image (png, jpeg, webp or gif). The file may be misnamed or empty.`,
    );
  }
  if (tebak !== mime) {
    return tolak(
      'mime_tidak_cocok',
      `Declared as ${mime}, but the bytes are ${tebak}. Rename or re-export the file, or attach it as ${tebak}.`,
    );
  }

  return {
    ok: true,
    nilai: {
      mime,
      byte: hitungByteBase64(payload),
      base64: payload,
      dataUrl: bangunDataUrl(mime, payload),
      sumber: k.sumber,
      nama: k.nama,
      lebar: k.lebar,
      tinggi: k.tinggi,
    },
  };
}

/**
 * The one checked path from raw candidate to sendable picture. Mirrors
 * `aiStore.IMAGE_MAX_BYTES` and refuses with a message that names the numbers.
 */
export function siapkanGambar(k: KandidatGambar, opsi?: OpsiBatas): HasilGambar<GambarSiap> {
  const batas = batasDari(opsi);
  const dasar = siapkanTanpaBatas(k);
  if (!dasar.ok) return dasar;
  if (dasar.nilai.byte > batas.maksByte) {
    return tolak(
      'terlalu_besar',
      pesanTerlaluBesar(dasar.nilai.byte, batas.maksByte, bisaDiperkecil(dasar.nilai.mime)),
    );
  }
  return dasar;
}

/* ---- the three entry paths, each named so the caller reads as documentation ---- */

/** Clipboard paste: the clipboard gives us a PNG data URL as-is. */
export function gambarDariTempel(dataUrl: string, opsi?: OpsiBatas): HasilGambar<GambarSiap> {
  return siapkanGambar({ sumber: 'tempel', dataUrl }, opsi);
}

/** File picker / drag-and-drop: bytes come base64-encoded with a file name. */
export function gambarDariBerkas(
  berkas: { nama: string; mime?: string; base64: string },
  opsi?: OpsiBatas,
): HasilGambar<GambarSiap> {
  return siapkanGambar(
    { sumber: 'berkas', nama: berkas.nama, mime: berkas.mime, base64: berkas.base64 },
    opsi,
  );
}

/**
 * Attachment (`@path` in the prompt box, or an image dropped on a document):
 * the path gives us the name, the reader gives us the data URL.
 */
export function gambarDariLampiran(
  lampiran: { nama: string; dataUrl: string },
  opsi?: OpsiBatas,
): HasilGambar<GambarSiap> {
  return siapkanGambar({ sumber: 'lampiran', nama: lampiran.nama, dataUrl: lampiran.dataUrl }, opsi);
}

/** Per-message picture count check. */
export function periksaJumlah(
  daftar: readonly GambarSiap[],
  maks = ANALIS_MAKS_GAMBAR,
): HasilGambar<readonly GambarSiap[]> {
  if (daftar.length > maks) {
    return tolak(
      'terlalu_banyak',
      `${daftar.length} images attached, the limit is ${maks} per message. Remove ${daftar.length - maks}.`,
    );
  }
  return { ok: true, nilai: daftar };
}

/* ------------------------------------------------------------------ *
 * size policy: pure planner + injected adapter
 * ------------------------------------------------------------------ */

export interface MasukanRencana {
  mime: MimeGambar;
  byte: number;
  lebar?: number;
  tinggi?: number;
}

export interface Rencana {
  aksi: 'tanpa' | 'kecilkan' | 'tolak';
  /** Steps to try, in order, when `aksi === 'kecilkan'`. */
  langkah: LangkahPerkecil[];
  /** Set when `aksi === 'tolak'`. */
  kode?: KodeTolak;
  pesan?: string;
  /** The scale step 0 uses, before the ladder factors. 1 means "no downscale". */
  skalaAwal: number;
}

/**
 * Decide what to do, in pure numbers - no canvas, no decode, no I/O.
 * `byte` may already be over the ceiling: that is the case this exists for.
 */
export function rencanaPerkecil(masukan: MasukanRencana, opsi?: OpsiBatas): Rencana {
  const batas = batasDari(opsi);
  const { byte, mime, lebar, tinggi } = masukan;
  if (byte <= batas.maksByte) return { aksi: 'tanpa', langkah: [], skalaAwal: 1 };
  if (!bisaDiperkecil(mime)) {
    return {
      aksi: 'tolak',
      kode: 'terlalu_besar',
      pesan: pesanTerlaluBesar(byte, batas.maksByte, false),
      langkah: [],
      skalaAwal: 1,
    };
  }
  const sisi =
    lebar && tinggi && lebar > 0 && tinggi > 0 ? Math.max(lebar, tinggi) : 0;
  /* Unknown dimensions: assume the picture is already inside the side cap and
     let the encoder steps carry it. Claiming a scale we cannot compute would
     silently upscale. */
  const skalaAwal = sisi > 0 ? Math.min(1, batas.sisiMaks / sisi) : 1;
  const langkah: LangkahPerkecil[] = KUALITAS_TANGGA.map((kualitas, i) => ({
    skala: Math.max(0.05, Number((skalaAwal * (SKALA_TANGGA[i] ?? 1)).toFixed(4))),
    kualitas,
  }));
  return { aksi: 'kecilkan', langkah, skalaAwal };
}

/**
 * Run the ladder through an adapter until the result passes the same checks as
 * a fresh picture, then give up - loudly, with the best size reached.
 */
export async function perkecilGambar(
  gambar: GambarSiap,
  ubah: PengubahGambar,
  opsi?: OpsiBatas,
): Promise<HasilGambar<GambarSiap>> {
  const batas = batasDari(opsi);
  const rencana = rencanaPerkecil(
    { mime: gambar.mime, byte: gambar.byte, lebar: gambar.lebar, tinggi: gambar.tinggi },
    opsi,
  );
  if (rencana.aksi === 'tanpa') return { ok: true, nilai: gambar };
  if (rencana.aksi === 'tolak') return tolak(rencana.kode ?? 'terlalu_besar', rencana.pesan ?? '');

  let terkecil = gambar.byte;
  for (const langkah of rencana.langkah) {
    const hasil = await ubah.ubah(gambar.dataUrl, langkah);
    const cek = siapkanGambar(
      {
        sumber: gambar.sumber,
        dataUrl: hasil.dataUrl,
        nama: gambar.nama,
        lebar: hasil.lebar,
        tinggi: hasil.tinggi,
      },
      { maksByte: batas.maksByte, sisiMaks: batas.sisiMaks },
    );
    if (cek.ok) return cek;
    if (cek.kode === 'terlalu_besar') terkecil = Math.min(terkecil, hitungByteDalamDataUrl(hasil.dataUrl));
    else return cek;
  }
  return tolak(
    'terlalu_besar',
    `Image is still ${pemisah(terkecil)} bytes (${fmtByte(terkecil)}) after ${rencana.langkah.length} resize attempts (limit ${pemisah(batas.maksByte)} bytes). Crop it or lower the resolution and attach it again.`,
  );
}

function hitungByteDalamDataUrl(dataUrl: string): number {
  const urai = uraiDataUrl(dataUrl);
  return urai.ok ? hitungByteBase64(urai.nilai.base64) : Number.POSITIVE_INFINITY;
}

/**
 * The full path a paste/pick/attach takes: validate, and only shrink when the
 * picture is too big and an adapter is available. Without an adapter the
 * rejection is the honest answer rather than a silent drop.
 */
export async function terimaGambar(
  k: KandidatGambar,
  ubah?: PengubahGambar | null,
  opsi?: OpsiBatas,
): Promise<HasilGambar<GambarSiap>> {
  const awal = siapkanGambar(k, opsi);
  if (awal.ok) return awal;
  if (awal.kode !== 'terlalu_besar' || !ubah) return awal;

  const mentah = siapkanTanpaBatas(k);
  if (!mentah.ok) return mentah;
  const dikecilkan = await perkecilGambar(mentah.nilai, ubah, opsi);
  if (!dikecilkan.ok) return dikecilkan;
  return {
    ok: true,
    nilai: { ...dikecilkan.nilai, sumber: k.sumber, nama: k.nama ?? dikecilkan.nilai.nama },
  };
}

/* ------------------------------------------------------------------ *
 * log safety
 * ------------------------------------------------------------------ */

/** Metadata only. There is no base64 field here, so no call site can leak one. */
export function ringkasGambar(g: GambarSiap): RingkasGambar {
  const r: RingkasGambar = { mime: g.mime, byte: g.byte, sumber: g.sumber };
  if (g.nama) r.nama = g.nama;
  if (g.lebar !== undefined) r.lebar = g.lebar;
  if (g.tinggi !== undefined) r.tinggi = g.tinggi;
  return r;
}

/** One log line about a picture: mime, size, source. Never the picture. */
export function barisLog(g: GambarSiap): string {
  const nama = g.nama ? ` "${g.nama}"` : '';
  const dim = g.lebar && g.tinggi ? ` ${g.lebar}x${g.tinggi}` : '';
  return `image ${g.mime}${dim} ${fmtByte(g.byte)} from ${g.sumber}${nama}`;
}

/**
 * Scrub anything that looks like a payload before it reaches a log, an error
 * toast or a bug report. A base64 run of 32+ characters is never prose; it is
 * either a picture or a secret, and both belong in neither place.
 */
export function sensorBase64(teks: string): string {
  return String(teks ?? '').replace(/[A-Za-z0-9+/]{32,}={0,2}/g, '<gambar-disenyapkan>');
}

/* ------------------------------------------------------------------ *
 * provider shapes
 * ------------------------------------------------------------------ */

export interface BagianOpenAI {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface BlokAnthropic {
  type: 'image';
  source: { type: 'base64'; media_type: MimeGambar; data: string };
}

export interface PartGemini {
  inline_data: { mime_type: MimeGambar; data: string };
}

/**
 * OpenAI-compatible content parts, in the order `adapters/openai.rs` emits them:
 * the text part first, then one `image_url` per picture, carrying the data URL.
 */
export function kontenOpenAI(teks: string, gambar: readonly GambarSiap[]): BagianOpenAI[] {
  const bagian: BagianOpenAI[] = [{ type: 'text', text: teks }];
  for (const g of gambar) bagian.push({ type: 'image_url', image_url: { url: g.dataUrl } });
  return bagian;
}

/** Anthropic base64 image block, byte-for-byte the shape `adapters/anthropic.rs` builds. */
export function blokAnthropic(g: GambarSiap): BlokAnthropic {
  return { type: 'image', source: { type: 'base64', media_type: g.mime, data: g.base64 } };
}

/** Gemini inline part, matching `adapters/gemini.rs`. */
export function partGemini(g: GambarSiap): PartGemini {
  return { inline_data: { mime_type: g.mime, data: g.base64 } };
}

/** The `images` field the frontend puts on the message: data URLs, in order. */
export function daftarDataUrl(gambar: readonly GambarSiap[]): string[] {
  return gambar.map((g) => g.dataUrl);
}

/* ------------------------------------------------------------------ *
 * the one impure piece
 * ------------------------------------------------------------------ */

/**
 * Canvas-backed adapter: the real resizer, ~20 lines on purpose.
 *
 * Not exercised by `scripts/uji-analis-gambar.mjs` (no DOM in node), which is
 * exactly why the policy above lives in the planner instead: this function only
 * has to draw a rectangle and re-encode it. PNG stays PNG (a re-encode to JPEG
 * would flatten transparency), everything else goes to JPEG, whose encoder is
 * the one that actually honours the quality number.
 */
export function adapterKanvas(): PengubahGambar {
  return {
    ubah: async (dataUrl, langkah) => {
      const img = await muatGambar(dataUrl);
      const w = Math.max(1, Math.round(img.naturalWidth * langkah.skala));
      const h = Math.max(1, Math.round(img.naturalHeight * langkah.skala));
      const kanvas = document.createElement('canvas');
      kanvas.width = w;
      kanvas.height = h;
      const ctx = kanvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context is unavailable');
      ctx.drawImage(img, 0, 0, w, h);
      const keluar: MimeGambar = /^data:image\/png/i.test(img.src) ? 'image/png' : 'image/jpeg';
      return { dataUrl: kanvas.toDataURL(keluar, langkah.kualitas), lebar: w, tinggi: h };
    },
  };
}

function muatGambar(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image could not be decoded'));
    img.src = dataUrl;
  });
}
