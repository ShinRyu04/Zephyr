//! API client: the HTTP and GraphQL side of the editor.
//!
//! One request path for everything: a `.http` file, a GraphQL document, or a
//! form the user fills in. Timeout, redirects, body limits and error shaping
//! live here so a feature never has to re-invent them.
//!
//! Secrets are NOT stored here. A request may reference one by its credential
//! id, and the value is read from the credential store at send time, so a token
//! never lands in a saved request file.

use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(30);
const MAKS_BADAN: usize = 2 * 1024 * 1024;
const UA: &str = "Zephyr/1.1.12";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpHeader {
    pub nama: String,
    pub nilai: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpPermintaan {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<HttpHeader>,
    #[serde(default)]
    pub body: Option<String>,
    /// Credential id whose value is sent as `Authorization: Bearer …`.
    #[serde(default)]
    pub bearer_credential: Option<String>,
    /// Credential id sent as the `X-API-Key` header.
    #[serde(default)]
    pub api_key_credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpJawaban {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<HttpHeader>,
    pub body: String,
    pub ms: u64,
    pub dipotong: bool,
}

impl Eq for HttpHeader {}
impl PartialEq for HttpHeader {
    fn eq(&self, other: &Self) -> bool {
        self.nama.eq_ignore_ascii_case(&other.nama)
    }
}

fn ambil_rahasia(app: &tauri::AppHandle, id: &str) -> ZResult<String> {
    use tauri::Manager;
    let state = app
        .try_state::<crate::app_state::AppState>()
        .ok_or_else(|| ZephyrError::Internal("app state is not ready yet".into()))?;
    crate::credentials::credentials_get(state, id.to_string())?.ok_or_else(|| {
        ZephyrError::InvalidInput(format!("credential \"{id}\" is missing or empty"))
    })
}

/// Send one request. `follow_redirects` defaults to true.
#[tauri::command(async)]
pub fn http_request(
    app: tauri::AppHandle,
    req: HttpPermintaan,
    follow_redirects: Option<bool>,
) -> ZResult<HttpJawaban> {
    let url = req.url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "the URL must start with http:// or https://".into(),
        ));
    }

    let mut headers = req.headers.clone();

    // A credential is resolved here, at send time, so the saved request only
    // ever carries an id.
    if let Some(id) = req.bearer_credential.as_deref().filter(|s| !s.trim().is_empty()) {
        headers.push(HttpHeader {
            nama: "Authorization".into(),
            nilai: format!("Bearer {}", ambil_rahasia(&app, id)?),
        });
    }
    if let Some(id) = req.api_key_credential.as_deref().filter(|s| !s.trim().is_empty()) {
        headers.push(HttpHeader {
            nama: "X-API-Key".into(),
            nilai: ambil_rahasia(&app, id)?,
        });
    }

    let mut cfg = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .user_agent(UA)
        .http_status_as_error(false);

    if follow_redirects == Some(false) {
        cfg = cfg.max_redirects(0);
    }
    let agent: ureq::Agent = cfg.build().into();

    let method = req.method.to_uppercase();
    let m = match method.as_str() {
        "GET" => ureq::http::Method::GET,
        "POST" => ureq::http::Method::POST,
        "PUT" => ureq::http::Method::PUT,
        "PATCH" => ureq::http::Method::PATCH,
        "DELETE" => ureq::http::Method::DELETE,
        "HEAD" => ureq::http::Method::HEAD,
        "OPTIONS" => ureq::http::Method::OPTIONS,
        other => {
            return Err(ZephyrError::InvalidInput(format!(
                "method \"{other}\" not recognised"
            )))
        }
    };

    let mulai = std::time::Instant::now();
    // ureq 3 types a request by whether it carries a body, so the with-body and
    // without-body verbs cannot share one binding. Each arm sends its own.
    let resp = match req.body.as_deref() {
        Some(bodi) => {
            // Only the verbs ureq types as carrying a body; DELETE falls through
            // to the empty path when no body is given.
            let mut b = match m {
                ureq::http::Method::POST => agent.post(url),
                ureq::http::Method::PUT => agent.put(url),
                ureq::http::Method::PATCH => agent.patch(url),
                other => {
                    return Err(ZephyrError::InvalidInput(format!(
                        "method \"{other}\" carries no body"
                    )))
                }
            };
            for h in &headers {
                if !h.nama.trim().is_empty() {
                    b = b.header(h.nama.trim(), h.nilai.as_str());
                }
            }
            b.send(bodi.as_bytes())
        }
        None => {
            // ureq types POST/PUT/PATCH as WithBody, so those verbs send an
            // empty body through the same builder instead of the WithoutBody
            // set below.
            let mut b = match m {
                ureq::http::Method::POST => Some(agent.post(url).send_empty()),
                ureq::http::Method::PUT => Some(agent.put(url).send_empty()),
                ureq::http::Method::PATCH => Some(agent.patch(url).send_empty()),
                _ => None,
            };
            match b.take() {
                Some(hasil) => hasil,
                None => {
                    let mut b = match m {
                        ureq::http::Method::GET => agent.get(url),
                        ureq::http::Method::DELETE => agent.delete(url),
                        ureq::http::Method::HEAD => agent.head(url),
                        ureq::http::Method::OPTIONS => agent.options(url),
                        other => {
                            return Err(ZephyrError::InvalidInput(format!(
                                "method \"{other}\" not recognised"
                            )))
                        }
                    };
                    for h in &headers {
                        if !h.nama.trim().is_empty() {
                            b = b.header(h.nama.trim(), h.nilai.as_str());
                        }
                    }
                    b.call()
                }
            }
        }
    }
    .map_err(|e| ZephyrError::InvalidInput(format!("the request failed: {e}")))?;

    let ms = mulai.elapsed().as_millis() as u64;
    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let headers_out: Vec<HttpHeader> = resp
        .headers()
        .iter()
        .map(|(k, v)| HttpHeader {
            nama: k.as_str().to_string(),
            nilai: v.to_str().unwrap_or("").to_string(),
        })
        .collect();

    let mut resp = resp;
    let mut teks = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| ZephyrError::InvalidInput(format!("reading the body failed: {e}")))?;

    // A runaway response would freeze the UI; cut it and say so.
    let dipotong = teks.len() > MAKS_BADAN;
    if dipotong {
        teks.truncate(MAKS_BADAN);
    }

    Ok(HttpJawaban {
        status,
        status_text,
        headers: headers_out,
        body: teks,
        ms,
        dipotong,
    })
}

