use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagHit {
    pub content: String,
    pub source_file: String,
    pub score: f64,
}

#[derive(Debug, Deserialize)]
struct RagResponse {
    #[serde(default)]
    results: Vec<RagResultEntry>,
}

#[derive(Debug, Deserialize)]
struct RagResultEntry {
    content: String,
    #[serde(default)]
    score: f64,
    #[serde(default)]
    meta: RagMeta,
}

#[derive(Debug, Deserialize, Default)]
struct RagMeta {
    #[serde(default)]
    source_file: String,
}

#[tauri::command(async)]
pub fn rag_search(
    base_url: String,
    project: String,
    query: String,
    k: u32,
) -> ZResult<Vec<RagHit>> {
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "RAG base URL harus diawali http:// atau https://".into(),
        ));
    }
    if project.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("RAG project belum diisi".into()));
    }
    if query.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("Pertanyaan kosong".into()));
    }
    let k = k.clamp(1, 20);

    let url = format!("{base}/api/search");
    let payload = serde_json::json!({
        "project_id": project,
        "query": query,
        "k": k,
    });

    let req = ureq::post(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(6)))
        .build()
        .header("Content-Type", "application/json");

    let resp = req
        .send_json(&payload)
        .map_err(|e| map_rag_err(&e, &base))?;

    let body = resp
        .into_body()
        .read_to_string()
        .map_err(|e| ZephyrError::Rag(format!("Respons RAG tidak terbaca: {e}")))?;

    let parsed: RagResponse = serde_json::from_str(&body)
        .map_err(|e| ZephyrError::Rag(format!("Respons RAG bukan JSON valid: {e}")))?;

    Ok(parsed
        .results
        .into_iter()
        .map(|r| RagHit {
            content: r.content,
            source_file: r.meta.source_file,
            score: r.score,
        })
        .collect())
}

fn map_rag_err(e: &ureq::Error, base: &str) -> ZephyrError {
    match e {
        ureq::Error::StatusCode(code) => {
            ZephyrError::Rag(format!("Server RAG menjawab HTTP {code} (query ditolak?)"))
        }
        other => ZephyrError::Rag(format!(
            "Server RAG di {base} tidak bisa dihubungi: {other}"
        )),
    }
}
