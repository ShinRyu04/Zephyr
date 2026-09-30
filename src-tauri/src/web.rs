// web.rs — internet access for the agent: search the web and fetch page contents.
//
// WHY in Rust, not in JS: requests from a web page are subject to the
// CORS: DuckDuckGo and most sites reject it, so fetch() in the
// renderer would fail. Requests from the Rust process are not subject to CORS.
//
// WHY ureq: already used by browser.rs to inspect X-Frame-Options headers.
// Adding a second HTTP client (reqwest) would mean adding a whole async TLS stack
// just for two simple requests.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::time::Duration;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Zephyr/1.1.10";
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize)]
pub struct HasilCari {
    pub judul: String,
    pub url: String,
    pub cuplikan: String,
}

/// Ambil isi mentah sebuah URL.
fn ambil(url: &str) -> ZResult<String> {
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "the URL must start with http:// or https://".into(),
        ));
    }
    let resp = ureq::get(u)
        .config()
        .timeout_global(Some(TIMEOUT))
        .build()
        .header("User-Agent", UA)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.9,id;q=0.8")
        .call()
        .map_err(|e| ZephyrError::InvalidInput(format!("the request failed: {e}")))?;

    let status = resp.status().as_u16();
    if !(200..400).contains(&status) {
        return Err(ZephyrError::InvalidInput(format!(
            "server menjawab HTTP {status}"
        )));
    }
    let mut resp = resp;
    resp.body_mut()
        .read_to_string()
        .map_err(|e| ZephyrError::InvalidInput(format!("reading the body failed: {e}")))
}

/**
 * Strip HTML tags and keep the readable text.
 *
 * WHY not a full HTML parser: all that is needed is text to read,
 * model, bukan struktur. Parser penuh (scraper/html5ever) menambah puluhan
 * dependencies for a result that is just as crude. What matters here: drop
 * <script> and <style> WITH their contents: dropping only the tags lets
 * JavaScript leak into the text and flood the answer.
 */
fn teks_dari_html(html: &str) -> String {
    let mut s = html.to_string();

    // Drop blocks whose contents are not meant to be read.
    for (buka, tutup) in [
        ("<script", "</script>"),
        ("<style", "</style>"),
        ("<noscript", "</noscript>"),
        ("<svg", "</svg>"),
        ("<head", "</head>"),
    ] {
        while let Some(i) = s.find(buka) {
            let Some(j) = s[i..].find(tutup) else {
                s.truncate(i);
                break;
            };
            s.replace_range(i..i + j + tutup.len(), " ");
        }
    }

    // Insert a newline at block tags so paragraphs do not run together.
    for t in [
        "</p>",
        "</div>",
        "</li>",
        "</h1>",
        "</h2>",
        "</h3>",
        "</h4>",
        "</h5>",
        "</h6>",
        "<br>",
        "<br/>",
        "<br />",
        "</tr>",
        "</section>",
        "</article>",
    ] {
        s = s.replace(t, "\n");
    }

    // Drop all the remaining tags.
    let mut hasil = String::with_capacity(s.len());
    let mut dalam_tag = false;
    for c in s.chars() {
        match c {
            '<' => dalam_tag = true,
            '>' => dalam_tag = false,
            _ if !dalam_tag => hasil.push(c),
            _ => {}
        }
    }

    // The entities that most often appear on real pages.
    let hasil = hasil
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&hellip;", "…");

    // Tidy up whitespace: runs of blank lines are collapsed, double spaces removed.
    let mut rapi = String::with_capacity(hasil.len());
    let mut kosong = 0;
    for baris in hasil.lines() {
        let b = baris.split_whitespace().collect::<Vec<_>>().join(" ");
        if b.is_empty() {
            kosong += 1;
            if kosong > 1 {
                continue;
            }
        } else {
            kosong = 0;
        }
        rapi.push_str(&b);
        rapi.push('\n');
    }
    rapi.trim().to_string()
}

