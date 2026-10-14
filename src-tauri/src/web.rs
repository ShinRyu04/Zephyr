// web.rs — internet access for the agent: search the web and fetch page contents.
//
// WHY in Rust, not in JS: requests from a web page are subject to the
// CORS: DuckDuckGo and most sites reject it, so fetch() in the
// renderer would fail. Requests from the Rust process are not subject to CORS.
//
// WHY ureq: already used by browser.rs to inspect X-Frame-Options headers.
// Adding a second HTTP client (reqwest) would mean adding a whole async TLS stack
// just for two simple requests.
//
// Berkas ini juga rumah LANTAI BERSAMA untuk pane browser (browser_pane.rs):
// `periksa_url_pane` (gerbang skema/host SEBELUM webview dibuat) dan
// `langkah_redirect` (batas hop redirect + periksa ulang tiap hop) dipakai pane.
// Angka pagar duduk di konstanta di bawah supaya tidak tersebar dan bisa
// dicerminkan/diverifikasi oleh `scripts/uji-pane-browser.mjs`.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

/// Angka pagar (rujukan tunggal; dicerminkan + diverifikasi oleh
/// `scripts/uji-pane-browser.mjs` dan dirujuk `docs/USULAN-PANE-BROWSER.md` §0).
/// Bodi dibaca paling banyak `BATAS_BYTE_BAWAAN`; permintaan eksplisit di-clamp
/// ke `BATAS_BYTE_MAKS` supaya tidak ada jalur "tanpa batas".
pub const BATAS_BYTE_BAWAAN: usize = 2 * 1024 * 1024; // 2_097_152 byte (2 MiB)
pub const BATAS_BYTE_MAKS: usize = 8 * 1024 * 1024; // 8_388_608 byte (8 MiB)
/// Jumlah maksimum hop redirect yang boleh diikuti (tiap hop diperiksa ulang).
pub const BATAS_HOP_REDIRECT: u32 = 5;
/// Port yang sah untuk keluar. Sama dengan lantai port yang sudah ada.
pub const PORT_SAH: [u16; 2] = [80, 443];

/// Batas byte yang dipakai untuk membaca bodi.
///
/// WHY clamp dua arah: `None` harus berarti "bawaan" (BUKAN "tanpa batas"), dan
/// nilai yang diminta pemanggil tidak boleh melewati batas keras — kalau tidak,
/// satu argumen cukup untuk mengisi RAM sebelum lapisan TS memotong keluaran.
pub fn batas_byte_dipakai(diminta: Option<usize>) -> usize {
    match diminta {
        None => BATAS_BYTE_BAWAAN,
        Some(d) => d.clamp(BATAS_BYTE_BAWAAN, BATAS_BYTE_MAKS),
    }
}

/// Satu-satunya daftar alamat yang tidak boleh dihubungi.
///
/// WHY fungsi, bukan closure di dalam satu jalur: jalur `web_fetch` dan jalur
/// pane browser harus memakai lantai yang SAMA. Dua salinan daftar menyimpang
/// dengan sendirinya (satu jalur ditambal, yang lain tidak).
pub fn ip_terlarang(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.is_loopback()
                || v.is_private()
                || v.is_link_local()
                || v.is_unspecified()
                || v.is_broadcast()
                || v.is_documentation()
                || v.octets()[0] == 100 && (64..=127).contains(&v.octets()[1])
        }
        IpAddr::V6(v) => {
            v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || v.is_unique_local()
                || v.is_unicast_link_local()
                || v.to_ipv4_mapped().is_some_and(|mapped| {
                    mapped.is_loopback()
                        || mapped.is_private()
                        || mapped.is_link_local()
                        || mapped.is_unspecified()
                        || mapped.is_broadcast()
                        || (mapped.octets()[0] == 100 && (64..=127).contains(&mapped.octets()[1]))
                })
        }
    }
}

