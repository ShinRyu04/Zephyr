use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::State;

const SALT: &str = "zephyr/secrets/v1";

fn machine_seed() -> String {
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "unknown-user".into());

    let mut reg = crate::proc::cmd("reg");
    reg.args([
        "query",
        r"HKLM\SOFTWARE\Microsoft\Cryptography",
        "/v",
        "MachineGuid",
    ]);
    let guid = reg
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.split_whitespace()
                .last()
                .map(|x| x.trim().to_string())
                .filter(|x| x.len() > 8)
        })
        .unwrap_or_else(|| "no-guid".into());

    format!("{SALT}|{guid}|{name}|{user}")
}

fn keystream(len: usize) -> Vec<u8> {
    let mut out = vec![0u8; len];
    blake3::Hasher::new()
        .update(machine_seed().as_bytes())
        .finalize_xof()
        .fill(&mut out);
    out
}

fn xor_crypt(data: &[u8]) -> Vec<u8> {
    let ks = keystream(data.len());
    data.iter().zip(ks).map(|(b, k)| b ^ k).collect()
}

fn encrypt(plain: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(xor_crypt(plain.as_bytes()))
}

fn decrypt(enc: &str) -> Option<String> {
    use base64::Engine;
    let raw = base64::engine::general_purpose::STANDARD.decode(enc).ok()?;
    String::from_utf8(xor_crypt(&raw)).ok()
}

pub fn encrypt_string(plain: &str) -> String {
    encrypt(plain)
}

#[allow(dead_code)]
pub fn decrypt_string(enc: &str) -> Option<String> {
    decrypt(enc)
}

fn secrets_path(state: &AppState) -> PathBuf {
    state.file("secrets.json")
}

fn baca_mentah(state: &AppState) -> Option<(String, Map<String, Value>)> {
    let path = secrets_path(state);
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return Some((raw, Map::new()));
    }
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Object(o)) => Some((raw, o)),
        _ => None,
    }
}

fn read_secrets(state: &AppState) -> Map<String, Value> {
    baca_mentah(state).map(|(_, m)| m).unwrap_or_default()
}

fn map_untuk_tulis(state: &AppState) -> ZResult<Map<String, Value>> {
    let path = secrets_path(state);
    if !path.exists() {
        return Ok(Map::new());
    }
    match baca_mentah(state) {
        Some((_, m)) => Ok(m),
        None => {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                backup_sekali(state, &raw);
            }
            Err(ZephyrError::Internal(
                "secrets.json exists but could not be read (the machine key may have changed). \
                 The old file was left intact and backed up to secrets.json.bak-*. \
                 Re-enter the API key to continue."
                    .into(),
            ))
        }
    }
}

fn backup_sekali(state: &AppState, raw: &str) {
    let path = secrets_path(state);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut b = path.clone();
    b.set_file_name(format!("secrets.json.bak-{stamp}"));
    let _ = std::fs::write(&b, raw);
}

fn write_secrets(state: &AppState, map: &Map<String, Value>) -> ZResult<()> {
    let path = secrets_path(state);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    let bytes = serde_json::to_vec_pretty(&Value::Object(map.clone()))?;
    /*
     * Memakai helper bersama `tulis_aman`.
     *
     * Isi fungsinya sama persis dengan yang dulu ada di sini - tulis ke
     * `.tmp-<pid>`, lalu rename - tapi sekarang hanya ada SATU implementasi di
     * seluruh proyek. Dua salinan berarti salah satunya bisa diperbaiki dan
     * yang lain tertinggal, dan yang tertinggal itu justru berkas berisi kunci
     * API pengguna.
     */
    crate::tulis_aman::tulis_atomik(&path, &bytes)
}