/// Fetch one page and return just its text.
#[tauri::command(async)]
pub fn web_fetch(url: String, max_chars: Option<usize>) -> ZResult<String> {
    let batas = max_chars.unwrap_or(12_000).clamp(500, 60_000);
    let html = ambil(&url)?;
    let teks = teks_dari_html(&html);
    if teks.is_empty() {
        return Ok("(the page has no readable text)".into());
    }
    if teks.chars().count() > batas {
        let potong: String = teks.chars().take(batas).collect();
        return Ok(format!(
            "{potong}\n\n[... truncated at {batas} characters out of {} total]",
            teks.chars().count()
        ));
    }
    Ok(teks)
}

/**
 * Search the web without an API key.
 *
 * WHY not DuckDuckGo: its certificate expired on 4 June 2026 and has not been
 * renewed, so every HTTPS request to it fails TLS verification on a correctly
 * configured machine. Falling back to HTTP does not help either, because the
 * plain endpoint now redirects to HTTPS.
 *
 * WHY Brave: it returns real results in plain HTML with no API key and no
 * JavaScript, and its certificate is current. Each engine below is tried in
 * order, so a future outage on one does not take search down entirely.
 *
 * WHY the results are read from anchors instead of CSS classes: Brave's class
 * names are hashed and change between deploys. The one stable thing is the
 * outbound link itself, so the parser keys on `href="http..."` and skips
 * Brave's own subdomains.
 */
#[tauri::command(async)]
pub fn web_search(query: String, max_results: Option<usize>) -> ZResult<Vec<HasilCari>> {
    let q = query.trim();
    if q.is_empty() {
        return Err(ZephyrError::InvalidInput("keyword is empty".into()));
    }
    let batas = max_results.unwrap_or(8).clamp(1, 20);
    let param = urlencode(q);

    let mesin = [
        format!("https://search.brave.com/search?q={param}"),
        format!("https://html.duckduckgo.com/html/?q={param}"),
        format!("https://lite.duckduckgo.com/lite/?q={param}"),
    ];

    let mut galat = String::new();
    for url in &mesin {
        match ambil(url) {
            Ok(html) => {
                let hasil = parse_hasil(&html, batas);
                if !hasil.is_empty() {
                    return Ok(hasil);
                }
                galat = format!("{url}: no readable result");
            }
            Err(e) => galat = format!("{url}: {e}"),
        }
    }
    Err(ZephyrError::InvalidInput(format!(
        "all search engines failed — {galat}"
    )))
}

/**
 * Pull result links out of a search results page.
 *
 * A link counts as a result when it is an absolute http(s) URL that does not
 * point back at the search engine itself. Those are filtered by host, because
 * every engine puts its own navigation, ads, and assets in the same anchor
 * list.
 */
fn parse_hasil(html: &str, batas: usize) -> Vec<HasilCari> {
    const LEWAT: &[&str] = &[
        "search.brave.com",
        "cdn.search.brave.com",
        "imgs.search.brave.com",
        "tiles.search.brave.com",
        "brave.com/search",
        "duckduckgo.com",
        "google.com",
        "w3.org",
        "schema.org",
    ];

    let mut hasil: Vec<HasilCari> = Vec::new();
    let mut sudah: std::collections::HashSet<String> = std::collections::HashSet::new();

    for potongan in html.split("href=\"").skip(1) {
        if hasil.len() >= batas {
            break;
        }
        let Some(akhir) = potongan.find('"') else {
            continue;
        };
        let url = &potongan[..akhir];
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            continue;
        }
        if LEWAT.iter().any(|h| url.contains(h)) {
            continue;
        }
        let bersih = url.split('#').next().unwrap_or(url).to_string();
        if !sudah.insert(bersih.clone()) {
            continue;
        }

        // The anchor text sits between this `>` and the matching `</a>`, but
        // only when the tag closes on the same line; otherwise fall back to the
        // URL's own host and path so the entry still says something useful.
        let judul = potongan
            .find('>')
            .and_then(|i| {
                potongan[i + 1..]
                    .find("</a>")
                    .map(|j| &potongan[i + 1..i + 1 + j])
            })
            .map(teks_dari_html)
            .filter(|t| !t.is_empty() && t.len() > 2)
            .unwrap_or_else(|| {
                bersih
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
                    .to_string()
            });

        hasil.push(HasilCari {
            judul,
            url: bersih,
            cuplikan: String::new(),
        });
    }
    hasil
}

/// Percent-encode for query parameters.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
