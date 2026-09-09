// ai.rs — proxy chat AI (fase 09).
//
// Kenapa lewat Rust, bukan fetch dari frontend:
//   1. API key TIDAK PERNAH sampai ke webview (AGENTS.md §4, ARCHITECTURE.md §7.2).
//   2. WebView2 tunduk CORS; endpoint provider tidak mengirim header CORS.
//
// Alur:
//   ai_chat   -> spawn thread, buka koneksi streaming, emit `ai-chunk`
//                { id, text? } berkali-kali lalu { id, done: true }.
//                Error -> { id, err }.
//   ai_cancel -> set flag batal; thread berhenti membaca, emit done.
//
// Tiga format request berbeda ditangani modul adapter terpisah
// (adapters/openai.rs, anthropic.rs, gemini.rs): body + header + cara
// memotong potongan SSE tidak sama antar provider.

use crate::adapters;
use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// Satu pesan chat. `role`: 'user' | 'assistant' | 'system'.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

/// Satu panggilan tool yang diminta model (mode agent).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub args: Value,
}

/// Pesan untuk loop agent — role 'tool' membawa hasil eksekusi tool.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AgentMsg {
    /// 'user' | 'assistant' | 'system' | 'tool'
    pub role: String,
    pub content: String,
    /// role='tool' → id tool_call yang dijawab
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// role='assistant' yang berisi panggilan tool
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// role='tool' → nama tool (dipakai Gemini functionResponse)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Skema satu tool yang dikirim ke model.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

/// Jawaban non-streaming mode agent: teks + panggilan tool (bila ada).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolResult {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    /// true = model selesai (tidak ada tool call lagi)
    pub done: bool,
}

/// Hasil siap-kirim dari adapter: URL, header, body JSON.
pub struct Prepared {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
    /// true = jawaban datang sebagai SSE `data: {...}`;
    /// false = stream JSON array (Gemini streamGenerateContent).
    pub sse: bool,
}

fn emit_chunk(app: &AppHandle, payload: Value) {
    let _ = app.emit("ai-chunk", payload);
}

/// Pesan error yang ramah + tidak pernah memuat API key.
fn friendly(status: u16) -> String {
    match status {
        400 => "Permintaan ditolak (400) — model atau isi pesan tidak valid".into(),
        401 | 403 => "API key salah/kadaluarsa (401) — perbarui di Settings → Model AI".into(),
        404 => "Model tidak ditemukan (404) — periksa nama model & base URL".into(),
        413 => "Pesan terlalu besar (413) — kurangi lampiran file".into(),
        429 => "Rate limit (429) — tunggu sebentar lalu coba lagi".into(),
        500..=599 => format!("Server provider bermasalah ({status}) — coba lagi nanti"),
        s => format!("Provider menjawab {s}"),
    }
}

/// Mulai satu permintaan chat streaming.
///
/// `id` dipilih frontend (dipakai untuk mencocokkan event & membatalkan).
#[tauri::command(async)]
pub fn ai_chat(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    provider: String,
    model: String,
    messages: Vec<ChatMsg>,
    base_url: Option<String>,
    max_tokens: Option<u32>,
) -> ZResult<()> {
    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id kosong".into()));
    }
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada pesan".into()));
    }

    // Key dibaca DI SINI (bukan di frontend) dan tidak pernah keluar dari Rust.
    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let prepared = adapters::prepare(
        &provider,
        &model,
        &messages,
        base_url.as_deref(),
        &key,
        max_tokens.unwrap_or(2048),
    )?;

    let cancel = state.ai_begin(&id);
    let handle = app.clone();
    let req_id = id.clone();
    let prov = provider.clone();

    std::thread::spawn(move || {
        // FASE 16.3: Agent dengan konfigurasi eksplisit + `max_retries(0)`.
        // Tanpa ini ureq mengulang percobaan koneksi yang gagal, sehingga
        // timeout_connect 10s berlipat jadi ~25-35s dan UI terasa menggantung.
        // Untuk streaming AI retry otomatis juga salah secara semantik: request
        // pertama bisa sudah sampai ke provider dan menagih token.
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(10)))
            // Streaming bisa lama; batasi waktu MENUNGGU header saja, bukan
            // total durasi, supaya jawaban panjang tidak terputus di tengah.
            .timeout_recv_response(Some(std::time::Duration::from_secs(30)))
            // FASE 16.3: `timeout_connect` SENDIRI tidak cukup di Windows —
            // terbukti host yang men-drop paket tetap memakan ~38s karena
            // percobaan koneksi berulang di lapisan bawah. `timeout_per_call`
            // membatasi SELURUH fase permintaan sampai header diterima, jadi
            // user offline mendapat pesan dalam ~12s, bukan setengah menit.
            // Ini TIDAK memotong streaming: batasnya berlaku sampai respons
            // header, bukan sampai body selesai dibaca.
            .timeout_per_call(Some(std::time::Duration::from_secs(12)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }

        let resp = match req.send_json(&prepared.body) {
            Ok(r) => r,
            Err(e) => {
                // Pesan ramah untuk kasus paling sering: tidak ada internet /
                // host tidak bisa dihubungi. Teks mentah ureq ("dns error",
                // "connection refused") tidak berarti apa-apa bagi user.
                let teks = e.to_string();
                let low = teks.to_lowercase();
                let pesan = if low.contains("dns")
                    || low.contains("resolve")
                    || low.contains("connect")
                    || low.contains("timed out")
                    || low.contains("timeout")
                    || low.contains("refused")
                    || low.contains("unreachable")
                {
                    format!(
                        "Tidak bisa menghubungi provider — periksa koneksi internet \
                         atau Base URL di Settings → Model AI ({teks})"
                    )
                } else {
                    format!("Tidak bisa menghubungi provider: {teks}")
                };
                emit_chunk(&handle, json!({ "id": req_id, "err": pesan }));
                return;
            }
        };

        let status = resp.status().as_u16();
        if status >= 400 {
            // Ambil detail pesan provider bila ada (aman: tidak memuat key).
            let mut body = resp.into_body();
            let raw: String = body.read_to_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&raw)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            let msg = if detail.is_empty() {
                friendly(status)
            } else {
                format!("{} — {}", friendly(status), detail)
            };
            emit_chunk(&handle, json!({ "id": req_id, "err": msg }));
            return;
        }

        let reader = BufReader::new(resp.into_body().into_reader());
        let mut sent_any = false;
        let mut buf_line = String::new();
        let mut reader = reader;

        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            buf_line.clear();
            match reader.read_line(&mut buf_line) {
                Ok(0) => break, // EOF
                Ok(_) => {}
                Err(e) => {
                    emit_chunk(
                        &handle,
                        json!({ "id": req_id, "err": format!("stream terputus: {e}") }),
                    );
                    break;
                }
            }

            let line = buf_line.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                continue;
            }

            // SSE: hanya baris "data: ..." yang berisi payload.
            let payload = if prepared.sse {
                match line.strip_prefix("data:") {
                    Some(rest) => rest.trim(),
                    None => continue,
                }
            } else {
                // Gemini stream = JSON array yang dipecah per baris; buang
                // pembungkus array dan koma pemisah.
                line.trim_start_matches([',', '[']).trim_end_matches(']')
            };
            if payload.is_empty() || payload == "[DONE]" {
                if payload == "[DONE]" {
                    break;
                }
                continue;
            }

            let v: Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(_) => continue, // potongan tak lengkap / komentar keep-alive
            };
            if let Some(text) = adapters::extract_delta(&prov, &v) {
                if !text.is_empty() {
                    sent_any = true;
                    emit_chunk(&handle, json!({ "id": req_id, "text": text }));
                }
            }
        }

        if !sent_any && !cancel.load(Ordering::Relaxed) {
            emit_chunk(
                &handle,
                json!({ "id": req_id, "err": "Provider tidak mengirim teks apa pun" }),
            );
        }
        emit_chunk(&handle, json!({ "id": req_id, "done": true }));
    });

    let _ = state; // state hanya dipakai sebelum thread (key + registry)
    Ok(())
}