/// Validate an outbound URL before opening a socket. DNS results are checked
/// too, so a public hostname cannot be used to reach a private address.
pub fn validate_outbound_url(url: &str) -> ZResult<ureq::http::Uri> {
    let parsed: ureq::http::Uri = url
        .trim()
        .parse()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid URL: {e}")))?;
    match parsed.scheme_str() {
        Some("http") | Some("https") => {}
        _ => {
            return Err(ZephyrError::InvalidInput(
                "URL must use http:// or https://".into(),
            ))
        }
    }
    let host = parsed
        .host()
        .ok_or_else(|| ZephyrError::InvalidInput("URL has no host".into()))?;
    let port = parsed
        .port_u16()
        .unwrap_or(if parsed.scheme_str() == Some("https") {
            443
        } else {
            80
        });
    if !PORT_SAH.contains(&port) {
        return Err(ZephyrError::InvalidInput(format!(
            "URL port {port} is not allowed"
        )));
    }
    // Satu-satunya sumber lantai alamat sekarang `ip_terlarang` (dipakai jalur
    // pane juga), supaya daftar alamat terlarang tidak bercabang dua.
    let is_blocked = ip_terlarang;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked(ip) {
            return Err(ZephyrError::InvalidInput(
                "URL resolves to a blocked address".into(),
            ));
        }
    } else {
        let lower = host.trim_end_matches('.').to_ascii_lowercase();
        if lower == "localhost" || lower.ends_with(".localhost") || lower.ends_with(".local") {
            return Err(ZephyrError::InvalidInput(
                "localhost names are not allowed".into(),
            ));
        }
        let addrs = (host, port).to_socket_addrs().map_err(|e| {
            ZephyrError::InvalidInput(format!("could not resolve URL host {host}: {e}"))
        })?;
        let mut found = false;
        for addr in addrs {
            found = true;
            if is_blocked(addr.ip()) {
                return Err(ZephyrError::InvalidInput(
                    "URL resolves to a blocked address".into(),
                ));
            }
        }
        if !found {
            return Err(ZephyrError::InvalidInput(format!(
                "could not resolve URL host {host}"
            )));
        }
    }
    Ok(parsed)
}

