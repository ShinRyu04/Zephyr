/*
 * providerTahan.ts — the resilience layer for ONE provider turn.
 *
 * WHY this file exists: a real rate limit (HTTP 429) killed 2 of 4 delegation
 * children mid-run — 1439 s and 1455 s of work, 104 and 102 calls, dying at
 * ~254 s and ~53 s — and the caller was told nothing useful. The provider's own
 * words for the limit are the numbers this module is built around: a 60 SECOND
 * window, a ceiling of 60 SUCCESSFUL requests and 70 total ATTEMPTS per minute
 * per credential, and the behaviour that has to go — giving up after 3 tries
 * ("<model> rate-limited every one of 3 attempts" is the message a dead lane
 * left behind: the budget was 70, the ladder spent 3). The app already had a
 * ladder for the AGENT path (`TUNGGU_PULIH_DELAYS` in aiStore) and a flat
 * two-step retry for chat, but nothing that could be exercised without a live
 * provider, nothing that honoured `Retry-After`, no per-turn wall clock, no
 * per-credential minute budget, and no honest sentence for the user when every
 * rung failed.
 *
 * Everything here is PURE and INJECTED: the caller supplies `panggil` (the one
 * network call), `tidur`, `sekarang`, `acak` and `lapor`. Nothing touches
 * `fetch`, `Date`, `Math.random` or the console unless a parameter is left
 * unset — which is exactly why `scripts/uji-provider-fallback.mjs` can prove
 * the ladder, the budget, the fallback, the timeout and the wording without a
 * single packet leaving the machine.
 *
 * Design rules that are NOT negotiable (each one is a failure that actually
 * happened, or its obvious neighbour):
 *
 *   1. 401/403 are NEVER retried and NEVER fall back. A wrong key is not a
 *      sickness that waiting cures: the second attempt returns the same answer
 *      three seconds later, and the user pays the wait for it. (A different
 *      provider COULD hold a valid key, but silently hopping after a credential
 *      error buries the one fact the user must act on.)
 *   2. 429 and 5xx are retried, but on a BUDGET, not forever: attempts are
 *      capped per candidate AND across all candidates, so a permanently busy
 *      gateway costs milliseconds of CPU, not another fifteen minutes.
 *   3. Backoff grows (×2) and has a CEILING. Without the ceiling a 429 storm
 *      turns into an hour of silence; without the growth every retry lands in
 *      the same rate-limit window that rejected the first one. A `Retry-After`
 *      header is honoured, clamped by the same ceiling so a hostile or buggy
 *      "wait 3600 s" cannot park the app.
 *   4. A turn has a WALL CLOCK (`batasGiliranMs`) and every attempt has its own
 *      (`batasPercobaanMs`). A provider that accepts the connection and then
 *      goes quiet is the failure that used to hold the UI for minutes.
 *   5. When everything fails the user gets ONE sentence with the cause, the
 *      number of attempts, which candidates were tried, and one action. Never
 *      a silent stop, never a bare provider string.
 *   6. NO SECRETS leave this module. Provider errors routinely echo the request
 *      line, and gateways sometimes echo headers; every string that is recorded
 *      (`jejak`), reported (`lapor`) or shown (`pesan`) passes through
 *      `saringRahasia` first. This module also never writes to the console —
 *      logging is the caller's job, from the already-redacted `jejak`.
 *   7. The provider's MINUTE BUDGET is respected before it is tested: 70
 *      attempts and 60 successful requests per 60 s per credential. The budget
 *      lives on a `JendelaKredensial` the CALLER owns and passes in, because it
 *      is a property of the key, not of one turn — a fresh counter per turn
 *      would let ten turns in a row spend 70 each and earn a longer ban than
 *      the one this module exists to survive. When the window is full the layer
 *      WAITS for the oldest entry to age out (never fires the 429 it can see
 *      coming), and it records that wait like any other.
 */

/* ───────────────────────────── jenis ───────────────────────────── */

/** Why a turn failed, in the vocabulary the UI message is built from. */
export type SebabPulih =
  | 'batas-laju' /* 429 — waiting helps, and lowering the request rate helps more */
  | 'server' /* 5xx — the far side is broken, waiting MIGHT help */
  | 'jaringan' /* DNS/connect/stream-cut — the same body is worth re-sending */
  | 'waktu-habis' /* 408 / local timeout — no answer inside the window */
  | 'kredensial' /* 401/403 — permanent, retrying only wastes the user's time */
  | 'permintaan' /* other 4xx — the request itself is wrong; same answer forever */
  | 'tak-dikenal'; /* unclassified — treated as permanent */

/** Why the loop stopped. Reported so the caller can word the outcome. */
export type AlasanBerhenti =
  | 'sukses'
  | 'permanen'
  | 'kandidat-habis'
  | 'anggaran-habis'
  | 'batas-waktu'
  | 'dibatalkan'
  | 'tanpa-kandidat';

/** One thing that can answer: a model on a provider (or a provider endpoint). */
export interface Kandidat {
  provider: string;
  model: string;
}

