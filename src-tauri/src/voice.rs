/*
 * Voice input: turning recorded audio into text.
 *
 * WHY this lives in Rust rather than the WebView.
 *
 * The panel needs dictation, and the browser's own recogniser
 * (`SpeechRecognition`) is exposed by WebView2 but not served by it - it calls a
 * Google endpoint the embedded runtime cannot reach, so it fires `start`, then
 * `error`, and records nothing. The microphone itself is granted and works
 * (`getUserMedia` returns a live track), so the fix is to record locally and
 * transcribe over the API key the user already configured for chat.
 *
 * Providers differ enough that this is an adapter, not a single call:
 *
 * - OpenAI-compatible (`/audio/transcriptions`, multipart): OpenAI, Groq,
 *   DeepSeek-compatible gateways, and anything else that follows the shape.
 * - Gemini: inline audio in a `generateContent` request, which is a JSON body
 *   rather than a file upload.
 *
 * Anthropic has no transcription endpoint at all, so it is reported as
 * unsupported instead of being sent a request that cannot work.
 */

use base64::Engine;
use serde_json::{json, Value};
use std::io::Read;
use tauri::State;

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Audio larger than this is refused before any request is made. A minute of
/// Opus is under a megabyte; ten megabytes is a runaway recording, and sending
/// it would burn the user's quota on a call that is almost certainly a mistake.
const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;

struct Audio {
    bytes: Vec<u8>,
    mime: String,
}

/*
 * The incoming data URL is `data:<mime>;base64,<payload>`.
 *
 * The MIME type is taken from the URL rather than assumed: MediaRecorder emits
 * `audio/webm` in Chromium and `audio/ogg` elsewhere, and the transcription
 * endpoint sniffs the container to pick a decoder. Sending the wrong type gets
 * a confident, wrong transcript rather than an error.
 */
fn parse_data_url(data_url: &str) -> ZResult<Audio> {
    let sisa = data_url
        .strip_prefix("data:")
        .ok_or_else(|| ZephyrError::InvalidInput("audio is not a data URL".into()))?;
    let (meta, b64) = sisa
        .split_once(',')
        .ok_or_else(|| ZephyrError::InvalidInput("audio data URL has no payload".into()))?;
    if !meta.contains("base64") {
        return Err(ZephyrError::InvalidInput(
            "audio data URL must be base64 encoded".into(),
        ));
    }
    let mime = meta.split(';').next().unwrap_or("audio/webm").to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| ZephyrError::InvalidInput(format!("audio is not valid base64: {e}")))?;
    if bytes.is_empty() {
        return Err(ZephyrError::InvalidInput("recording is empty".into()));
    }
    if bytes.len() > MAX_AUDIO_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "recording is too long ({} MB) — try a shorter one",
            bytes.len() / (1024 * 1024)
        )));
    }
    Ok(Audio { bytes, mime })
}

/*
 * OpenAI's shape: multipart form with `file`, `model`, and the language hint.
 *
 * The body is assembled by hand because `ureq`'s JSON helper cannot express
 * multipart, and the boundary is a fixed constant rather than a random one - it
 * only has to not appear in the payload, and audio bytes are not text.
 */
fn host_lokal(url: &str) -> bool {
    let u = url.to_lowercase();
    u.contains("127.0.0.1") || u.contains("localhost") || u.contains("[::1]")
}

/* Ollama runs on the user's own machine, so it needs no key and has its own
   address. Both are applied here rather than in the settings UI: a user who
   picks Ollama should never be asked for a key that does not exist, and the
   default address is a property of the provider, not something to retype. */
const OLLAMA_BASE: &str = "http://localhost:11434/v1";

fn base_suara(provider: &str, base_url: Option<&String>) -> String {
    if provider == "ollama" {
        let dari_user = base_url.map(|b| b.trim()).filter(|b| !b.is_empty());
        return match dari_user {
            Some(b) => b.to_string(),
            None => OLLAMA_BASE.to_string(),
        };
    }
    base_url
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string())
}

fn key_suara(state: &AppState, provider: &str) -> String {
    let khusus = format!("{provider}-voice");
    let k = crate::secrets::key_for(state, &khusus);
    if !k.is_empty() {
        return k;
    }
    crate::secrets::key_for(state, provider)
}

fn galat_audio(jenis: &str, status: u16, isi: &str) -> String {
    if status == 401 || status == 403 {
        return format!("{jenis} ditolak (HTTP {status}): key provider tidak berlaku untuk endpoint audio — isi key suara di Settings");
    }
    let cuplikan: String = isi.chars().take(160).collect();
    format!("{jenis} gagal (HTTP {status}): {cuplikan}")
}