/// Gerbang URL untuk PANE BROWSER — dipanggil SEBELUM webview atau socket apa
/// pun dibuat (`browser_pane_open`, `browser_pane_nav`, dan setiap navigasi di
/// dalam webview lewat `WebviewBuilder::on_navigation`).
///
/// Yang ditolak di sini (tanpa syarat, tanpa menunggu allowlist per-domain):
///   1. skema di luar `http`/`https` — `file:`, `javascript:`, `data:`,
///      `about:` tertutup sebelum webview lahir;
///   2. userinfo (`user@host`) — trik menaruh host yang tampak sah di depan host
///      sungguhan (`contoh.com` lalu `jahat.com`) ditolak apa pun hostnya;
///   3. host yang menunjuk langsung ke IP privat/link-local/loopback
///      (`127.0.0.1`, `169.254.169.254` endpoint metadata, `10.x`, `::1`) dan
///      nama lokal (`localhost`, `*.localhost`, `*.local`);
///   4. port di luar 80/443.
///
/// WHY TANPA DNS: gerbang ini berjalan tepat sebelum webview dibuat dan pada
/// SETIAP event navigasi di dalamnya; resolusi DNS di sana bisa menggantung,
/// gagal karena jaringan pengguna, atau memanggil jaringan untuk URL yang toh
/// ditolak. Karena itu arah "hostname publik yang menunjuk IP privat" tidak
/// tertangkap di sini dan tetap dijaga di jalur fetch oleh
/// `validate_outbound_url` — batas ini dicatat apa adanya di
/// `docs/LAPORAN-PANE-BROWSER-TAMBAL.md`, bukan diklaim tertutup.
pub fn periksa_url_pane(url: &str) -> ZResult<tauri::Url> {
    let s = url.trim();
    if s.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "URL kosong: pane browser hanya menerima http:// atau https://".into(),
        ));
    }
    let u: tauri::Url = s
        .parse()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid URL: {e}")))?;

    let skema = u.scheme();
    if skema != "http" && skema != "https" {
        return Err(ZephyrError::InvalidInput(format!(
            "the URL must start with http:// or https:// (skema `{skema}:` ditolak)"
        )));
    }

    // Userinfo diperiksa SEBELUM host: `https://contoh.com<at>jahat.com/` punya
    // host sungguhan `jahat.com`, jadi tanpa pemeriksaan ini host yang tampak sah
    // akan menipu allowlist mana pun (termasuk allowlist Settings §security nanti).
    if !u.username().is_empty() || u.password().is_some() {
        return Err(ZephyrError::InvalidInput(
            "URL memuat userinfo (user@host) — trik penyamaran host ditolak".into(),
        ));
    }

    let host = u
        .host_str()
        .ok_or_else(|| ZephyrError::InvalidInput("URL has no host".into()))?;
    // `host_str()` pada IPv6 memberi tanda kurung (`[::1]`), jadi dilepas dulu —
    // tanpa itu `"[::1]".parse::<IpAddr>()` gagal dan loopback lolos seolah
    // "hostname biasa".
    let host_telanjang = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host_telanjang.parse::<IpAddr>() {
        if ip_terlarang(ip) {
            return Err(ZephyrError::InvalidInput(format!(
                "host {host} menunjuk alamat privat/link-local — ditolak"
            )));
        }
    } else {
        let bawah = host.trim_end_matches('.').to_ascii_lowercase();
        if bawah == "localhost" || bawah.ends_with(".localhost") || bawah.ends_with(".local") {
            return Err(ZephyrError::InvalidInput(format!(
                "nama host lokal {host} ditolak"
            )));
        }
    }

    let port = u.port_or_known_default().unwrap_or(0);
    if !PORT_SAH.contains(&port) {
        return Err(ZephyrError::InvalidInput(format!(
            "URL port {port} is not allowed (hanya 80/443)"
        )));
    }
    Ok(u)
}

/// Satu langkah redirect: gabungkan `location` dengan `dasar`, lalu periksa ULANG
/// seluruh lantai (`validate_outbound_url`: skema, port, host/IP, DNS) SEBELUM
/// hop itu diikuti. `hop_selesai` = jumlah hop yang sudah dilalui.
///
/// WHY per-hop: memeriksa hanya URL awal adalah pagar palsu — satu server yang
/// sah sudah cukup untuk mengarahkan permintaan ke `http://169.254.169.254/`
/// atau ke skema lain. `BATAS_HOP_REDIRECT` memutus rantai redirect tak berujung.
pub fn langkah_redirect(dasar: &str, location: &str, hop_selesai: u32) -> ZResult<tauri::Url> {
    if hop_selesai >= BATAS_HOP_REDIRECT {
        return Err(ZephyrError::InvalidInput(format!(
            "batas {BATAS_HOP_REDIRECT} hop redirect terlampaui"
        )));
    }
    let basis: tauri::Url = dasar
        .parse()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid base URL: {e}")))?;
    let tujuan = basis
        .join(location.trim())
        .map_err(|e| ZephyrError::InvalidInput(format!("Location tidak sah: {e}")))?;
    validate_outbound_url(tujuan.as_str())?;
    Ok(tujuan)
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Zephyr/1.1.10";
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize)]
pub struct HasilCari {
    pub judul: String,
    pub url: String,
    pub cuplikan: String,
}

/// Ambil isi mentah sebuah URL dengan batas byte bawaan.
fn ambil(url: &str) -> ZResult<String> {
    ambil_batas(url, batas_byte_dipakai(None))
}

