/*
 * Reads the API-key slots straight off `secrets.json`.
 *
 * WHY this exists on top of `get_public_models`: that command returns a cached
 * shape of the file, and every window keeps its own copy of it. The reported
 * failure was "I typed the key, it says I have no key" — and the copy in the
 * AI panel could be stale for minutes because only *some* paths refreshed it
 * (saving the key, a `settings-changed` event). Opening the model picker read
 * the stale copy.
 *
 * The file itself is the source of truth, and `fs_read` already reaches
 * `%APPDATA%\zephyr\` (that path is outside the workspace, so it is one of the
 * directories the reader may read). This module only answers one question —
 * WHICH slot names hold a non-empty value — and never returns, logs, or
 * decrypts the value. A provider is "keyed" when its slot exists with text in
 * it, which is exactly what `set_model_key` writes.
 *
 * Every call is best-effort: a missing file, an unparsable one, or a frontend
 * outside Tauri (harness, browser preview) resolves to an empty set and the
 * caller falls back to the IPC list it already had.
 */

const PROVIDER_KATALOG: readonly string[] = [
  'gemini',
  'openai',
  'anthropic',
  'deepseek',
  'custom',
  'xai',
  'zai',
  'minimax',
  'kimi',
  'byteplus',
  'openrouter',
  'grok',
  'local',
  'lmstudio',
  'ollama',
  'groq',
  'mistral',
];

/** Slot names that hold something other than a model key. */
const BUKAN_PROVIDER = new Set(['github']);

let jalur: string | null = null;

async function jalurSecrets(): Promise<string | null> {
  if (jalur) return jalur;
  try {
    /*
     * Sumber kebenaran = data_dir dari app itu sendiri (get_app_info), BUKAN
     * tebakan appDataDir() + "\zephyr\": sejak identifier build berubah
     * (com.zephyr.editor) tebakan itu menghasilkan path dobel yang tidak pernah
     * ada, fs_read menolaknya, dan seluruh app mengira tidak ada API key —
     * agent jalan tanpa key (keluhan "agent bego / berhenti sendiri").
     */
    const { getAppInfo } = await import('./commands');
    const info = await getAppInfo();
    const dasar = (info.dataDir ?? '').replace(/[\\/]+$/, '');
    if (!dasar) return null;
    jalur = `${dasar}\\secrets.json`;
    return jalur;
  } catch {
    return null;
  }
}

/**
 * Provider ids whose API key is present on disk right now.
 *
 * Empty set = "could not tell" as well as "none saved". Callers must treat it
 * as an extra source of evidence (`hasKey` OR this), never as a denial.
 */
export async function keyDiDisk(): Promise<Set<string>> {
  const out = new Set<string>();
  const p = await jalurSecrets();
  if (!p) return out;
  try {
    const { fsRead } = await import('./commands');
    const teks = (await fsRead(p))?.content;
    if (!teks) return out;
    const isi = JSON.parse(teks) as Record<string, unknown>;
    for (const [k, v] of Object.entries(isi)) {
      if (BUKAN_PROVIDER.has(k)) continue;
      if (typeof v !== 'string' || !v.trim()) continue;
      out.add(k);
    }
  } catch {
    /* no file yet, or not a Tauri window: the IPC list is all we have */
  }
  return out;
}

/**
 * Is `provider` keyed, according to disk?
 *
 * The bare `custom` slot is deliberately NOT answered here: it shares its name
 * with a catalogue row that has no endpoint, and the real gateway lives under
 * `custom-<slug>`. `aiStore.hasKey` already resolves that alias correctly.
 */
export async function providerPunyaKeyDiDisk(provider: string): Promise<boolean> {
  const p = (provider ?? '').trim();
  if (!p || p === 'custom' || p === 'hydra') return false;
  const ada = await keyDiDisk();
  if (ada.has(p)) return true;
  /*
   * `custom-<slug>` was introduced later than the single `custom` slot: a key
   * saved before that change sits under the plain `custom` name. Accept it as
   * evidence for a gateway that has its own URL, which is the same rule
   * `hasKey` applies.
   */
  if (p.startsWith('custom-') && ada.has('custom')) return true;
  return false;
}

export { PROVIDER_KATALOG };