fn transcribe_openai_compatible(
    url: &str,
    key: &str,
    model: &str,
    lang: Option<&str>,
    audio: &Audio,
) -> Result<String, String> {
    const BATAS: &str = "----zephyr-voice-boundary";

    let mut body: Vec<u8> = Vec::with_capacity(audio.bytes.len() + 1024);
    let push = |body: &mut Vec<u8>, s: &str| body.extend_from_slice(s.as_bytes());

    push(&mut body, &format!("--{BATAS}\r\n"));
    push(
        &mut body,
        "Content-Disposition: form-data; name=\"file\"; filename=\"voice.webm\"\r\n",
    );
    push(&mut body, &format!("Content-Type: {}\r\n\r\n", audio.mime));
    body.extend_from_slice(&audio.bytes);
    push(&mut body, "\r\n");

    push(&mut body, &format!("--{BATAS}\r\n"));
    push(&mut body, "Content-Disposition: form-data; name=\"model\"\r\n\r\n");
    push(&mut body, model);
    push(&mut body, "\r\n");

    if let Some(l) = lang {
        push(&mut body, &format!("--{BATAS}\r\n"));
        push(
            &mut body,
            "Content-Disposition: form-data; name=\"language\"\r\n\r\n",
        );
        push(&mut body, l);
        push(&mut body, "\r\n");
    }

    push(&mut body, &format!("--{BATAS}--\r\n"));

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(90)))
        .timeout_per_call(Some(std::time::Duration::from_secs(120)))
        .http_status_as_error(false)
        .build()
        .into();

    let resp = agent
        .post(url)
        .header("Authorization", &format!("Bearer {key}"))
        .header(
            "Content-Type",
            &format!("multipart/form-data; boundary={BATAS}"),
        )
        .send(&body)
        .map_err(|e| format!("could not reach the transcription endpoint: {e}"))?;

    let status = resp.status().as_u16();
    let teks = resp
        .into_body()
        .read_to_string()
        .map_err(|e| format!("could not read the response: {e}"))?;

    if status >= 400 {
        return Err(galat_audio("transkrip", status, &teks));
    }

    let v: Value = serde_json::from_str(&teks)
        .map_err(|_| format!("unexpected transcription response: {teks}"))?;
    v.get("text")
        .and_then(|t| t.as_str())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| format!("no text in the transcription response: {teks}"))
}

/*
 * Gemini's shape: the audio is inline data in a normal `generateContent` call.
 *
 * There is no transcription endpoint on this API, so the prompt does the work -
 * and it is written to return ONLY the transcript, because a chatty model here
 * would put its own commentary into the user's message box.
 */
fn transcribe_gemini(
    url: &str,
    key: &str,
    model: &str,
    audio: &Audio,
) -> Result<String, String> {
    let b64 = base64::engine::general_purpose::STANDARD.encode(&audio.bytes);
    let body = json!({
        "contents": [{
            "parts": [
                { "text": "Transcribe this audio exactly as spoken. Return only the transcript, with no commentary, no quotes and no formatting." },
                { "inline_data": { "mime_type": audio.mime, "data": b64 } }
            ]
        }]
    });

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(90)))
        .timeout_per_call(Some(std::time::Duration::from_secs(120)))
        .http_status_as_error(false)
        .build()
        .into();

    let resp = agent
        .post(url)
        .header("x-goog-api-key", key)
        .send_json(&body)
        .map_err(|e| format!("could not reach the transcription endpoint: {e}"))?;

    let status = resp.status().as_u16();
    let teks = resp
        .into_body()
        .read_to_string()
        .map_err(|e| format!("could not read the response: {e}"))?;

    if status >= 400 {
        return Err(galat_audio("transkrip", status, &teks));
    }

    let v: Value = serde_json::from_str(&teks)
        .map_err(|_| format!("unexpected transcription response: {teks}"))?;
    let out = v
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(|t| t.as_str())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| format!("no text in the transcription response: {teks}"))?;
    let _ = model;
    Ok(out)
}