fn preview(key: &str) -> String {
    let n = key.chars().count();
    if n <= 8 {
        return "•".repeat(n.max(3));
    }
    let head: String = key.chars().take(4).collect();
    let tail: String = key.chars().skip(n - 4).collect();
    format!("{head}…{tail}")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicModel {
    pub provider: String,
    pub has_key: bool,

    pub preview: String,
}

/*
 * Every provider id the frontend catalogue ships, so `get_public_models`
 * reports `hasKey: false` for one that has never been configured instead of
 * omitting it (the frontend reads `undefined` as "unknown", not "no key").
 *
 * Five custom slots on purpose: a reader driving several OpenAI-compatible
 * gateways needs one key each, and an id is the key's storage slot. Every
 * `customN` MUST stay distinct from the others — sharing an id would make the
 * entries overwrite each other's key and make `activeProvider` ambiguous.
 *
 * This list must stay in step with `PROVIDERS` in `src/lib/modelCatalog.tsx`.
 * A provider missing here does not disappear from the UI; it reports `hasKey`
 * as `undefined`, which the frontend reads as "unknown" rather than "no key".
 *
 * `xai` is deliberately absent: the catalogue no longer offers it. A key left
 * over in secrets.json under that name is simply never read.
 */
const KNOWN_PROVIDERS: [&str; 29] = [
    "gemini",
    "openai",
    "anthropic",
    "deepseek",
    "custom",
    "xai",
    "zai",
    "minimax",
    "kimi",
    "byteplus",
    "openrouter",
    "novita",
    "aws",
    "azure",
    "vercel",
    "ollama",
    "bigmodel",
    "minimax-cn",
    "kimi-cn",
    "volcano",
    "alibaba",
    "tencent",
    "gmi",
    "mimo",
    "siliconflow",
    "gitee",
    "ppio",
    "mistral",
    "groq",
];

#[tauri::command(async)]
pub fn get_public_models(state: State<AppState>) -> ZResult<Vec<PublicModel>> {
    let secrets = read_secrets(&state);

    let mut names: Vec<String> = KNOWN_PROVIDERS.iter().map(|s| s.to_string()).collect();
    for k in secrets.keys() {
        if !names.iter().any(|n| n == k) {
            names.push(k.clone());
        }
    }

    let mut out: Vec<PublicModel> = names
        .into_iter()
        .map(|provider| {
            let plain = secrets
                .get(&provider)
                .and_then(|v| v.as_str())
                .and_then(decrypt)
                .unwrap_or_default();
            PublicModel {
                provider,
                has_key: !plain.is_empty(),
                preview: if plain.is_empty() {
                    String::new()
                } else {
                    preview(&plain)
                },
            }
        })
        .collect();
    out.sort_by(|a, b| a.provider.cmp(&b.provider));
    Ok(out)
}

/*
 * The raw bytes of secrets.json, exactly as they sit on disk and WITHOUT
 * decryption.
 *
 * This exists for one reason: to make the "keys are not stored in plaintext"
 * property provable from a test, from inside the app. `%APPDATA%\zephyr\` is
 * outside the workspace, so the path guard correctly refuses to let Node read
 * that file from outside; without this command the only honest option left is
 * to assert nothing, which is worse.
 *
 * It returns the file's TEXT, never a parsed or decrypted value, and it is
 * read-only. A caller can therefore confirm the plaintext API key does not
 * appear verbatim in the file without gaining any way to read the key back.
 */
#[tauri::command(async)]
pub fn secrets_snapshot(state: State<AppState>) -> ZResult<String> {
    let path = secrets_path(&state);
    if !path.is_file() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal membaca secrets.json: {e}")))
}

pub fn key_for(state: &AppState, provider: &str) -> String {
    read_secrets(state)
        .get(provider.trim())
        .and_then(|v| v.as_str())
        .and_then(decrypt)
        .unwrap_or_default()
}

pub fn set_secret(state: &AppState, name: &str, value: &str) -> ZResult<()> {
    let n = name.trim();
    if n.is_empty() {
        return Err(ZephyrError::InvalidInput("secret name is empty".into()));
    }
    let mut map = map_untuk_tulis(state)?;
    if value.trim().is_empty() {
        map.remove(n);
    } else {
        map.insert(n.to_string(), Value::String(encrypt(value.trim())));
    }
    write_secrets(state, &map)
}

#[tauri::command(async)]
pub fn set_model_key(state: State<AppState>, provider: String, key: String) -> ZResult<()> {
    let p = provider.trim();
    if p.is_empty() {
        return Err(ZephyrError::InvalidInput("provider is empty".into()));
    }
    let mut map = map_untuk_tulis(&state)?;
    if key.trim().is_empty() {
        map.remove(p);
    } else {
        map.insert(p.to_string(), Value::String(encrypt(key.trim())));
    }
    write_secrets(&state, &map)
}

/// The endpoint to call for a provider, plus the auth header to call it with.
///
/// This is shared by `test_model_connection` and `list_models` on purpose. They
/// used to carry two hand-written copies of the same match, and the copies had
/// already drifted (one knew `xai`/`lmstudio`, the other did not) - which means
/// the "Test connection" button and the model list could query two different
/// hosts for the same provider.
struct Endpoint {
    url: String,
    header: &'static str,
    value: String,
    /// `anthropic` needs an extra version header, and `list_models` parses the
    /// response in a provider-specific shape. Both are carried here so a caller
    /// never has to re-derive them from the provider string.
    anthropic: bool,
    gemini_style: bool,
    /// The reader typed a FULL URL for this provider rather than a base URL.
    ///
    /// A gateway that hands out `https://host/v1/chat/completions` as its
    /// address is common enough (`modelrouter.id` does it), and the old code
    /// blindly appended `/models` to whatever it was given, producing
    /// `.../chat/completions/models` — a 404 that reads as a broken key. When
    /// this flag is set, `url` is already the endpoint to call, so `list_models`
    /// must NOT append `/models` and chat sends must NOT append
    /// `/chat/completions`.
    full_url: bool,
}

/// Resolve the provider's endpoint, or refuse.
///
/// The refusal is the whole point for `custom`: it has NO sensible default
/// endpoint, so the old `_ => "https://api.openai.com/v1"` arm quietly tested
/// OpenAI while the user read a verdict about their own gateway. A key that is
/// perfectly good for `https://modelrouter.id/v1` came back "401 - API key
/// rejected", which reads as a broken key and is not.
fn endpoint_for(
    state: &AppState,
    provider: &str,
    base_url: Option<&str>,
    full_url: Option<bool>,
    key: &str,
) -> ZResult<Endpoint> {
    let p = provider.trim();
    let given = base_url.map(str::trim).filter(|s| !s.is_empty());

    /*
     * Fall back to the URL the reader SAVED in settings.
     *
     * `list_models` / `test_model_connection` receive the base URL as an
     * argument, and every frontend caller has to remember to pass it. One
     * caller that forgets turns a fully configured gateway into "unknown
     * provider has no base URL" or a request to the wrong host. The saved
     * value in `settings.models.providers[id].baseUrl` is the user's own
     * answer to "where does this provider live", so it is the correct
     * fallback whenever the argument is absent.
     */
    let saved = match given {
        Some(_) => None,
        None => crate::settings::read_settings_value(state)
            .get("models")
            .and_then(|m| m.get("providers"))
            .and_then(|pr| pr.get(p))
            .and_then(|cfg| cfg.get("baseUrl"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
    };
    let given = given.map(str::to_string).or(saved);

    /*
     * Same fallback for the `fullUrl` flag, and it must live here beside the
     * URL fallback: the flag describes the URL, so reading one from the argument
     * and the other from settings would let a stale `true` claim that a plain
     * base URL is already a full endpoint (chat would then POST to
     * `https://host/v1` itself and get a 404 naming nothing useful).
     */
    let full = match full_url {
        Some(v) => v,
        None => crate::settings::read_settings_value(state)
            .get("models")
            .and_then(|m| m.get("providers"))
            .and_then(|pr| pr.get(p))
            .and_then(|cfg| cfg.get("fullUrl"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    };

    endpoint_for_core(p, given.as_deref(), key, full)
}

fn endpoint_for_core(p: &str, given: Option<&str>, key: &str, full_url: bool) -> ZResult<Endpoint> {
    // Whitespace-only counts as absent: the `custom` refusal below and the
    // unknown-provider refusal further down must both fire for `Some("   ")`
    // too, or a blank field quietly requests the literal URL "/models".
    let given = given.map(str::trim).filter(|s| !s.is_empty());

    // `custom` is the only provider that canNOT work without an address: there
    // is no defensive default for "an OpenAI-compatible endpoint I do not know".
    // It must say so rather than guess. `local` has a real default (loopback),
    // so it is resolved below like the other named providers.
    if p == "custom" && given.is_none() {
        return Err(ZephyrError::InvalidInput(
            "custom provider needs a base URL - set it in Settings → AI Models".into(),
        ));
    }

    let (base, header, value, anthropic, gemini_style) = match p {
        "gemini" => (
            given.unwrap_or("https://generativelanguage.googleapis.com"),
            "x-goog-api-key",
            key.to_string(),
            false,
            true,
        ),
        "anthropic" => (
            given.unwrap_or("https://api.anthropic.com"),
            "x-api-key",
            key.to_string(),
            true,
            false,
        ),
        "deepseek" => (
            given.unwrap_or("https://api.deepseek.com/v1"),
            "Authorization",
            format!("Bearer {key}"),
            false,
            false,
        ),
        // `xai` used to sit here. The provider was removed from the catalogue,
        // so no arm belongs here either: with the arm gone, `xai` now falls to
        // the unknown-provider path below and is REFUSED when no base URL is
        // given. That is the correct outcome — a leftover key can no longer be
        // pointed at a host by a default nobody chose.
        "lmstudio" => (
            given.unwrap_or("http://127.0.0.1:1234/v1"),
            "Authorization",
            format!("Bearer {key}"),
            false,
            false,
        ),
        // Same default as `adapters::openai::default_base` — the two MUST
        // agree, or a connection test reports one host while a real send goes
        // to another. 11434 is Ollama's port, which is what "local" means to
        // almost everyone who picks it.
        "local" => (
            given.unwrap_or("http://127.0.0.1:11434/v1"),
            "Authorization",
            format!("Bearer {key}"),
            false,
            false,
        ),
        // `openai` is the only provider that may default to OpenAI - by NAME.
        // Any other unknown id is treated as OpenAI-compatible and still needs
        // an explicit URL, so an unrecognised provider can never silently probe
        // a host the user never chose.
        "openai" => (
            given.unwrap_or("https://api.openai.com/v1"),
            "Authorization",
            format!("Bearer {key}"),
            false,
            false,
        ),
        _ => match given {
            Some(u) => (u, "Authorization", format!("Bearer {key}"), false, false),
            None => {
                return Err(ZephyrError::InvalidInput(format!(
                    "unknown provider \"{p}\" has no base URL - set one in Settings → AI Models"
                )))
            }
        },
    };

    /*
     * Normalise the base before appending `/models`.
     *
     * Two typos people actually type, both of which used to produce a request
     * that can only fail confusingly:
     *
     *  - `.../v1/models` as the BASE. This function appends `/models`, so the
     *    request went to `.../v1/models/models`. Gateways that mirror the path
     *    answer fine, gateways that do not answer 404 and the reader is told
     *    "check the key and the base URL" while both look right.
     *  - `https//host/v1` — the colon after the scheme is missing. Without it
     *    there is no scheme at all and the HTTP client refuses the URL with a
     *    message that says nothing about a typo.
     *
     * Fixing both here means the saved value keeps working everywhere the
     * base is reused (chat sends read the same settings value).
     */
    let mut base = base.trim().trim_end_matches('/').to_string();
    if base.ends_with("/models") {
        base.truncate(base.len() - "/models".len());
    }
    if !base.contains("://") {
        if let Some(rest) = base.strip_prefix("https//") {
            base = format!("https://{rest}");
        } else if let Some(rest) = base.strip_prefix("http//") {
            base = format!("http://{rest}");
        }
    }

    /*
     * `full_url`: the reader typed the chat endpoint itself, so `url` IS the
     * endpoint and `list_models` must not append `/models` to it.
     *
     * Nothing is appended here either way — the distinction only decides whether
     * `/models` is glued on below. Chat sends read `Endpoint::full_url` via
     * `endpoint_for`'s callers and skip their own `/chat/completions`, so the
     * two paths agree on one interpretation of the same saved value.
     */
    if full_url {
        return Ok(Endpoint {
            url: base,
            header,
            value,
            anthropic,
            gemini_style,
            full_url: true,
        });
    }

    Ok(Endpoint {
        url: format!("{}/models", base),
        header,
        value,
        anthropic,
        gemini_style,
        full_url: false,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
    pub status: Option<u16>,
    pub ms: u64,
}

#[tauri::command(async)]
pub fn test_model_connection(
    state: State<AppState>,
    provider: String,
    base_url: Option<String>,
    full_url: Option<bool>,
) -> ZResult<TestResult> {
    let key = key_for(&state, &provider);

    /*
     * Same rule as `list_models`: a loopback endpoint does not authenticate,
     * so a missing key is not a failure there. Without this, testing a local
     * server reported "No API key for this provider yet" while the server was
     * running and would have answered — a false negative about the user's own
     * machine.
     */
    if key.is_empty() {
        let given = base_url.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let lokal = endpoint_for(&state, &provider, given, full_url, "")
            .map(|ep| endpoint_is_loopback(&ep.url))
            .unwrap_or(false);
        if !lokal {
            return Ok(TestResult {
                ok: false,
                message: "No API key for this provider yet".into(),
                status: None,
                ms: 0,
            });
        }
    }

    let ep = endpoint_for(&state, &provider, base_url.as_deref(), full_url, &key)?;
    let started = std::time::Instant::now();

    let mut req = ureq::get(&ep.url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build();
    /*
     * Send the Authorization header only when there is a token to send.
     *
     * With an empty key every Authorization arm of `endpoint_for` produces the
     * literal `Bearer ` — a trailing space and nothing else. Ollama ignores it,
     * but a stricter front-end (vLLM behind a proxy, say) answers 400, and the
     * reader sees "Server answered 400" for a server that is running and was
     * reachable. That is the exact false negative the loopback-no-key rule
     * exists to remove, so it must not be reintroduced by the header.
     *
     * `list_models` already guards this; the two paths must agree.
     */
    if !ep.value.trim().trim_start_matches("Bearer").trim().is_empty() {
        req = req.header(ep.header, &ep.value);
    }
    if ep.anthropic {
        req = req.header("anthropic-version", "2023-06-01");
    }

    // Every verdict names the URL it is a verdict ABOUT. Without this the user
    // cannot tell a real answer from one produced by a fallback host, which is
    // exactly how "Test connection OK" once coexisted with a chat that 404'd.
    let (ok, status, pesan) = match req.call() {
        Ok(r) => (true, Some(r.status().as_u16()), "Connection OK".to_string()),
        Err(ureq::Error::StatusCode(code)) => (
            false,
            Some(code),
            match code {
                401 | 403 => "API key rejected (401/403) — check the key".to_string(),
                404 => "Endpoint not found (404) — check the base URL".to_string(),
                429 => "Rate limit (429) — the key is valid but currently throttled".to_string(),
                c => format!("Server answered {c}"),
            },
        ),
        Err(e) => (false, None, format!("Cannot reach the server: {e}")),
    };

    Ok(TestResult {
        ok,
        message: format!("{pesan} · {url}", url = ep.url),
        status,
        ms: started.elapsed().as_millis() as u64,
    })
}

/// Is this provider a server on the user's own machine?
///
/// A loopback endpoint does not authenticate. Ollama, LM Studio, llama.cpp's
/// server and vLLM all answer `/v1/models` without a key, so requiring one
/// before the request is even attempted rejected exactly the case the feature
/// exists for: `Refresh` on `local` failed with "No API key for local yet"
/// while the server was running and reachable. The key was never going to be
/// used; it was only being demanded.
///
/// The check is on the ADDRESS, not the provider id, so a `custom` gateway
/// pointed at loopback works too — and a `custom` gateway pointed at a real
/// host still requires its key.
///
/// IPv6 hosts arrive bracketed (`http://[::1]:11434/…`), so the host is taken
/// between brackets when present; splitting on `:` alone would reduce `[::1]`
/// to `[`, which matches nothing.
///
/// Userinfo is removed FIRST. `http://localhost:8080@evil.test/v1` has the
/// authority `localhost:8080@evil.test`, and splitting that on `:` yields
/// `localhost` — so the URL would be classified as loopback while the request
/// actually goes to `evil.test`. Taking the part after the last `@` is what the
/// HTTP spec does, and what an attacker would rely on us not doing.
fn endpoint_is_loopback(url: &str) -> bool {
    let s = url.trim().to_ascii_lowercase();
    let Some(rest) = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
    else {
        return false;
    };
    // Authority ends at the first `/`, and any query/fragment with it.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    // `user:pass@host` — the host is what follows the LAST `@`.
    let authority = authority.rsplit('@').next().unwrap_or("");
    let host = match authority.strip_prefix('[') {
        Some(sisa) => match sisa.split(']').next() {
            Some(h) => h,
            None => return false,
        },
        None => authority.split(':').next().unwrap_or(""),
    };
    matches!(host, "127.0.0.1" | "localhost" | "::1" | "0.0.0.0")
}

#[cfg(test)]
pub fn endpoint_is_loopback_for_test(url: &str) -> bool {
    endpoint_is_loopback(url)
}

/**
 * One row of a provider's `/models` answer.
 *
 * This used to be a bare `Vec<String>` of ids, and that was the reason the
 * model picker could only ever show a name and a context size: everything the
 * gateway said about HOW a model can be used — whether it accepts an image,
 * whether it can call tools, what it costs — was parsed off the JSON and thrown
 * away before it reached the UI.
 *
 * Every field except `id` is `Option`, and the distinction matters: `None` means
 * "this provider did not say", which the picker answers with a name-based guess.
 * An empty `Some(vec![])` would mean "it said no", which is a different claim
 * and must not be invented here.
 */
#[derive(Debug, Clone, Serialize, Default)]
pub struct ModelInfo {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_modalities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_parameters: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_length: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<Map<String, Value>>,
}

#[tauri::command(async)]
pub fn list_models(
    state: State<AppState>,
    provider: String,
    base_url: Option<String>,
    full_url: Option<bool>,
) -> ZResult<Vec<ModelInfo>> {
    /*
     * Resolve the endpoint BEFORE insisting on a key.
     *
     * The old order was the bug: it read the key first and returned early when
     * it was empty, so a local server was never even contacted. Now the
     * endpoint is known first, and a loopback address is allowed through with
     * no key at all — which is what these servers actually require.
     */
    let given = base_url.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let key = key_for(&state, &provider);

    if key.is_empty() {
        // `endpoint_for` is what turns a provider id plus an optional override
        // into a URL. Calling it with an empty key is fine for the local case
        // (the auth header is built, just never sent) and it is what tells us
        // whether this provider is local in the first place.
        let probe = endpoint_for(&state, &provider, given, full_url, "");
        let lokal = match &probe {
            Ok(ep) => endpoint_is_loopback(&ep.url),
            // No endpoint to resolve at all (e.g. `custom` with no base URL).
            // The original error is the useful one, so let it surface.
            Err(_) => false,
        };
        if !lokal {
            return Err(ZephyrError::InvalidInput(format!(
                "No API key for {provider} yet — add one in Settings → AI Models"
            )));
        }
    }

    let ep = endpoint_for(&state, &provider, given, full_url, &key)?;

    /*
     * Send the Authorization header only when there is something to send.
     * `Bearer ` with an empty value is not the same as omitting it: some
     * servers reject the malformed form outright instead of ignoring it.
     */
    let mut req = ureq::get(&ep.url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build();
    if !ep.value.trim().trim_start_matches("Bearer").trim().is_empty() {
        req = req.header(ep.header, &ep.value);
    }
    if ep.anthropic {
        req = req.header("anthropic-version", "2023-06-01");
    }

    let body = req.call().map_err(|e| match e {
        ureq::Error::StatusCode(code) => ZephyrError::InvalidInput(format!(
            "Server answered {code} — check the key and the base URL ({})",
            ep.url
        )),
        e => ZephyrError::InvalidInput(format!("Cannot reach the server {}: {e}", ep.url)),
    })?;

    let json: serde_json::Value = serde_json::from_str(
        &body
            .into_body()
            .read_to_string()
            .map_err(|e| ZephyrError::InvalidInput(format!("Failed to read response: {e}")))?,
    )
    .map_err(|e| ZephyrError::InvalidInput(format!("Response is not JSON: {e}")))?;

    let ids: Vec<ModelInfo> = if ep.gemini_style {
        json.get("models")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let name = m.get("name").and_then(|n| n.as_str())?;
                        let id = name.strip_prefix("models/").unwrap_or(name).to_string();
                        /*
                         * Gemini reports `supportedGenerationMethods` rather
                         * than input modalities. It is not the same thing, so
                         * it is NOT mapped onto `input_modalities` — the UI
                         * falls back to the name heuristic instead of claiming
                         * a capability from a field that does not mean that.
                         */
                        Some(ModelInfo {
                            id,
                            input_modalities: None,
                            supported_parameters: None,
                            context_length: m.get("inputTokenLimit").and_then(|n| n.as_u64()),
                            pricing: None,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        /*
         * Where the list lives, in order of how common the shape is:
         * `data` (OpenAI / OpenRouter), `models` (some gateways reuse the
         * Gemini key name with OpenAI-shaped rows), or a bare top-level
         * array. A gateway that parks its list anywhere else reads as "no
         * models" today; these three cover everything seen in the wild.
         */
        json.get("data")
            .and_then(|v| v.as_array())
            .or_else(|| json.get("models").and_then(|v| v.as_array()))
            .or_else(|| json.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        /* `id` (OpenAI) or `name` (Gemini-style rows that
                           slipped into the non-Gemini branch). */
                        let raw = m
                            .get("id")
                            .or_else(|| m.get("name"))
                            .and_then(|n| n.as_str())?;
                        let id = raw.strip_prefix("models/").unwrap_or(raw).to_string();

                        /*
                         * THREE SHAPES, one per family of gateway.
                         *
                         *  - OpenRouter-style (which `modelrouter.id` speaks):
                         *    `architecture.input_modalities`, `pricing`,
                         *    `context_length`, `supported_parameters`.
                         *  - Ollama / vLLM: sometimes `details.families`, no
                         *    modalities at all.
                         *  - Plain OpenAI: `id` and nothing else.
                         *
                         * Every field is optional on purpose. A gateway that
                         * says nothing must stay "unknown" so the picker can
                         * fall back to the name heuristic instead of reporting
                         * a confident "cannot read images".
                         */
                        let modalities = m
                            .get("architecture")
                            .and_then(|a| a.get("input_modalities"))
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|x| x.as_str().map(str::to_string))
                                    .collect::<Vec<_>>()
                            })
                            .filter(|v| !v.is_empty());

                        let params = m
                            .get("supported_parameters")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|x| x.as_str().map(str::to_string))
                                    .collect::<Vec<_>>()
                            })
                            .filter(|v| !v.is_empty());

                        let pricing = m.get("pricing").and_then(|v| v.as_object()).map(|o| {
                            o.iter()
                                .map(|(k, v)| (k.clone(), v.clone()))
                                .collect::<Map<String, Value>>()
                        });

                        Some(ModelInfo {
                            id,
                            input_modalities: modalities,
                            supported_parameters: params,
                            context_length: m
                                .get("context_length")
                                .and_then(|n| n.as_u64())
                                .or_else(|| {
                                    m.get("top_provider")
                                        .and_then(|t| t.get("context_length"))
                                        .and_then(|n| n.as_u64())
                                }),
                            pricing,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    Ok(ids)
}

#[tauri::command(async)]
pub fn reset_settings(app: tauri::AppHandle, state: State<AppState>) -> ZResult<()> {
    use tauri::Emitter;
    let path = state.file("settings.json");
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let _ = app.emit("settings-changed", json!({ "key": "*" }));
    Ok(())
}

#[cfg(test)]
pub fn roundtrip_for_test(plain: &str) -> (String, Option<String>) {
    let enc = encrypt(plain);
    (enc.clone(), decrypt(&enc))
}

#[cfg(test)]
pub fn preview_for_test(key: &str) -> String {
    preview(key)
}

/// Expose the resolved URL (or the refusal) so a test can pin the exact
/// regression: a `custom` provider must never resolve to OpenAI.
#[cfg(test)]
pub fn endpoint_for_test(provider: &str, base_url: Option<&str>) -> Result<String, String> {
    endpoint_for_core(provider.trim(), base_url, "uji", false)
        .map(|e| e.url)
        .map_err(|e| e.to_string())
}

/// The `fullUrl` variant: the given string IS the endpoint, so `/models` must
/// not be appended to it.
#[cfg(test)]
pub fn endpoint_for_full_test(provider: &str, base_url: Option<&str>) -> Result<String, String> {
    endpoint_for_core(provider.trim(), base_url, "uji", true)
        .map(|e| e.url)
        .map_err(|e| e.to_string())
}