/// Batalkan permintaan yang sedang berjalan. Aman dipanggil untuk id
/// yang sudah selesai (tidak error).
#[tauri::command(async)]
pub fn ai_cancel(state: State<AppState>, id: String) -> ZResult<bool> {
    Ok(state.ai_cancel(&id))
}

/// Satu langkah loop agent: kirim seluruh riwayat + tools,
/// dapatkan jawaban NON-streaming berisi teks dan/atau panggilan tool.
/// Frontend yang memutuskan loop (jalankan tool → append hasil → ulang).
#[tauri::command]
pub async fn ai_tool_chat(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    messages: Vec<AgentMsg>,
    tools: Vec<ToolSpec>,
    base_url: Option<String>,
    max_tokens: Option<u32>,
) -> ZResult<AiToolResult> {
    if messages.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada pesan".into()));
    }
    // Key dibaca DI SINI (sama seperti ai_chat) — tidak pernah ke frontend.
    let key = crate::secrets::key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let prepared = adapters::prepare_tools(
        &provider,
        &model,
        &messages,
        &tools,
        base_url.as_deref(),
        &key,
        max_tokens.unwrap_or(2048),
    )?;
    let prov = provider.clone();

    // Panggilan HTTP blocking di thread terpisah supaya command lain tidak
    // ikut tertahan. Timeout per call 60s — cukup untuk reasoning model.
    let hasil = tokio::task::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(std::time::Duration::from_secs(10)))
            .timeout_per_call(Some(std::time::Duration::from_secs(60)))
            .max_redirects(3)
            .http_status_as_error(false)
            .build()
            .into();
        let mut req = agent.post(&prepared.url);
        for (k, v) in &prepared.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        match req.send_json(&prepared.body) {
            Ok(r) => {
                let status = r.status().as_u16();
                let mut body = r.into_body();
                let raw: String = body.read_to_string().unwrap_or_default();
                Ok::<(u16, String), String>((status, raw))
            }
            Err(e) => {
                let teks = e.to_string();
                let low = teks.to_lowercase();
                let pesan = if low.contains("dns")
                    || low.contains("resolve")
                    || low.contains("connect")
                    || low.contains("timed out")
                    || low.contains("timeout")
                    || low.contains("refused")
                    || low.contains("unreachable")
                {
                    format!(
                        "Tidak bisa menghubungi provider — periksa koneksi internet \
                         atau Base URL di Settings → Model AI ({teks})"
                    )
                } else {
                    format!("Tidak bisa menghubungi provider: {teks}")
                };
                Err(pesan)
            }
        }
    })
    .await
    .map_err(|e| ZephyrError::Internal(format!("thread panik: {e}")))?;

    let (status, raw) = hasil.map_err(ZephyrError::InvalidInput)?;
    if status >= 400 {
        // Detail pesan provider bila ada (aman: tidak memuat key).
        let detail = serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        let msg = if detail.is_empty() {
            friendly(status)
        } else {
            format!("{} — {}", friendly(status), detail)
        };
        return Err(ZephyrError::InvalidInput(msg));
    }

    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| ZephyrError::InvalidInput(format!("jawaban provider tidak valid: {e}")))?;
    Ok(adapters::parse_tool_response(&prov, &v))
}