/// Wrap a GraphQL document as the POST a server expects.
#[tauri::command(async)]
pub fn graphql_body(query: String, variables: Option<String>) -> ZResult<String> {
    let vars: serde_json::Value = match variables.as_deref().map(str::trim) {
        Some("") | None => serde_json::json!({}),
        Some(v) => serde_json::from_str(v)
            .map_err(|e| ZephyrError::InvalidInput(format!("variables bukan JSON: {e}")))?,
    };
    serde_json::to_string(&serde_json::json!({
        "query": query,
        "variables": vars,
    }))
    .map_err(|e| ZephyrError::Internal(format!("graphql body: {e}")))
}

/// True when the response body looks like a GraphQL error envelope, so the UI
/// can surface it as an error even though the HTTP status was 200.
#[tauri::command(async)]
pub fn graphql_errors(body: String) -> ZResult<Vec<String>> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) else {
        return Ok(Vec::new());
    };
    let Some(arr) = v.get("errors").and_then(|e| e.as_array()) else {
        return Ok(Vec::new());
    };
    Ok(arr
        .iter()
        .map(|e| {
            e.get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown GraphQL error")
                .to_string()
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graphql_body_membungkus_query() {
        let b = graphql_body("{ hello }".into(), None).unwrap();
        let v: serde_json::Value = serde_json::from_str(&b).unwrap();
        assert_eq!(v["query"], "{ hello }");
        assert!(v["variables"].is_object());
    }

    #[test]
    fn graphql_body_menerima_variabel() {
        let b = graphql_body("query($a:Int){x}".into(), Some(r#"{"a":1}"#.into())).unwrap();
        let v: serde_json::Value = serde_json::from_str(&b).unwrap();
        assert_eq!(v["variables"]["a"], 1);
    }

    #[test]
    fn graphql_body_menolak_variabel_rusak() {
        assert!(graphql_body("q".into(), Some("bukan json".into())).is_err());
    }

    #[test]
    fn graphql_errors_terbaca() {
        let e = graphql_errors(r#"{"errors":[{"message":"boom"}]}"#.into()).unwrap();
        assert_eq!(e, vec!["boom".to_string()]);
        assert!(graphql_errors(r#"{"data":{}}"#.into()).unwrap().is_empty());
        assert!(graphql_errors("bukan json".into()).unwrap().is_empty());
    }
}