/// Transcribe a recorded clip with the provider the user already configured.
#[tauri::command]
pub fn ai_transcribe(
    state: State<AppState>,
    provider: String,
    model: Option<String>,
    base_url: Option<String>,
    audio: String,
    lang: Option<String>,
) -> ZResult<String> {
    let audio = parse_data_url(&audio)?;
    let key = key_suara(&state, &provider);
    let bahasa = lang.as_deref().filter(|s| !s.is_empty());

    /* A local server needs no key. A cloud one does, and saying so beats
    sending an empty Authorization header and reporting the 401 as a bug. */
    let base_mentah = base_suara(&provider, base_url.as_ref());
    if key.is_empty() && !host_lokal(&base_mentah) {
        return Err(ZephyrError::InvalidInput(format!(
            "No API key for {provider} yet — add one in Settings → AI Models"
        )));
    }

    let hasil = match provider.as_str() {
        "gemini" => {
            let m = model.unwrap_or_else(|| "gemini-2.0-flash".into());
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
            );
            transcribe_gemini(&url, &key, &m, &audio)
        }
        "anthropic" => Err(
            "Anthropic has no transcription endpoint — pick another provider for dictation"
                .to_string(),
        ),
        "groq" => {
            let m = model.unwrap_or_else(|| "whisper-large-v3".into());
            transcribe_openai_compatible(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                &key,
                &m,
                bahasa,
                &audio,
            )
        }
        "openai" => {
            let m = model.unwrap_or_else(|| "whisper-1".into());
            transcribe_openai_compatible(
                "https://api.openai.com/v1/audio/transcriptions",
                &key,
                &m,
                bahasa,
                &audio,
            )
        }
        /*
         * Everything else is assumed OpenAI-compatible, which is the safe
         * default: the providers this app ships all expose the same
         * `/audio/transcriptions` shape, and a custom endpoint that does not
         * will say so in its own error.
         *
         * The base URL comes from the CALLER, exactly as it does for chat
         * (`ai_tool_chat` takes it as an argument). Rust does not read it out of
         * settings itself: the frontend already resolves the active model's
         * endpoint, and duplicating that lookup here would mean two places to
         * keep in step every time a provider is added.
         */
        _ => {
            let m = model.unwrap_or_else(|| "whisper-1".into());
            let url = format!("{}/audio/transcriptions", base_mentah.trim_end_matches('/'));
            transcribe_openai_compatible(&url, &key, &m, bahasa, &audio)
        }
    };

    hasil.map_err(ZephyrError::InvalidInput)
}

fn tts_openai_compatible(
    url: &str,
    key: &str,
    model: &str,
    voice: &str,
    teks: &str,
) -> Result<Vec<u8>, String> {
    let body = serde_json::json!({
        "model": model,
        "input": teks,
        "voice": voice,
        "response_format": "mp3",
    });
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(90)))
        .timeout_per_call(Some(std::time::Duration::from_secs(120)))
        .http_status_as_error(false)
        .build()
        .into();
    let resp = agent
        .post(url)
        .header("Authorization", &format!("Bearer {key}"))
        .send_json(&body)
        .map_err(|e| format!("could not reach the speech endpoint: {e}"))?;
    let status = resp.status().as_u16();
    let mut buf: Vec<u8> = Vec::new();
    resp.into_body()
        .into_reader()
        .read_to_end(&mut buf)
        .map_err(|e| format!("could not read the response: {e}"))?;
    if status >= 400 {
        let cuplikan = String::from_utf8_lossy(&buf[..buf.len().min(300)]).to_string();
        return Err(galat_audio("suara", status, &cuplikan));
    }
    Ok(buf)
}

fn tts_model_default(provider: &str) -> &'static str {
    match provider {
        "openai" => "gpt-4o-mini-tts",
        "groq" => "playai-tts",
        _ => "tts-1",
    }
}