/// Ambil isi mentah sebuah URL — bodi dibaca TERBATAS dan redirect diikuti
/// paling banyak `BATAS_HOP_REDIRECT` hop, dengan pemeriksaan ulang tiap hop.
///
/// WHY `take()` dan bukan `read_to_string()`: versi lama membaca sampai server
/// selesai, jadi server yang mengirim aliran panjang mengisi RAM — aturan "bodi
/// terbatas" hanya hidup di lapisan TS, bukan di tempat byte-nya mendarat.
/// `take(batas + 1)` memberi tahu LEBIH DULU bahwa bodi melewati batas, lalu
/// permintaan ditolak dengan angka batas yang jelas.
fn ambil_batas(url: &str, batas_byte: usize) -> ZResult<String> {
    let batas = batas_byte.clamp(1, BATAS_BYTE_MAKS);
    let mut sekarang = validate_outbound_url(url)?.to_string();
    let mut hop: u32 = 0;
    loop {
        let resp = ureq::get(sekarang.as_str())
            .config()
            .timeout_global(Some(TIMEOUT))
            .max_redirects(0)
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

        // Redirect tidak diikuti klien (max_redirects 0) melainkan di sini: tiap
        // lompatan dihitung, dan targetnya diperiksa ulang lewat
        // `langkah_redirect` sebelum diikuti.
        if (300..400).contains(&status) {
            let lokasi = resp
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let Some(lokasi) = lokasi else {
                return Err(ZephyrError::InvalidInput(format!(
                    "server menjawab HTTP {status} tanpa header Location"
                )));
            };
            let tujuan = langkah_redirect(&sekarang, &lokasi, hop)?;
            hop += 1;
            sekarang = tujuan.to_string();
            continue;
        }

        if !(200..300).contains(&status) {
            return Err(ZephyrError::InvalidInput(format!(
                "server menjawab HTTP {status}"
            )));
        }

        let mut resp = resp;
        let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);
        let dibaca = resp
            .body_mut()
            .as_reader()
            .take(batas as u64 + 1)
            .read_to_end(&mut buf)
            .map_err(|e| ZephyrError::InvalidInput(format!("reading the body failed: {e}")))?;
        if dibaca > batas {
            return Err(ZephyrError::InvalidInput(format!(
                "bodi melebihi batas {batas} byte (bawaan {BATAS_BYTE_BAWAAN}, maks {BATAS_BYTE_MAKS})"
            )));
        }
        return Ok(String::from_utf8_lossy(&buf).into_owned());
    }
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
    // Permintaan karakter diterjemahkan ke batas byte (UTF-8 paling buruk = 4
    // byte/karakter) lalu di-clamp: bawaan 2 MiB, tidak pernah lebih dari 8 MiB.
    let batas_byte = batas_byte_dipakai(Some(batas.saturating_mul(4)));
    let html = ambil_batas(&url, batas_byte)?;
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

#[cfg(test)]
mod tests {
    use super::{
        batas_byte_dipakai, ip_terlarang, langkah_redirect, periksa_url_pane,
        validate_outbound_url, BATAS_BYTE_BAWAAN, BATAS_BYTE_MAKS, BATAS_HOP_REDIRECT, PORT_SAH,
    };

    #[test]
    fn outbound_url_rejects_private_and_local_addresses() {
        for url in [
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://[::1]/",
            "http://169.254.169.254/",
        ] {
            assert!(validate_outbound_url(url).is_err(), "{url} must be blocked");
        }
    }

    #[test]
    fn outbound_url_rejects_non_http_and_suspicious_ports() {
        assert!(validate_outbound_url("file:///etc/passwd").is_err());
        assert!(validate_outbound_url("https://127.0.0.1:8080/").is_err());
    }

    #[test]
    fn angka_batas_konsisten() {
        assert_eq!(BATAS_BYTE_BAWAAN, 2_097_152);
        assert_eq!(BATAS_BYTE_MAKS, 8_388_608);
        assert_eq!(BATAS_HOP_REDIRECT, 5);
        assert_eq!(PORT_SAH, [80, 443]);
    }

