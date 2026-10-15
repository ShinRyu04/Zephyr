/*
 * Context budget: one place for the token estimate and the window size.
 *
 * Both the usage meter and the agent loop's automatic compaction have to agree
 * on how full the context is. Two separate formulas would drift, and a meter
 * that reads 50% while the loop compacts at 30% is worse than no meter at all.
 * Everything imports from here.
 */
import { findModel } from './modelCatalog';

/**
 * Rough token count for a piece of text.
 *
 * ~4 characters per token. It is an estimate, not a tokenizer: the providers
 * differ, and running the real BPE here would cost more than it is worth for a
 * number the reader only uses to judge "am I near the edge".
 */
export function kiraToken(teks: string): number {
  return Math.ceil((teks ?? '').length / 4);
}

/**
 * The model's context window in tokens.
 *
 * Falls back to 128k for an unknown model, which is the smallest window Zephyr
 * ships. Guessing low is the safe direction: it compacts earlier rather than
 * overflowing a provider that would reject the request.
 *
 * NOTE for the hosted CLI tabs: they store the CLI's ALIAS (`opus`, `sonnet`,
 * `default`), which has no catalogue entry and would silently land on the 128k
 * floor while the real window is 1M. Those callers must resolve the alias
 * first — `jendelaAliasCli` in cliCatalog — and only pass a real model id here.
 */
export function jendelaKonteks(modelId: string): number {
  const m = findModel(modelId);
  return m?.ctx && m.ctx > 0 ? m.ctx : 128_000;
}

/**
 * Estimated tokens used by a list of messages.
 *
 * Sums over the message text exactly the way the meter does. Structurally typed
 * so it accepts both ChatMsg[] and AgentMsg[] — the meter reads the session's
 * ChatMsgs, the agent loop reads its outgoing AgentMsgs, and both have `content`.
 */
export function perkiraanKonteks(messages: { content?: string; images?: string[] }[]): number {
  let n = 0;
  for (const m of messages) {
    n += kiraToken(m.content ?? '');
    // An image is billed in tokens of its own, not in the characters of its
    // base64 form. Counting only the text made a screenshot-heavy run read as
    // nearly empty, so compaction never fired and every step re-sent them all.
    if (m.images?.length) n += m.images.length * TOKEN_PER_IMAGE;
  }
  return n;
}

/** Rough token cost of one attached image. */
const TOKEN_PER_IMAGE = 1500;

/**
 * Hard ceiling on how much text one request may carry, in characters.
 *
 * WHY this is separate from the token budget: the token budget is measured
 * against the MODEL's context window, but the request first has to survive the
 * gateway in front of it, and a gateway has its own body limit and its own
 * patience. Those are transport limits, not model limits, and nothing in the
 * token estimate can see them.
 *
 * That gap is why an agent run could fail while a chat in the same app worked:
 * chat sends one short message, the agent re-sends its whole working set, and
 * past some size the gateway answers 502 however well-formed the request is.
 *
 * The old 120k figure was wrong, and the evidence is direct. A real agent step
 * was answered with:
 *
 *   HTTP 400 — 15 messages, 46,440 bytes
 *   urutan peran: system -> user -> assistant -> tool -> assistant -> ... -> user
 *   bentuk pesan: no violation detected
 *
 * The shape was perfect and the request was still refused, so size was the only
 * remaining variable - and 46 KB is under 120 KB, which is exactly why the old
 * cap never fired. The doc-comment claimed 120k was "well inside any gateway";
 * the gateway in front of a rotating model router says otherwise. Routers proxy
 * to many upstreams and apply the SMALLEST limit among them, and an
 * OpenAI-compatible relay commonly sits at 32-64 KB.
 *
 * 40k characters is the value that keeps the request under every ceiling seen
 * in practice with room to spare, while still being ~10k tokens of text - far
 * more than any single step needs once tool output is truncated the way
 * `HISTORY_TOOL_CHARS` already does.
 */