/// 54 presets, the real Kokoro list. Local TTS servers that offer no voice
/// catalogue are almost always Kokoro-shaped, so this is what the user gets to
/// pick from instead of OpenAI's five aliases - which no local server accepts.
fn daftar_voice_kokoro() -> Vec<Value> {
    [
        ("af_heart", "en-US", "American female, warm (default)"),
        ("af_bella", "en-US", "American female, expressive"),
        ("af_nicole", "en-US", "American female, friendly"),
        ("af_nova", "en-US", "American female, clear"),
        ("af_sky", "en-US", "American female, neutral"),
        ("af_alloy", "en-US", "American female, balanced"),
        ("af_aoede", "en-US", "American female"),
        ("af_jessica", "en-US", "American female, energetic"),
        ("af_kore", "en-US", "American female"),
        ("af_river", "en-US", "American female, calm"),
        ("af_sarah", "en-US", "American female, conversational"),
        ("am_adam", "en-US", "American male, deep"),
        ("am_michael", "en-US", "American male, clear"),
        ("am_echo", "en-US", "American male, neutral"),
        ("am_eric", "en-US", "American male, authoritative"),
        ("am_fenrir", "en-US", "American male, distinctive"),
        ("am_liam", "en-US", "American male, conversational"),
        ("am_onyx", "en-US", "American male, rich"),
        ("am_puck", "en-US", "American male, expressive"),
        ("am_santa", "en-US", "American male, warm"),
        ("bf_emma", "en-GB", "British female, clear"),
        ("bf_isabella", "en-GB", "British female, warm"),
        ("bf_alice", "en-GB", "British female, crisp"),
        ("bf_lily", "en-GB", "British female, soft"),
        ("bm_george", "en-GB", "British male, authoritative"),
        ("bm_lewis", "en-GB", "British male, smooth"),
        ("bm_daniel", "en-GB", "British male, calm"),
        ("bm_fable", "en-GB", "British male, expressive"),
        ("jf_alpha", "ja-JP", "Japanese female"),
        ("jf_gongitsune", "ja-JP", "Japanese female"),
        ("jf_nezumi", "ja-JP", "Japanese female"),
        ("jf_tebukuro", "ja-JP", "Japanese female"),
        ("jm_kumo", "ja-JP", "Japanese male"),
        ("zf_xiaobei", "zh-CN", "Mandarin female"),
        ("zf_xiaoni", "zh-CN", "Mandarin female"),
        ("zf_xiaoxiao", "zh-CN", "Mandarin female"),
        ("zf_xiaoyi", "zh-CN", "Mandarin female"),
        ("zm_yunjian", "zh-CN", "Mandarin male"),
        ("zm_yunxi", "zh-CN", "Mandarin male"),
        ("zm_yunxia", "zh-CN", "Mandarin male"),
        ("zm_yunyang", "zh-CN", "Mandarin male"),
        ("ef_dora", "es-ES", "Spanish female"),
        ("em_alex", "es-ES", "Spanish male"),
        ("em_santa", "es-ES", "Spanish male"),
        ("ff_siwis", "fr-FR", "French female"),
        ("hf_alpha", "hi-IN", "Hindi female"),
        ("hf_beta", "hi-IN", "Hindi female"),
        ("hm_omega", "hi-IN", "Hindi male"),
        ("hm_psi", "hi-IN", "Hindi male"),
        ("if_sara", "it-IT", "Italian female"),
        ("im_nicola", "it-IT", "Italian male"),
        ("pf_dora", "pt-BR", "Brazilian Portuguese female"),
        ("pm_alex", "pt-BR", "Brazilian Portuguese male"),
        ("pm_santa", "pt-BR", "Brazilian Portuguese male"),
    ]
    .iter()
    .map(|(id, lang, ket)| json!({ "id": id, "nama": id, "lang": lang, "keterangan": ket }))
    .collect()
}

/// OpenAI's real speech voices. There is no OpenAI `/audio/voices` endpoint, so
/// this list cannot be fetched - it is the documented set.
fn daftar_voice_openai() -> Vec<Value> {
    [
        ("alloy", "Balanced, neutral"),
        ("ash", "Warm, conversational"),
        ("ballad", "Soft, lyrical"),
        ("coral", "Bright, friendly"),
        ("echo", "Steady, clear"),
        ("fable", "Expressive, storyteller"),
        ("nova", "Energetic, youthful"),
        ("onyx", "Deep, authoritative"),
        ("sage", "Calm, measured"),
        ("shimmer", "Bright, airy"),
        ("verse", "Versatile, natural"),
    ]
    .iter()
    .map(|(id, ket)| json!({ "id": id, "nama": id, "lang": "en-US", "keterangan": ket }))
    .collect()
}

/// Fallback for a provider whose catalogue cannot be read. Which list is right
/// depends on where the endpoint lives: a user pointing at 127.0.0.1 is running
/// their own server, and handing them OpenAI voice names - which every local
/// engine rejects - is worse than useless.
fn daftar_voice_default(base: &str) -> Vec<Value> {
    if host_lokal(base) {
        daftar_voice_kokoro()
    } else {
        daftar_voice_openai()
    }
}