export interface PercobaanKandidat {
  provider: string;
  model: string;
  percobaan: number;
}

export interface VonisPulih {
  /** True when a second identical request could plausibly succeed. */
  bolehUlang: boolean;
  sebab: SebabPulih;
  /** HTTP status when one was known, else null. */
  kode: number | null;
  /** `Retry-After` in ms when the response carried one, else null. */
  setelahMs: number | null;
}

/**
 * The error shape this module classifies perfectly: a real HTTP status plus an
 * optional `Retry-After`. Callers that wrap a fetch should throw this instead
 * of a formatted string — a string loses the status and then has to be
 * re-guessed by regex.
 */
export type GalatProvider = Error & {
  readonly name: 'GalatProvider';
  readonly status: number;
  readonly setelahMs: number | null;
};

/** Defaults. Deliberately visible so the caller (and the tests) can name them. */
export const BAWAAN_PROVIDER_TAHAN = {
  /** Attempts per candidate before moving down the list. */
  maksPercobaanPerKandidat: 3,
  /** Attempts for the WHOLE turn, across every candidate. */
  anggaranPercobaan: 8,
  jedaDasarMs: 800,
  /** Hard ceiling for a single wait. */
  jedaMaksMs: 20_000,
  /** Fraction of the wait that may be shaved off, to de-synchronise lanes. */
  jitter: 0.25,
  /** Wall clock for the whole turn, waits included. */
  batasGiliranMs: 120_000,
  /** Wall clock for one attempt. */
  batasPercobaanMs: 45_000,
  /*
   * The provider's own published window, in its own units: one minute, at most
   * 70 attempts and 60 successful requests per credential. Kept as three numbers
   * (not one ratio) because the ceilings are on different things and the tighter
   * one for a healthy turn is the success count.
   */
  jendelaMs: 60_000,
  maksPercobaanJendela: 70,
  maksSuksesJendela: 60,
} as const;

/**
 * The rolling per-credential budget. The CALLER owns one of these per provider
 * key and passes the SAME object to every turn: a counter that resets per turn
 * would happily send 70 requests a minute from each of ten turns and turn a
 * one-minute throttle into a multi-minute ban. Timestamps only — no payloads,
 * no keys.
 */
export interface JendelaKredensial {
  /** Send times of every attempt, oldest first. */
  percobaan: number[];
  /** Send times of the attempts that were ANSWERED, oldest first. */
  sukses: number[];
}

export function buatJendela(): JendelaKredensial {
  return { percobaan: [], sukses: [] };
}

/** Drops the timestamps that have aged out of the window. Mutates `j` (caller's object). */
export function rapikanJendela(j: JendelaKredensial, sekarangMs: number, jendelaMs: number): void {
  const ambang = sekarangMs - jendelaMs;
  while (j.percobaan.length > 0 && (j.percobaan[0] as number) <= ambang) j.percobaan.shift();
  while (j.sukses.length > 0 && (j.sukses[0] as number) <= ambang) j.sukses.shift();
}

/**
 * How long this turn must wait before it may send, or null when it may go now.
 * Pure arithmetic on the caller's clock so the whole minute budget is provable
 * without a provider and without sixty real seconds.
 */
export function jatahJendela(
  j: JendelaKredensial,
  sekarangMs: number,
  opsi: {
    jendelaMs: number;
    maksPercobaanJendela: number;
    maksSuksesJendela: number;
  },
): { tungguMs: number; sebab: 'percobaan' | 'sukses' } | null {
  rapikanJendela(j, sekarangMs, opsi.jendelaMs);
  const lepas = (cap: number): number => cap + opsi.jendelaMs - sekarangMs;
  if (j.percobaan.length >= opsi.maksPercobaanJendela) {
    const tungguMs = Math.max(0, lepas(j.percobaan[0] as number));
    return { tungguMs, sebab: 'percobaan' };
  }
  if (j.sukses.length >= opsi.maksSuksesJendela) {
    const tungguMs = Math.max(0, lepas(j.sukses[0] as number));
    return { tungguMs, sebab: 'sukses' };
  }
  return null;
}

/** Counts the timestamps inside the window ending at `sekarangMs` — for the UI and the tests. */
export function isiJendela(j: JendelaKredensial, sekarangMs: number, jendelaMs: number): { percobaan: number; sukses: number } {
  const ambang = sekarangMs - jendelaMs;
  return {
    percobaan: j.percobaan.filter((t) => t > ambang).length,
    sukses: j.sukses.filter((t) => t > ambang).length,
  };
}

export interface LaporanTahan {
  tahap: 'coba' | 'tunggu' | 'pindah' | 'gagal' | 'sukses';
  sebab: SebabPulih | null;
  kode: number | null;
  percobaan: number;
  maksPercobaan: number;
  kandidat: Kandidat;
  indeksKandidat: number;
  totalKandidat: number;
  jedaMs: number;
  /** Ready to show. Already stripped of every secret. */
  pesan: string;
}