    #[test]
    fn batas_byte_bawaan_dan_clamp() {
        assert_eq!(batas_byte_dipakai(None), BATAS_BYTE_BAWAAN);
        assert_eq!(batas_byte_dipakai(Some(1)), BATAS_BYTE_BAWAAN);
        assert_eq!(batas_byte_dipakai(Some(BATAS_BYTE_MAKS)), BATAS_BYTE_MAKS);
        // Permintaan di atas batas keras TIDAK boleh diteruskan apa adanya.
        assert_eq!(batas_byte_dipakai(Some(999 * 1024 * 1024)), BATAS_BYTE_MAKS);
    }

    #[test]
    fn lantai_ip_satu_sumber() {
        for s in ["127.0.0.1", "169.254.169.254", "10.0.0.5", "::1", "0.0.0.0"] {
            let ip: std::net::IpAddr = s.parse().expect("ip uji");
            assert!(ip_terlarang(ip), "{s} harus terlarang");
        }
        let publik: std::net::IpAddr = "93.184.216.34".parse().expect("ip uji");
        assert!(!ip_terlarang(publik));
    }

    #[test]
    fn gerbang_pane_menolak_skema_terlarang() {
        for url in [
            "file:///C:/Windows/System32/drivers/etc/hosts",
            "javascript:alert(1)",
            "data:text/html,<h1>x</h1>",
            "about:blank",
            "ftp://contoh.com/x",
        ] {
            assert!(
                periksa_url_pane(url).is_err(),
                "{url} harus ditolak sebelum webview dibuat"
            );
        }
    }

    #[test]
    fn gerbang_pane_menolak_host_privat_link_local_dan_nama_lokal() {
        for url in [
            "http://127.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.5/",
            "http://172.16.0.1/",
            "http://192.168.1.1/",
            "http://[::1]/",
            "http://localhost/",
            "http://pane.local/",
        ] {
            assert!(periksa_url_pane(url).is_err(), "{url} harus ditolak");
        }
    }

    #[test]
    fn gerbang_pane_menolak_trik_userinfo() {
        // Dirangkai supaya tidak ada literal userinfo utuh di dalam kode.
        let url = format!("https://contoh.com{}jahat.com/x", "@");
        assert!(
            periksa_url_pane(&url).is_err(),
            "userinfo harus ditolak walau host depannya tampak sah"
        );
    }

    #[test]
    fn gerbang_pane_menolak_port_tak_lazim_dan_menerima_url_publik() {
        assert!(periksa_url_pane("https://contoh.com:31337/x").is_err());
        let ok = periksa_url_pane("https://contoh.com/halaman");
        assert!(ok.is_ok(), "URL publik wajib diterima");
        assert_eq!(ok.expect("url sah").host_str(), Some("contoh.com"));
    }

    #[test]
    fn langkah_redirect_menolak_hop_di_atas_batas() {
        let err = langkah_redirect(
            "https://contoh.com/a",
            "https://contoh.com/b",
            BATAS_HOP_REDIRECT,
        );
        assert!(
            err.is_err(),
            "hop ke-{} harus ditolak",
            BATAS_HOP_REDIRECT + 1
        );
    }

    #[test]
    fn langkah_redirect_memeriksa_ulang_setiap_hop() {
        // Location menuju endpoint metadata cloud dan skema file: wajib ditolak.
        assert!(langkah_redirect("https://contoh.com/a", "http://169.254.169.254/", 0).is_err());
        assert!(langkah_redirect("https://contoh.com/a", "file:///etc/passwd", 0).is_err());
        assert!(langkah_redirect("https://contoh.com/a", "http://127.0.0.1:9000/", 0).is_err());
    }

    #[test]
    fn langkah_redirect_menerima_hop_publik() {
        // IP literal publik: tidak memanggil DNS, jadi uji ini tanpa jaringan.
        let ok = langkah_redirect("https://93.184.216.34/a", "/b", 0);
        assert!(ok.is_ok());
        assert_eq!(ok.expect("hop sah").as_str(), "https://93.184.216.34/b");
    }
}