/// Speak text with the active provider's neural TTS. Returns MP3 as a data URL.
#[tauri::command]
pub fn ai_speak(
    state: State<AppState>,
    provider: String,
    model: Option<String>,
    base_url: Option<String>,
    voice: Option<String>,
    teks: String,
) -> ZResult<String> {
    let bersih = teks.trim();
    if bersih.is_empty() {
        return Err(ZephyrError::InvalidInput("nothing to speak".into()));
    }
    if bersih.chars().count() > 4000 {
        return Err(ZephyrError::InvalidInput(
            "answer is too long for one speech call (4000 chars)".into(),
        ));
    }
    let key = key_suara(&state, &provider);
    let base = base_suara(&provider, base_url.as_ref());
    /* Same rule as transcription: no key is fine on a local server, an error on a cloud one. */
    if key.is_empty() && !host_lokal(&base) {
        return Err(ZephyrError::InvalidInput(format!(
            "No API key for {provider} yet — add one in Settings → AI Models"
        )));
    }
    let m = model.unwrap_or_else(|| tts_model_default(&provider).into());
    let suara = voice.unwrap_or_else(|| "alloy".into());
    let url = if provider == "openai" || base.trim_end_matches('/').ends_with("openai.com/v1") {
        "https://api.openai.com/v1/audio/speech".to_string()
    } else {
        format!("{}/audio/speech", base.trim_end_matches('/'))
    };
    let mp3 = tts_openai_compatible(&url, &key, &m, &suara, bersih).map_err(ZephyrError::InvalidInput)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&mp3);
    Ok(format!("data:audio/mpeg;base64,{b64}"))
}

/// List neural voices for the active provider.
///
/// Three things this used to get wrong, all of which made the picker lie:
///
///  * A key was required to ask at all, so a local server - which has no key -
///    was never queried. Its own catalogue is the best list there is, and asking
///    is free. The call now goes out whenever we have an address, key or not,
///    and a server that refuses simply falls back.
///  * The base URL came only from the caller, so the user's Voice server URL was
///    ignored here even though `ai_speak` honours it. The picker listed one
///    server's voices while speech went to another.
///  * The fallback was OpenAI's five aliases for everyone. A local engine rejects
///    those names outright, so the user picked a voice that could never work.
///
/// The OpenAI host is skipped deliberately: it has no `/audio/voices` endpoint,
/// so the request could only ever 404 before reaching the same fallback.
#[tauri::command]
pub fn ai_tts_voices(
    state: State<AppState>,
    provider: String,
    base_url: Option<String>,
) -> ZResult<Vec<Value>> {
    let key = key_suara(&state, &provider);
    let base = base_suara(&provider, base_url.as_ref());
    let dasar = base.trim_end_matches('/').to_string();
    if dasar.ends_with("api.openai.com/v1") {
        return Ok(daftar_voice_openai());
    }
    if key.is_empty() && !host_lokal(&base) {
        return Ok(daftar_voice_default(&base));
    }
    let url = format!("{dasar}/audio/voices");
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(10)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .into();
    let hasil: Result<Vec<Value>, String> = (|| {
        let mut req = agent.get(&url);
        if !key.is_empty() {
            req = req.header("Authorization", &format!("Bearer {key}"));
        }
        let resp = req.call().map_err(|e| format!("no voices endpoint: {e}"))?;
        if resp.status().as_u16() >= 400 {
            return Err("gateway has no voices endpoint".to_string());
        }
        let teks = resp
            .into_body()
            .read_to_string()
            .map_err(|e| format!("could not read the response: {e}"))?;
        let v: Value =
            serde_json::from_str(&teks).map_err(|_| "unexpected voices response".to_string())?;
        let arr = v
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .or_else(|| v.as_array().cloned())
            .ok_or_else(|| "no voices in the response".to_string())?;
        Ok(arr
            .iter()
            .filter_map(|e| {
                /* Servers that do publish a catalogue do not agree on field
                   names: OpenAI-style uses `id`, others use `name`, `voice` or
                   `voice_id`, and some carry a language or a human note. Read all
                   of them rather than rendering a list of blanks. */
                let id = ["id", "name", "voice", "voice_id"]
                    .iter()
                    .find_map(|k| e.get(*k).and_then(|x| x.as_str()))
                    .filter(|s| !s.is_empty())?;
                let lang = e
                    .get("lang")
                    .or_else(|| e.get("language"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                let ket = e
                    .get("description")
                    .or_else(|| e.get("keterangan"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                Some(json!({"id": id, "nama": id, "lang": lang, "keterangan": ket}))
            })
            .collect())
    })();
    Ok(hasil.unwrap_or_else(|_| daftar_voice_default(&base)))
}