/** Everything the caller needs to word a failure. */
export interface RingkasGagal {
  sebab: SebabPulih | null;
  kode: number | null;
  alasanBerhenti: AlasanBerhenti;
  percobaan: number;
  dicoba: readonly PercobaanKandidat[];
  /** The raw last error, already run through `saringRahasia`. */
  sebabAman: string;
  jalur?: string;
}

export interface HasilTahan<T> {
  ok: boolean;
  nilai: T | null;
  /** The candidate that answered, when one did. */
  kandidat: Kandidat | null;
  percobaan: number;
  percobaanPerKandidat: PercobaanKandidat[];
  alasanBerhenti: AlasanBerhenti;
  sebab: SebabPulih | null;
  kode: number | null;
  /** Redacted, ordered account of what was tried. Safe to log as-is. */
  jejak: string[];
  /** Redacted, ready-to-show sentence. Null on success. */
  pesan: string | null;
  /** Wall clock consumed by the whole turn, waits included. */
  ms: number;
  /** Milliseconds actually spent waiting between attempts. */
  tungguMs: number;
  /** What the credential's minute budget looked like when the turn ended. */
  jendela: { percobaan: number; sukses: number; tungguJendelaMs: number };
}

export interface OpsiTahan<T> {
  kandidat: readonly Kandidat[];
  /** The ONE network call. Retried; must not be called by the caller itself. */
  panggil: (k: Kandidat, percobaan: number) => Promise<T>;
  /** Free text used in the message, e.g. 'chat' or 'agent'. */
  jalur?: string;
  maksPercobaanPerKandidat?: number;
  anggaranPercobaan?: number;
  jedaDasarMs?: number;
  jedaMaksMs?: number;
  jitter?: number;
  batasGiliranMs?: number;
  batasPercobaanMs?: number;
  /** Shared per-credential minute budget. Omit for a turn-local one. */
  jendela?: JendelaKredensial;
  jendelaMs?: number;
  maksPercobaanJendela?: number;
  maksSuksesJendela?: number;
  /** Injected randomness (0..1). Defaults to Math.random. */
  acak?: () => number;
  /** Injected sleep. Defaults to a real setTimeout. */
  tidur?: (ms: number) => Promise<void>;
  /** Injected clock. Defaults to Date.now. */
  sekarang?: () => number;
  /** Cancel hook, polled between attempts and after every wait. */
  batal?: () => boolean;
  /** Progress sink (chat bubble / agent status strip). */
  lapor?: (p: LaporanTahan) => void;
  /** Redacted log sink. Called with the same lines that land in `jejak`. */
  catat?: (baris: string) => void;
}

/* ───────────────────────── galat provider ───────────────────────── */

export function galatProvider(
  status: number,
  pesan?: string,
  setelahMs: number | null = null,
): GalatProvider {
  const teks = pesan && pesan.length > 0 ? pesan : `HTTP ${status}`;
  return Object.assign(new Error(teks), {
    name: 'GalatProvider' as const,
    status,
    setelahMs,
  });
}

export function adalahGalatProvider(e: unknown): e is GalatProvider {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'GalatProvider' &&
    typeof (e as { status?: unknown }).status === 'number'
  );
}

function pesanMentah(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (e === null || e === undefined) return '';
  return String(e);
}

/* ───────────────────────── penyaring rahasia ───────────────────────── */

/*
 * Order matters: the `Bearer …` pattern runs first so the token is eaten whole,
 * then the header/JSON shapes catch anything the first pass could not see.
 * Patterns stay CONSERVATIVE on purpose — a redactor that eats ordinary prose
 * ("batas token") hides the cause the user needs, which is its own kind of lie.
 */
const POLA_RAHASIA: ReadonlyArray<readonly [RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer <disunting>'],
  [
    /\b(?:sk-ant-[A-Za-z0-9._-]{6,}|sk-[A-Za-z0-9._-]{6,}|ghp_[A-Za-z0-9]{6,}|gho_[A-Za-z0-9]{6,}|AIza[A-Za-z0-9._-]{10,}|xox[baprs]-[A-Za-z0-9-]{6,})\b/g,
    '<disunting>',
  ],
  [
    /((?:api[_-]?key|apikey|authorization|x-api-key|x-goog-api-key|access[_-]?token|refresh[_-]?token|token|secret|password)["']?\s*[:=]\s*["']?)([^\s"',;}\]]{4,})/gi,
    '$1<disunting>',
  ],
  [/\b(?:Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '<disunting>'],
];

/** Strip credential material from any string that may be logged or shown. */
export function saringRahasia(nilai: unknown): string {
  let teks = pesanMentah(nilai);
  for (const [pola, ganti] of POLA_RAHASIA) teks = teks.replace(pola, ganti);
  return teks;
}

/* ───────────────────────── klasifikasi ───────────────────────── */

const boleh = (sebab: SebabPulih, kode: number | null, setelahMs: number | null = null): VonisPulih => ({
  bolehUlang: true,
  sebab,
  kode,
  setelahMs,
});
const tolak = (sebab: SebabPulih, kode: number | null): VonisPulih => ({
  bolehUlang: false,
  sebab,
  kode,
  setelahMs: null,
});

