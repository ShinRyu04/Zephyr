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
 * 120k characters is deliberately conservative - about 30k tokens of text,
 * well inside any gateway, and still far more than one step needs.
 */
export const PAYLOAD_MAX_CHARS = 120_000;

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
 * Order of sacrifice: shorten old tool output, then drop old messages
 * whole, then stop. System messages are never touched and the newest turn is
 * always kept, because those are what make the request answerable; a shorter
 * request beats a useless one.
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

  // Pass 2: shorten long bodies to a stub, oldest first.
  const STUB = 300;
  for (let i = 0; i < clone.length; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    clone[i] = {
      ...m,
      content:
        m.role === 'tool'
          ? `[hasil tool dipotong agar request tidak melebihi batas gateway: ${isi.length} karakter -> ${STUB}]`
          : isi.slice(0, STUB),
      // An assistant message whose text was cut but whose tool call is kept
      // still parses; the reverse does not, so the call stays only for tools.
      toolCalls: m.role === 'tool' ? m.toolCalls : undefined,
    } as T;
  }

  // Pass 3: still over budget, drop whole old messages. An assistant/tool pair
  // is dropped together - an orphaned tool result is a protocol error for the
  // provider and costs the whole request.
  while (ukuran() > cap && clone.length > 2) {
    clone.splice(0, 1);
    if (clone[0]?.role === 'tool' && clone[1]?.role !== 'assistant') clone.splice(0, 1);
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