export const PAYLOAD_MAX_CHARS = 40_000;

/**
 * Approximate serialized size of an outgoing message list.
 *
 * Measured on the JSON rather than estimated from token counts, because what
 * blows a request up (base64 images, long tool output) is exactly what a token
 * estimate undercounts.
 */
export function ukuranPayload(messages: unknown[]): number {
  try {
    return JSON.stringify(messages).length;
  } catch {
    // Non-serializable input is a bug worth surfacing, not hiding: report it
    // as over budget so the trimmer still runs instead of sending it anyway.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Shrink a message list until its serialized size fits the gateway budget.
 *
 * Age-based compaction is blind to request SIZE. Whatever stays inside the
 * working window still goes out in full, and a window that fills with long
 * file dumps or base64 screenshots can produce a body the gateway in front of
 * the provider refuses with 502 - a limit that belongs to the transport, not
 * to the model, so no token estimate can see it.
 *
 * Order of sacrifice: shorten old tool output, drop old messages whole, strip
 * the newest turn's images, then shorten the newest turn's own body. System
 * messages are never touched and the newest turn is preferred over the older
 * ones, because that is what makes the request answerable; a request that is
 * slightly short beats one the transport refuses outright (502).
 *
 * Generic over the message type so it stays testable without the store.
 */
export function ringkasUkuran<T extends { role: string; content?: unknown; images?: unknown; toolCalls?: unknown }>(
  messages: T[],
  cap: number = PAYLOAD_MAX_CHARS,
): T[] {
  const sistem = messages.filter((m) => m.role === 'system');
  const lain = messages.filter((m) => m.role !== 'system');
  if (lain.length === 0) return messages;

  const clone: T[] = lain.map((m) => ({ ...m }));
  const ukuran = () => ukuranPayload([...sistem, ...clone]);

  if (ukuran() <= cap) return messages;

  /*
   * Pass 1: strip images before shortening text.
   *
   * Order matters more than it looks. A base64 screenshot is ~99% of a
   * screenshot-heavy request, so trimming text while the images stay in would
   * almost never reach the cap and the next pass would have to throw away
   * whole turns - losing far more than necessary. An old screenshot is worth
   * nothing to the model anyway: it already acted on it. The newest turn keeps
   * its images, because that is what the model is answering about.
   */
  for (let i = 0; i < clone.length - 1 && ukuran() > cap; i++) {
    if (Array.isArray(clone[i].images) && (clone[i].images as unknown[]).length > 0) {
      clone[i] = { ...clone[i], images: [] } as T;
    }
  }
  if (ukuran() <= cap) return [...sistem, ...clone];

  /*
   * Pass 2: shorten long bodies to a stub, TAPI tidak untuk giliran terakhir.
   *
   * Dua kerusakan diperbaiki di sini.
   *
   * PERTAMA, `content` hasil tool diganti dengan pesan stub - bukan potongan
   * isi. Model tidak menerima satu byte pun data yang dimintanya, hanya kalimat
   * "hasil tool dipotong". Terbukti di app hidup: agent membaca tiga berkas yang
   * baru saja ditulisnya, mendapat stub untuk ketiganya, lalu menjawab dengan
   * jujur bahwa ia tidak bisa memverifikasi apa pun. Pekerjaannya benar dan
   * verifikasinya mustahil - bukan karena modelnya, tapi karena alat yang
   * membuang datanya sebelum dikirim.
   *
   * SEKARANG potongannya dipertahankan: awalan isi tetap dikirim, dengan catatan
   * berapa yang tidak ikut. Model bisa memakai apa yang dilihatnya, dan tahu
   * bahwa ada bagian yang hilang sehingga ia bisa membaca ulang bagian tertentu
   * kalau perlu.
   *
   * KEDUA, giliran yang PALING BARU tidak dipotong sama sekali. Data yang baru
   * saja diambil adalah yang sedang dipakai model untuk memutuskan langkah
   * berikutnya; memotongnya membuat langkah berikutnya buta. Yang tua memang
   * boleh dipotong - itu sudah selesai dipakai.
   */
  const STUB = 1_200;
  /*
   * Batas loop MENJANGKAU elemen terakhir (`i < clone.length`, bukan
   * `clone.length - 1`). Versi lama berbunyi `i < clone.length - 1`, sehingga
   * penjaga tepat di bawah (`if (i === clone.length - 1 ...) continue;`) TIDAK
   * PERNAH bisa benar: batas loop sudah mengecualikan indeks terakhir, jadi
   * syarat penjaga mustahil terpenuhi dan baris itu menjadi kode mati.
   *
   * Sekarang penjaga benar-benar dieksekusi: satu iterasi tambahan mencapai
   * indeks terakhir dan `continue` di sana yang meloloskannya. Efek akhirnya
   * sama dengan batas lama, tetapi kali ini terlihat dan teruji - kode yang
   * TAMPAK menjaga sesuatu padahal tidak lebih buruk daripada tanpa penjaga,
   * karena pembaca berikutnya menganggapnya sudah aman.
   *
   * Penjaga ini hanya berlaku pada pass ini; jalur potong-terakhir di bawah
   * (isi penuh dipotong sesuai sisa anggaran) tetap boleh memendekkannya.
   */
  for (let i = 0; i < clone.length; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan. */
    if (i === clone.length - 1) continue;
    clone[i] = {
      ...m,
      content:
        m.role === 'tool'
          ? `${isi.slice(0, STUB)}\n\n[isi dipotong agar request tidak melebihi batas gateway: ${isi.length} karakter, hanya ${STUB} pertama yang dikirim]`
          : isi.slice(0, STUB),
    } as T;
  }
  if (ukuran() <= cap) return [...sistem, ...clone];

  /*
   * Pass 3: drop whole old messages, but NEVER leave a tool result orphaned.
   *
   * An assistant message with `tool_calls` and the `tool` message holding its
   * result are ONE protocol unit: the provider rejects the request outright if
   * a tool result has no preceding call. Both directions are fatal, and both
   * were producible here:
   *
   *   - Dropping the assistant but keeping the `tool` left a result with no
   *     call. The old code only checked the head of the list, so a tool result
   *     left at the END (the common case, because trimming removes from the
   *     front) survived every pass untouched.
   *
   *   - Stripping `tool_calls` off an assistant (pass 2 did this for every
   *     non-tool message) left its `tool` result with no call to answer.
   *
   * Both show up on the wire as a body the gateway refuses, and the visible
   * symptom is a run that dies on the step where a large file is written -
   * exactly when the payload crosses the size limit for the first time.
   *
   * The fix is to drop a unit WHOLE: an assistant with tool calls is removed
   * together with the tool results that follow it, and a tool result whose call
   * is gone is removed too.
   */
  /*
   * POTONG EKOR LEBIH DULU, sebelum membuang riwayat dari depan.
   *
   * `while (ukuran() > cap)` di bawah membuang unit dari DEPAN sampai muat.
   * Akibatnya blok pemotongan ekor (yang duduk di akhir fungsi) tidak pernah
   * menyala: begitu kendali sampai ke sana, `ukuran() <= cap` sudah terpenuhi -
   * dan yang dibayar untuk itu adalah riwayat yang lenyap dari awal percakapan.
   *
   * Urutannya dibalik karena kerugiannya tidak setara. Memotong ekor kehilangan
   * sebagian isi SATU hasil terakhir, dan model diberi tahu berapa yang tidak
   * ikut lewat catatan di badan pesannya. Membuang unit dari depan kehilangan
   * seluruh langkah beserta hasil tool-nya, tanpa satu pun catatan yang terlihat
   * model - jadi ia bisa menjawab seolah ingat sesuatu yang sudah tidak dikirim.
   */
  if (ukuran() > cap && clone.length > 0) {
    const idx = clone.length - 1;
    const terakhir = clone[idx];
    const isiEkor = typeof terakhir.content === 'string' ? terakhir.content : '';
    const MIN_EKOR = 400;
    if (isiEkor.length > MIN_EKOR) {
      const lebih = ukuran() - cap;
      const target = Math.max(MIN_EKOR, isiEkor.length - Math.max(0, lebih) - 240);
      const simpan = Math.min(target, isiEkor.length - 1);
      clone[idx] = {
        ...terakhir,
        content: `${isiEkor.slice(0, simpan)}\n\n[isi dipotong agar request tidak melebihi batas gateway: ${isiEkor.length} karakter, hanya ${simpan} pertama yang dikirim]`,
      } as T;
    }
  }

  while (ukuran() > cap && clone.length > 2) {
    const pertama = clone[0];
    if (pertama?.role === 'tool') {
      /* Yatim: hasilnya ada tapi pemanggilnya sudah tidak dikirim. */
      clone.splice(0, 1);
      continue;
    }
    if (pertama?.role === 'assistant' && (pertama.toolCalls as unknown[] | undefined)?.length) {
      /* Buang satu unit: asisten + seluruh hasil tool yang mengikutinya. */
      clone.splice(0, 1);
      while (clone[0]?.role === 'tool') clone.splice(0, 1);
      continue;
    }
    clone.splice(0, 1);
  }

  /*
   * Setiap hasil tool yang tersisa harus masih punya pemanggilnya. Kalau tidak,
   * membuangnya lebih baik daripada mengirim graf yang pasti ditolak - satu
   * hasil yang hilang hanya mengurangi informasi, sedangkan body yang ditolak
   * menghilangkan SELURUH langkah.
   */
  for (let i = 0; i < clone.length; i++) {
    if (clone[i]?.role !== 'tool') continue;
    const adaPemanggil =
      i > 0 &&
      clone[i - 1]?.role === 'assistant' &&
      ((clone[i - 1].toolCalls as unknown[] | undefined)?.length ?? 0) > 0;
    if (!adaPemanggil) clone.splice(i, 1);
  }

  /*
   * Pass 4: jaring terakhir untuk giliran PALING BARU.
   *
   * Tiga pass di atas sengaja melindungi giliran terakhir: datanya yang sedang
   * dipakai model untuk memutuskan langkah berikutnya. Tapi kalau giliran itu
   * SENDIRI yang melewati cap, semua pass di atas selesai tanpa hasil dan
   * requestnya tetap ditolak gateway - SELURUH langkah hilang, bukan sebagian
   * datanya. Terukur: 2.701.517 karakter turun ke 50.230 karakter dengan cap
   * 40.000, yaitu request yang pasti dijawab 502.
   *
   * Jadi di sini giliran terakhir ikut dipangkas, urutannya dari yang paling
   * sedikit merugikan:
   *   1. gambarnya dilepas (pikselnya memang tidak bisa ikut; teksnya tetap
   *      utuh dan model diberi tahu supaya ia tidak menjawab seolah melihat),
   *   2. baru isinya diperpendek - awalan tetap dikirim, dengan catatan berapa
   *      karakter yang tidak ikut.
   * Yang penting: hasilnya selalu lebih baik daripada request yang ditolak.
   */
  if (ukuran() > cap && clone.length > 0) {
    const idx = clone.length - 1;
    const terakhir = clone[idx];
    const jumlahGambar = Array.isArray(terakhir?.images) ? (terakhir.images as unknown[]).length : 0;
    if (jumlahGambar > 0) {
      const isiAwal = typeof terakhir.content === 'string' ? terakhir.content : null;
      clone[idx] = {
        ...terakhir,
        images: [],
        ...(isiAwal !== null
          ? { content: `${isiAwal}\n\n[catatan: ${jumlahGambar} gambar dilepas agar request tidak melebihi batas gateway]` }
          : {}),
      } as T;
    }
  }
  if (ukuran() > cap && clone.length > 0) {
    const idx = clone.length - 1;
    const terakhir = clone[idx];
    const isi = typeof terakhir.content === 'string' ? terakhir.content : '';
    const MIN = 400;
    /*
     * `simpan` HARUS benar-benar lebih pendek dari `isi`.
     *
     * Versi lama menghitung `max(MIN, isi.length - kelebihan - 240)`. Ketika
     * pesan terakhir JAUH lebih besar daripada kelebihannya (kasus yang paling
     * sering: cap pesan-saja sudah cukup, yang lewat cuma batas payload),
     * `kelebihan` kecil sehingga hasilnya sama dengan `isi.length` - pesannya
     * dikirim UTUH sambil tetap memasang catatan "dipotong". Yang dibaca model
     * jadi salah dua kali: ia tidak tahu ada yang hilang, dan catatannya
     * mengklaim ada pemotongan yang tidak terjadi.
     *
     * Lantai MIN sekarang juga jadi PLAFON: kalau pesan aslinya di atas MIN,
     * yang dikirim tidak boleh lebih dari `isi.length - 1` supaya pemotongan
     * dan catatannya sama-sama benar. Pesan yang memang lebih pendek dari MIN
     * dibiarkan utuh - memotong 300 karakter jadi 299 hanya menyulitkan model
     * tanpa menghemat apa pun.
     */
    if (isi.length > MIN) {
      const lebih = ukuran() - cap;
      const target = Math.max(MIN, isi.length - Math.max(0, lebih) - 240);
      const simpan = Math.min(target, isi.length - 1);
      clone[idx] = {
        ...terakhir,
        content: `${isi.slice(0, simpan)}\n\n[isi dipotong agar request tidak melebihi batas gateway: ${isi.length} karakter, hanya ${simpan} pertama yang dikirim]`,
      } as T;
    }
  }

  return [...sistem, ...clone];
}

/**
 * Pick a fallback model after a retryable provider failure.
 *
 * WHY: an agent run pinned to one endpoint dies when that endpoint coughs, even
 * though the same account can serve another model right then. Large agent apps
 * hold several upstreams and move between them; a single-endpoint client simply
 * stops. This is that move, done once per run.
 *
 * Order matters, and it is the whole design:
 *  1. Another model under the SAME provider. Same API key, same gateway, only
 *     the model differs, so nothing about the user's configuration is
 *     second-guessed and the swap cannot fail on auth.
 *  2. Only then a different provider, and only when a key is already
 *     configured. Silently hopping to an unconfigured provider would fail on
 *     authentication rather than the real problem, and would bury the original
 *     error - strictly worse than stopping with the truth on screen.
 *
 * Candidates come from the live catalogue, never a hand-written list: a list
 * here would drift from the models the app actually offers and quietly rot.
 *
 * Prefers a model of similar capability (similar context size) so the fallback
 * can still finish the task instead of arriving with a much smaller window.
 *
 * Pure, so it can be tested without the app.
 */
export function pilihModelCadangan(
  sekarang: { provider: string; id: string; ctx?: number },
  semuaModel: readonly { id: string; provider: string; ctx?: number; freeText?: boolean }[],
  punyaKunci: (provider: string) => boolean,
): { provider: string; id: string; alasan: string } | null {
  /*
   * Free-text providers (custom, local) have exactly one model: whatever the
   * user typed. There is nothing to switch to - the "model" IS their input.
   * Offering a catalogue model here would send a name the user's endpoint has
   * never heard of.
   */
  const punyaBebas = (p: string) =>
    semuaModel.some((m) => m.provider === p && (m.freeText || allModelsFreeText(p, semuaModel)));
  if (punyaBebas(sekarang.provider)) return null;

  const seklan = semuaModel.filter((m) => m.provider === sekarang.provider && m.id !== sekarang.id);
  if (seklan.length > 0) {
    const terbaik = palingDekat(seklan, sekarang.ctx);
    return { provider: terbaik.provider, id: terbaik.id, alasan: ' (provider sama)' };
  }

  const lain = semuaModel.filter((m) => m.provider !== sekarang.provider && !punyaBebas(m.provider));
  const terkonfigurasi = lain.filter((m) => punyaKunci(m.provider));
  if (terkonfigurasi.length === 0) return null;

  const terbaik = palingDekat(terkonfigurasi, sekarang.ctx);
  return { provider: terbaik.provider, id: terbaik.id, alasan: ' (provider lain, sudah dikonfigurasi)' };
}

/** Provider whose models are all user-typed (custom/local) has no alternatives. */
function allModelsFreeText(
  provider: string,
  semua: readonly { provider: string; freeText?: boolean }[],
): boolean {
  const milik = semua.filter((m) => m.provider === provider);
  return milik.length > 0 && milik.every((m) => m.freeText);
}

/** Pick the candidate whose context window is closest to the failed model's. */
function palingDekat<T extends { ctx?: number }>(kandidat: readonly T[], ctxSekarang?: number): T {
  if (!ctxSekarang) return kandidat[0];
  let terbaik = kandidat[0];
  let selisihTerbaik = Infinity;
  for (const k of kandidat) {
    const selisih = Math.abs((k.ctx ?? ctxSekarang) - ctxSekarang);
    if (selisih < selisihTerbaik) {
      selisihTerbaik = selisih;
      terbaik = k;
    }
  }
  return terbaik;
}

/**
 * Fraction of the window at which automatic compaction fires.
 *
 * 0.8 leaves room for the next step's tool results and the answer itself: a
 * step can add tens of thousands of characters of file contents, and compacting
 * at 0.99 would mean the request that trips the limit is the one that overflows.
 */
export const AUTO_COMPACT_AT = 0.8;

/*
 * The window the reader chose, if they changed it.
 *
 * `/autocompact <tokens>` in the real CLI sets how full the window gets before
 * compaction runs automatically. Keeping it here — next to the constant it
 * overrides — means the agent loop and the setting cannot disagree, and the
 * stored value is a NUMBER OF TOKENS rather than a percentage so it survives a
 * model change with a different window size.
 */
const KUNCI_AUTOCOMPACT = 'zephyr.ai.autocompactTokens';

/** The configured threshold in tokens, or null for the percentage default. */
export function ambangAutoCompact(): number | null {
  try {
    const v = localStorage.getItem(KUNCI_AUTOCOMPACT);
    if (!v || v === 'auto') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Set it, or clear it back to the default with `null` / "auto". */
export function setelAmbangAutoCompact(v: number | null): void {
  try {
    if (v === null) localStorage.removeItem(KUNCI_AUTOCOMPACT);
    else localStorage.setItem(KUNCI_AUTOCOMPACT, String(Math.round(v)));
  } catch {
    /* storage unavailable: the setting applies to this session only */
  }
}

/**
 * The token count at which compaction should run for this model.
 *
 * An explicit window wins over the percentage, because that is what the reader
 * asked for: someone who sets 120k means 120k, not "120k or 80% of whatever
 * model happens to be selected".
 */
export function batasAutoCompact(modelId: string): number {
  const pilihan = ambangAutoCompact();
  if (pilihan !== null) return pilihan;
  return jendelaKonteks(modelId) * AUTO_COMPACT_AT;
}

/** How many tail messages auto-compaction always leaves untouched. */
export const AUTO_COMPACT_KEEP = 6;

/**
 * Minimum steps between two automatic compactions in one run.
 *
 * Compaction costs a model call and rewrites the history; doing it on every
 * step once the window is near the line would spend more tokens on summaries
 * than it saves. A cooldown lets the window refill with real work in between.
 */
export const AUTO_COMPACT_COOLDOWN_STEPS = 6;