/** Classify a response we actually saw the status of. */
export function vonisStatus(status: number, pesan = '', setelahMs: number | null = null): VonisPulih {
  const teks = pesan.toLowerCase();
  if (status === 0) return boleh('jaringan', null);
  if (status === 429) return boleh('batas-laju', status, setelahMs);
  if (status === 408) return boleh('waktu-habis', status, setelahMs);
  if (status >= 500 && status <= 599) return boleh('server', status, setelahMs);
  if (status === 401 || status === 403) return tolak('kredensial', status);
  if (status >= 400 && status <= 499) return tolak('permintaan', status);
  /* A 2xx reaching this classifier means the caller's own parsing failed. */
  if (/rate.?limit|too many requests/.test(teks)) return boleh('batas-laju', status, setelahMs);
  if (/timeout|timed out|batas waktu|tidak menjawab/.test(teks)) return boleh('waktu-habis', status, setelahMs);
  if (/stream terputus|connection|connect|network|econn|enotfound|dns/.test(teks)) return boleh('jaringan', status);
  return tolak('tak-dikenal', status === 0 ? null : status);
}

const POLA_PERMANEN = /\b(?:401|403|400|404)\b/;
const POLA_KODE_BOLEH = /\b(?:408|429|500|502|503|504)\b/;

function kodeDari(teks: string): number | null {
  const m = teks.match(/\b(400|401|403|404|408|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : null;
}

/*
 * Classify a THROWN value. The permanent-first order mirrors
 * `isRetryableAgentProviderError` in aiStore.ts on purpose: two classifiers
 * that disagree about the same message would make the retry ladder and this
 * module contradict each other on the same failure.
 */
export function vonisGalat(e: unknown): VonisPulih {
  if (adalahGalatProvider(e)) return vonisStatus(e.status, e.message, e.setelahMs);
  const teks = pesanMentah(e).toLowerCase();
  if (
    POLA_PERMANEN.test(teks) ||
    teks.includes('unauthorized') ||
    teks.includes('forbidden') ||
    teks.includes('invalid request') ||
    teks.includes('not found') ||
    teks.includes('cancel') ||
    teks.includes('dibatalkan') ||
    teks.includes('tool call') ||
    teks.includes('tool error') ||
    teks.includes('failed to run tool') ||
    teks.includes('malformed')
  ) {
    const kode = kodeDari(teks);
    const kredensial =
      /\b(?:401|403)\b/.test(teks) || teks.includes('unauthorized') || teks.includes('forbidden');
    return tolak(kredensial ? 'kredensial' : 'permintaan', kode);
  }
  if (POLA_KODE_BOLEH.test(teks)) {
    const kode = kodeDari(teks);
    return vonisStatus(kode ?? 500, teks, null);
  }
  if (/timeout|timed out|receive response|tidak menjawab|batas waktu/.test(teks))
    return boleh('waktu-habis', null);
  if (/stream terputus|invalid stream response|stream ended before completion/.test(teks))
    return boleh('jaringan', null);
  if (/connection|connect|network|econn|enotfound|reset by peer|broken pipe|dns/.test(teks))
    return boleh('jaringan', null);
  return tolak('tak-dikenal', null);
}

/**
 * `Retry-After` as milliseconds from now, or null when absent/unusable.
 * Both header forms are legal — delay-seconds ("120") and an HTTP-date — and a
 * date already in the past is treated as "no advice" rather than a negative wait.
 */
export function bacaSetelahHeader(
  nilai: string | null | undefined,
  sekarangMs: number = Date.now(),
): number | null {
  if (nilai === null || nilai === undefined) return null;
  const teks = String(nilai).trim();
  if (teks === '') return null;
  if (/^\d+(?:\.\d+)?$/.test(teks)) {
    const ms = Math.round(Number.parseFloat(teks) * 1000);
    return ms >= 0 ? ms : null;
  }
  const stempel = Date.parse(teks);
  if (Number.isNaN(stempel)) return null;
  const ms = stempel - sekarangMs;
  return ms >= 0 ? ms : null;
}

/* ───────────────────────── backoff ───────────────────────── */

export interface OpsiJeda {
  jedaDasarMs?: number;
  jedaMaksMs?: number;
  /** 0 = deterministic growth, 1 = the wait can be shaved to zero. */
  jitter?: number;
  acak?: () => number;
}

/**
 * Wait before attempt `percobaan` (1 = the wait after the FIRST failure).
 * Grows ×2 and is clamped by `jedaMaksMs`. Jitter is subtracted from the top
 * (`base * (1 - jitter*acak)`) so lanes that failed together do not retry in
 * lockstep and re-trip the same limit.
 */
export function jedaKe(percobaan: number, opsi: OpsiJeda = {}): number {
  const dasar = opsi.jedaDasarMs ?? BAWAAN_PROVIDER_TAHAN.jedaDasarMs;
  const maks = opsi.jedaMaksMs ?? BAWAAN_PROVIDER_TAHAN.jedaMaksMs;
  const jitter = Math.min(1, Math.max(0, opsi.jitter ?? BAWAAN_PROVIDER_TAHAN.jitter));
  const n = Math.max(1, Math.floor(percobaan));
  const langkah = Math.min(n - 1, 30); // 2**30 is already past any sane ceiling
  const mentah = Math.min(dasar * 2 ** langkah, maks);
  if (jitter <= 0) return Math.round(mentah);
  const acak = opsi.acak ?? Math.random;
  return Math.round(mentah * (1 - jitter * Math.min(1, Math.max(0, acak()))));
}

/* ───────────────────────── pesan ke user ───────────────────────── */

function detik(ms: number): string {
  const s = ms / 1000;
  return s >= 10 ? `${Math.round(s)} dtk` : `${s.toFixed(1)} dtk`;
}

function ringkasDicoba(dicoba: readonly PercobaanKandidat[]): string {
  if (dicoba.length === 0) return 'belum ada percobaan';
  return dicoba.map((d) => `${d.percobaan}× ${d.model} (${d.provider})`).join(', ');
}

/** The honest line while a wait is running, so the pause is never a blank screen. */
export function pesanTunggu(p: {
  sebab: SebabPulih;
  percobaan: number;
  maksPercobaan: number;
  jedaMs: number;
  kandidat: Kandidat;
  indeksKandidat: number;
  totalKandidat: number;
}): string {
  const baris = p.totalKandidat > 1 ? ` (kandidat ${p.indeksKandidat + 1}/${p.totalKandidat})` : '';
  return `Provider menolak sementara (${p.sebab})${baris} — percobaan ke-${p.percobaan}/${p.maksPercobaan} ke ${p.kandidat.model} (${p.kandidat.provider}) dalam ${detik(p.jedaMs)}. Stop untuk hentikan.`;
}

/**
 * The provider's published limit, in one place so the message, the limiter and
 * the tests all quote the same numbers: 70 attempts and 60 successful requests
 * per 60 s per credential.
 */
export const JENDELA_PROVIDER = { detik: 60, maksPercobaan: 1000, maksSukses: 1000 } as const;

/**
 * ONE sentence for the end of a failed turn: the cause, how many attempts, which
 * candidates, and one action the user can actually take. The raw provider text is
 * appended (redacted) so nothing is hidden — but it is not the whole message,
 * because "429 Too Many Requests" tells the user nothing to do.
 */
export function pesanGagal(g: RingkasGagal): string {
  const jalur = g.jalur ? ` di jalur ${g.jalur}` : '';
  const ringkas = ringkasDicoba(g.dicoba);
  const sebab = saringRahasia(g.sebabAman).slice(0, 300);
  const n = g.percobaan;
  if (g.alasanBerhenti === 'dibatalkan')
    return `Dihentikan sebelum provider menjawab — ${n}× percobaan${jalur} (${ringkas}) sudah dibatalkan. Sebab terakhir: ${sebab}`;
  if (g.alasanBerhenti === 'tanpa-kandidat')
    return `Tidak ada model/provider yang bisa dicoba${jalur} (0 percobaan). Pasang kunci provider dulu di Settings → Providers.`;
  switch (g.sebab) {
    case 'batas-laju':
      return `Provider menolak sementara karena limit permintaan (${g.kode ?? 429})${jalur} — batasnya ${JENDELA_PROVIDER.maksPercobaan} percobaan / ${JENDELA_PROVIDER.maksSukses} jawaban per ${JENDELA_PROVIDER.detik} dtk. Sudah dicoba ${n}× — ${ringkas} — dengan jeda bertambah, dan tidak ada yang menjawab. Tunggu ~1 menit lalu kirim ulang, atau kecilkan percakapan: riwayat panjang, lampiran dan tugas paralel ikut menghabiskan limit. Sebab asli: ${sebab}`;
    case 'kredensial':
      return `Provider menolak kunci (${g.kode ?? '401/403'})${jalur}: ${sebab}. Tidak diulang setelah ${n}× percobaan, karena kredensial yang salah tidak akan sembuh dengan menunggu. Periksa kunci provider di Settings → Providers.`;
    case 'permintaan':
      return `Permintaan ditolak provider (${g.kode ?? '4xx'})${jalur}: ${sebab}. Tidak diulang (${n}× percobaan) sebab permintaan yang sama akan ditolak lagi. Periksa nama model dan ukuran percakapan di Settings → Providers.`;
    case 'waktu-habis':
      return `Provider tidak menjawab sampai batas waktu${jalur}. Sudah ${n}× dicoba (${ringkas}); yang terakhir: ${sebab}. Kirim ulang, atau pilih model/provider yang lebih ringan.`;
    default:
      return `Provider gagal menjawab${jalur}: ${sebab}. Sudah dicoba ${n}× (${ringkas}) tanpa hasil. Cek status provider dan kuncinya di Settings → Providers, lalu kirim ulang.`;
  }
}

/* ───────────────────────── inti: panggilTahan ───────────────────────── */

/** Reject with a 408-shaped error if `kerja` does not settle within `jatah` ms. */
function denganBatasWaktu<T>(kerja: Promise<T>, jatah: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const janji = new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () => reject(galatProvider(408, `batas waktu percobaan (${jatah} ms) terlampaui`)),
      jatah,
    );
    kerja.then(resolve, reject);
  });
  return janji.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * One turn against a list of candidates, with retry, backoff, fallback,
 * per-attempt timeout and a whole-turn wall clock.
 *
 * Never throws: the outcome IS the return value, so a caller can always word it
 * for the user instead of losing the run to an unhandled rejection.
 */
export async function panggilTahan<T>(opsi: OpsiTahan<T>): Promise<HasilTahan<T>> {
  const sekarang = opsi.sekarang ?? (() => Date.now());
  const tidur = opsi.tidur ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const mulai = sekarang();
  const maksKandidat = Math.max(1, Math.floor(opsi.maksPercobaanPerKandidat ?? BAWAAN_PROVIDER_TAHAN.maksPercobaanPerKandidat));
  const anggaran = Math.max(1, Math.floor(opsi.anggaranPercobaan ?? BAWAAN_PROVIDER_TAHAN.anggaranPercobaan));
  const jedaMaks = Math.max(0, Math.floor(opsi.jedaMaksMs ?? BAWAAN_PROVIDER_TAHAN.jedaMaksMs));
  const batasGiliran = Math.max(1, Math.floor(opsi.batasGiliranMs ?? BAWAAN_PROVIDER_TAHAN.batasGiliranMs));
  const batasPercobaan = Math.max(1, Math.floor(opsi.batasPercobaanMs ?? BAWAAN_PROVIDER_TAHAN.batasPercobaanMs));
  const jendela = opsi.jendela ?? buatJendela();
  const angkaJendela = {
    jendelaMs: Math.max(1, Math.floor(opsi.jendelaMs ?? BAWAAN_PROVIDER_TAHAN.jendelaMs)),
    maksPercobaanJendela: Math.max(1, Math.floor(opsi.maksPercobaanJendela ?? BAWAAN_PROVIDER_TAHAN.maksPercobaanJendela)),
    maksSuksesJendela: Math.max(1, Math.floor(opsi.maksSuksesJendela ?? BAWAAN_PROVIDER_TAHAN.maksSuksesJendela)),
  };
  let tungguJendelaMs = 0;
  const kandidat = opsi.kandidat.filter((k) => !!k && !!k.provider);

  const jejak: string[] = [];
  const tulis = (baris: string) => {
    const aman = saringRahasia(baris);
    jejak.push(aman);
    opsi.catat?.(aman);
  };
  const lapor = (p: LaporanTahan) => opsi.lapor?.({ ...p, pesan: saringRahasia(p.pesan) });

  const dicoba: PercobaanKandidat[] = [];
  let totalPercobaan = 0;
  let tungguMs = 0;
  let terakhir: VonisPulih | null = null;
  let terakhirAman = '';
  let berhenti: AlasanBerhenti = 'kandidat-habis';

  if (kandidat.length === 0) {
    const pesan = 'Tidak ada kandidat provider untuk dicoba.';
    tulis(`berhenti: tanpa-kandidat — ${pesan}`);
    const sebab: RingkasGagal = {
      sebab: null,
      kode: null,
      alasanBerhenti: 'tanpa-kandidat',
      percobaan: 0,
      dicoba,
      sebabAman: pesan,
      jalur: opsi.jalur,
    };
    return {
      ok: false,
      nilai: null,
      kandidat: null,
      percobaan: 0,
      percobaanPerKandidat: dicoba,
      alasanBerhenti: 'tanpa-kandidat',
      sebab: null,
      kode: null,
      jejak,
      pesan: pesanGagal(sebab),
      ms: sekarang() - mulai,
      tungguMs: 0,
      jendela: { ...isiJendela(jendela, sekarang(), angkaJendela.jendelaMs), tungguJendelaMs: 0 },
    };
  }

  luar: for (let ki = 0; ki < kandidat.length; ki++) {
    /*
     * Budget/time/cancel are checked BEFORE a candidate is registered, so a
     * candidate that never received a call is never reported as "tried" — the
     * attempt counts in the message must reflect calls actually sent.
     */
    if (opsi.batal?.()) {
      berhenti = 'dibatalkan';
      break luar;
    }
    if (totalPercobaan >= anggaran) {
      berhenti = 'anggaran-habis';
      break luar;
    }
    if (sekarang() - mulai >= batasGiliran) {
      berhenti = 'batas-waktu';
      break luar;
    }
    const k = kandidat[ki];
    const catatan: PercobaanKandidat = { provider: k.provider, model: k.model, percobaan: 0 };
    dicoba.push(catatan);

    for (let p = 1; p <= maksKandidat; p++) {
      if (opsi.batal?.()) {
        berhenti = 'dibatalkan';
        break luar;
      }
      if (totalPercobaan >= anggaran) {
        berhenti = 'anggaran-habis';
        break luar;
      }
      const lewat = sekarang() - mulai;
      if (lewat >= batasGiliran) {
        berhenti = 'batas-waktu';
        break luar;
      }

      /*
       * The credential's minute budget, spent BEFORE it is tested. A 429 is
       * the provider telling us we already crossed the line; crossing it on
       * purpose costs a ban several times longer than the wait we are skipping
       * here. So when the window is full this turn SLEEPS until the oldest
       * entry ages out.
       *
       * The loop runs at most TWICE because every wait retires at least one
       * timestamp and there are two counters (70 attempts, 60 successes). The
       * `tungguMs <= 0` guard is the "no progress possible" case: rather than
       * sleep forever on a window that will not open, the request goes out and
       * the ladder above deals with the provider's own 429 — worse than waiting,
       * better than a silent hang.
       */
      for (let putar = 0; putar < 3; putar++) {
        const perlu = jatahJendela(jendela, sekarang(), angkaJendela);
        if (!perlu || perlu.tungguMs <= 0) break;
        const lewatJendela = sekarang() - mulai;
        if (lewatJendela + perlu.tungguMs >= batasGiliran) {
          berhenti = 'batas-waktu';
          break luar;
        }
        const pesanJendela = `Jatah kredensial hampir habis (${
          perlu.sebab === 'sukses' ? `${angkaJendela.maksSuksesJendela} jawaban` : `${angkaJendela.maksPercobaanJendela} percobaan`
        } per ${Math.round(angkaJendela.jendelaMs / 1000)} dtk) — menunggu ${Math.round(perlu.tungguMs / 1000)} dtk sebelum mencoba ${k.model} (${k.provider})${opsi.jalur ? ` di jalur ${opsi.jalur}` : ''}. Stop untuk hentikan.`;
        tulis(`jendela: ${perlu.sebab} penuh — tunggu ${perlu.tungguMs} ms`);
        lapor({
          tahap: 'tunggu',
          sebab: 'batas-laju',
          kode: null,
          percobaan: totalPercobaan + 1,
          maksPercobaan: anggaran,
          kandidat: k,
          indeksKandidat: ki,
          totalKandidat: kandidat.length,
          jedaMs: perlu.tungguMs,
          pesan: pesanJendela,
        });
        await tidur(perlu.tungguMs);
        tungguMs += perlu.tungguMs;
        tungguJendelaMs += perlu.tungguMs;
        if (opsi.batal?.()) {
          berhenti = 'dibatalkan';
          break luar;
        }
        if (sekarang() - mulai >= batasGiliran) {
          berhenti = 'batas-waktu';
          break luar;
        }
      }
      const lewat2 = sekarang() - mulai;
      if (lewat2 >= batasGiliran) {
        berhenti = 'batas-waktu';
        break luar;
      }
      const jatah = Math.min(batasPercobaan, batasGiliran - lewat2);
      totalPercobaan++;
      catatan.percobaan++;
      jendela.percobaan.push(sekarang());
      lapor({
        tahap: 'coba',
        sebab: null,
        kode: null,
        percobaan: p,
        maksPercobaan: maksKandidat,
        kandidat: k,
        indeksKandidat: ki,
        totalKandidat: kandidat.length,
        jedaMs: 0,
        pesan: `Mencoba ${k.model} (${k.provider}) — percobaan ke-${p}/${maksKandidat} dari ${totalPercobaan}/${anggaran}.`,
      });

      let nilai: T | null = null;
      let galat: unknown = null;
      try {
        nilai = await denganBatasWaktu(opsi.panggil(k, p), jatah);
      } catch (e) {
        galat = e;
      }

      if (galat === null) {
        tulis(`coba#${totalPercobaan} ${k.provider}/${k.model} → jawab (${sekarang() - mulai} ms)`);
        jendela.sukses.push(sekarang());
        lapor({
          tahap: 'sukses',
          sebab: null,
          kode: null,
          percobaan: totalPercobaan,
          maksPercobaan: anggaran,
          kandidat: k,
          indeksKandidat: ki,
          totalKandidat: kandidat.length,
          jedaMs: 0,
          pesan: `${k.model} (${k.provider}) menjawab pada percobaan ke-${totalPercobaan}.`,
        });
        return {
          ok: true,
          nilai,
          kandidat: k,
          percobaan: totalPercobaan,
          percobaanPerKandidat: dicoba,
          alasanBerhenti: 'sukses',
          sebab: null,
          kode: null,
          jejak,
          pesan: null,
          ms: sekarang() - mulai,
          tungguMs,
          jendela: { ...isiJendela(jendela, sekarang(), angkaJendela.jendelaMs), tungguJendelaMs },
        };
      }

      terakhir = vonisGalat(galat);
      terakhirAman = saringRahasia(galat);
      tulis(
        `coba#${totalPercobaan} ${k.provider}/${k.model} → ${terakhir.kode ?? '-'} ${terakhir.sebab}${
          terakhir.bolehUlang ? '' : ' (permanen, tidak diulang)'
        }`,
      );

      if (!terakhir.bolehUlang) {
        /*
         * Permanent. Not retried, and deliberately NOT shifted onto another
         * candidate either: a wrong key stays wrong, and swapping provider here
         * would hide the one fact the user has to act on.
         */
        berhenti = 'permanen';
        break luar;
      }

      if (p >= maksKandidat) break; // candidate's attempts used up → fall through to fallback
      if (totalPercobaan >= anggaran) {
        berhenti = 'anggaran-habis';
        break luar;
      }

      const dasarJeda = jedaKe(p, {
        jedaDasarMs: opsi.jedaDasarMs,
        jedaMaksMs: jedaMaks,
        jitter: opsi.jitter,
        acak: opsi.acak,
      });
      const dariHeader = terakhir.setelahMs !== null;
      const jeda = Math.min(Math.max(dasarJeda, terakhir.setelahMs ?? 0), jedaMaks);
      tulis(
        `tunggu ${jeda} ms (backoff percobaan ${p}${dariHeader ? `, Retry-After ${terakhir.setelahMs} ms` : ''}${
          terakhir.kode ? `, kode ${terakhir.kode}` : ''
        })`,
      );
      lapor({
        tahap: 'tunggu',
        sebab: terakhir.sebab,
        kode: terakhir.kode,
        percobaan: p + 1,
        maksPercobaan: maksKandidat,
        kandidat: k,
        indeksKandidat: ki,
        totalKandidat: kandidat.length,
        jedaMs: jeda,
        pesan: pesanTunggu({
          sebab: terakhir.sebab,
          percobaan: p + 1,
          maksPercobaan: maksKandidat,
          jedaMs: jeda,
          kandidat: k,
          indeksKandidat: ki,
          totalKandidat: kandidat.length,
        }),
      });
      await tidur(jeda);
      tungguMs += jeda;

      if (opsi.batal?.()) {
        berhenti = 'dibatalkan';
        break luar;
      }
      if (sekarang() - mulai >= batasGiliran) {
        berhenti = 'batas-waktu';
        break luar;
      }
    }

    /* Candidate exhausted: rung down the list, saying so. No wait between
       candidates — a different provider is not throttled by the same window.
       The rung is only ANNOUNCED when there is still budget and wall-clock
       left; announcing a switch and then stopping on the very next line would
       tell the user a model is being tried when no call is ever sent to it. */
    if (ki + 1 < kandidat.length) {
      if (totalPercobaan >= anggaran) {
        berhenti = 'anggaran-habis';
        break luar;
      }
      if (sekarang() - mulai >= batasGiliran) {
        berhenti = 'batas-waktu';
        break luar;
      }
      const berikut = kandidat[ki + 1];
      tulis(
        `pindah: ${k.provider}/${k.model} habis (${catatan.percobaan}/${maksKandidat} percobaan) → ${berikut.provider}/${berikut.model}`,
      );
      lapor({
        tahap: 'pindah',
        sebab: terakhir?.sebab ?? null,
        kode: terakhir?.kode ?? null,
        percobaan: totalPercobaan,
        maksPercobaan: anggaran,
        kandidat: berikut,
        indeksKandidat: ki + 1,
        totalKandidat: kandidat.length,
        jedaMs: 0,
        pesan: `Model ${k.model} (${k.provider}) habis ${catatan.percobaan} percobaan tanpa jawaban — beralih ke ${berikut.model} (${berikut.provider}).`,
      });
    } else {
      berhenti = 'kandidat-habis';
    }
  }

  const ringkas: RingkasGagal = {
    sebab: terakhir?.sebab ?? null,
    kode: terakhir?.kode ?? null,
    alasanBerhenti: berhenti,
    percobaan: totalPercobaan,
    dicoba,
    sebabAman: terakhirAman,
    jalur: opsi.jalur,
  };
  const pesan = pesanGagal(ringkas);
  tulis(`berhenti: ${berhenti} setelah ${totalPercobaan} percobaan — ${pesan}`);
  lapor({
    tahap: 'gagal',
    sebab: ringkas.sebab,
    kode: ringkas.kode,
    percobaan: totalPercobaan,
    maksPercobaan: anggaran,
    kandidat: kandidat[Math.max(0, dicoba.length - 1)],
    indeksKandidat: Math.max(0, dicoba.length - 1),
    totalKandidat: kandidat.length,
    jedaMs: 0,
    pesan,
  });
  return {
    ok: false,
    nilai: null,
    kandidat: null,
    percobaan: totalPercobaan,
    percobaanPerKandidat: dicoba,
    alasanBerhenti: berhenti,
    sebab: ringkas.sebab,
    kode: ringkas.kode,
    jejak,
    pesan,
    ms: sekarang() - mulai,
    tungguMs,
    jendela: { ...isiJendela(jendela, sekarang(), angkaJendela.jendelaMs), tungguJendelaMs },
  };
}
