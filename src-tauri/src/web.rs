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
/// Plafon KERAS hop redirect: `hopRedirect` setelan tidak pernah melewati ini.
pub const HOP_REDIRECT_MAKS: u32 = 10;
/// Port yang sah untuk keluar. Sama dengan lantai port yang sudah ada.
pub const PORT_SAH: [u16; 2] = [80, 443];
/// Endpoint metadata instans cloud (IPv4). SELALU ditolak, walau jaringan lokal
/// dibuka: alamat ini bukan "jaringan lokal pengguna", ia kredensial instans.
pub const IP_METADATA_V4: [u8; 4] = [169, 254, 169, 254];
/// Endpoint metadata instans cloud (IPv6).
pub const IP_METADATA_V6: std::net::Ipv6Addr = std::net::Ipv6Addr::new(0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254);

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

/// Kebijakan jaringan-lokal yang dibaca dari setelan (`zeph-buka-jaringan-lokal`).
///
/// WHY struct, bukan argumen terpisah: keempat fungsi gerbang (fetch, pane,
/// redirect) harus memakai pagar yang SAMA; satu struct membuat "lupa
/// meneruskan satu setelan" menjadi kesalahan tipe, bukan bug diam-diam.
///
/// Default = AMAN: jaringan lokal tertutup, port 80/443, hop 5.
#[derive(Clone, Debug)]
pub struct KebijakanJaringan {
    /// `izinJaringanLokal` (default `false`). Saat `true`, loopback/privat/
    /// link-local/CGNAT dan `*.local`/`*.localhost` boleh dijangkau — KECUALI
    /// endpoint metadata cloud yang tetap ditolak.
    pub izin_jaringan_lokal: bool,
    /// `hopRedirect` (default `BATAS_HOP_REDIRECT`, di-clamp `HOP_REDIRECT_MAKS`).
    pub hop_redirect: u32,
    /// `portWeb` (default `PORT_SAH`). Selalu memuat 80 dan 443.
    pub port_sah: Vec<u16>,
}

impl Default for KebijakanJaringan {
    fn default() -> Self {
        Self {
            izin_jaringan_lokal: false,
            hop_redirect: BATAS_HOP_REDIRECT,
            port_sah: PORT_SAH.to_vec(),
        }
    }
}

impl KebijakanJaringan {
    /// Hop redirect BERLAKU: di-clamp ke `[1, HOP_REDIRECT_MAKS]`.
    pub fn hop_dipakai(&self) -> u32 {
        self.hop_redirect.clamp(1, HOP_REDIRECT_MAKS)
    }

    /// Baca kebijakan dari setelan JSON (`read_settings_value`). Field yang
    /// tidak ada / salah tipe dibaca sebagai default AMAN (fail-closed), jadi
    /// pemasangan setelan tidak pernah bisa MEMBUKA pagar secara tak sengaja.
    pub fn dari_setelan(setelan: &serde_json::Value) -> Self {
        let b = |k: &str| setelan.get(k).and_then(|v| v.as_bool());
        let hop = setelan
            .get("hopRedirect")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32)
            .unwrap_or(BATAS_HOP_REDIRECT);
        let mut port_sah = PORT_SAH.to_vec();
        if let Some(arr) = setelan.get("portWeb").and_then(|v| v.as_array()) {
            for p in arr {
                if let Some(n) = p.as_u64() {
                    if (1..=65535).contains(&n) {
                        let n = n as u16;
                        if !port_sah.contains(&n) {
                            port_sah.push(n);
                        }
                    }
                }
            }
        }
        Self {
            izin_jaringan_lokal: b("izinJaringanLokal").unwrap_or(false),
            hop_redirect: hop.clamp(1, HOP_REDIRECT_MAKS),
            port_sah,
        }
    }

    /// Port sah BERLAKU: selalu memuat 80/443; entri duplikat/tak sah dibuang.
    pub fn port_dipakai(&self) -> Vec<u16> {
        let mut out: Vec<u16> = PORT_SAH.to_vec();
        for p in &self.port_sah {
            if *p != 0 && !out.contains(p) {
                out.push(*p);
            }
        }
        out
    }

    /// Port ini boleh keluar?
    pub fn port_diizinkan(&self, port: u16) -> bool {
        self.port_dipakai().contains(&port)
    }
}

/// Alamat metadata cloud? Selalu dilarang, walau jaringan lokal dibuka.
pub fn is_metadata(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.octets() == IP_METADATA_V4,
        IpAddr::V6(v) => v == IP_METADATA_V6,
    }
}

/// Alamat yang tetap dilarang WALAU jaringan lokal dibuka: unspecified,
/// broadcast, multicast, dan blok dokumentasi. Ini bukan "jaringan pengguna" —
/// tidak ada server sah di sana, jadi membukanya hanya menambah permukaan.
fn ip_selalu_dilarang(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.is_unspecified()
                || v.is_broadcast()
                || v.is_multicast()
                || v.is_documentation()
                || v.octets() == [255, 255, 255, 255]
        }
        IpAddr::V6(v) => v.is_unspecified() || v.is_multicast(),
    }
}

/// Lantai alamat BERLAKU. Urutannya:
///   1. metadata cloud SELALU dilarang;
///   2. jaringan lokal tertutup -> `ip_terlarang` penuh;
///   3. jaringan lokal terbuka -> hanya blok yang memang tidak punya server sah.
pub fn ip_terlarang_dengan(ip: IpAddr, izin_jaringan_lokal: bool) -> bool {
    if is_metadata(ip) {
        return true;
    }
    if izin_jaringan_lokal {
        ip_selalu_dilarang(ip)
    } else {
        ip_terlarang(ip)
    }
}

/// Satu-satunya daftar alamat yang tidak boleh dihubungi.
///
/// WHY fungsi, bukan closure di dalam satu jalur: jalur `web_fetch` dan jalur
/// pane browser harus memakai lantai yang SAMA. Dua salinan daftar menyimpang
/// dengan sendirinya (satu jalur ditambal, yang lain tidak).
///
/// Ini lantai BAWAAN (jaringan lokal tertutup). Untuk lantai yang menghormati
/// `izinJaringanLokal`, pakai `ip_terlarang_dengan`.
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
///
/// Ini gerbang BAWAAN (jaringan lokal tertutup). Untuk gerbang yang menghormati
/// `izinJaringanLokal`/`portWeb`, pakai `validate_outbound_url_dengan`.
pub fn validate_outbound_url(url: &str) -> ZResult<ureq::http::Uri> {
    validate_outbound_url_dengan(url, &KebijakanJaringan::default())
}

/// Seperti `validate_outbound_url`, tetapi menghormati kebijakan jaringan-lokal:
///   - `izin_jaringan_lokal` membuka loopback/privat/link-local/CGNAT dan
///     `*.local`/`*.localhost`; `169.254.169.254` TETAP ditolak;
///   - `portWeb` memperluas port yang sah (80/443 selalu sah);
///   - `hopRedirect` dipakai `langkah_redirect`, bukan di sini.
pub fn validate_outbound_url_dengan(
    url: &str,
    kb: &KebijakanJaringan,
) -> ZResult<ureq::http::Uri> {
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
    if !kb.port_diizinkan(port) {
        return Err(ZephyrError::InvalidInput(format!(
            "URL port {port} is not allowed"
        )));
    }
    let izin = kb.izin_jaringan_lokal;
    // Satu-satunya sumber lantai alamat sekarang `ip_terlarang_dengan` (dipakai
    // jalur pane juga), supaya daftar alamat terlarang tidak bercabang dua.
    if let Ok(ip) = host.parse::<IpAddr>() {
        if ip_terlarang_dengan(ip, izin) {
            return Err(ZephyrError::InvalidInput(
                "URL resolves to a blocked address".into(),
            ));
        }
    } else {
        let lower = host.trim_end_matches('.').to_ascii_lowercase();
        if !izin
            && (lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".local"))
        {
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
            if ip_terlarang_dengan(addr.ip(), izin) {
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
    periksa_url_pane_dengan(url, &KebijakanJaringan::default())
}

/// Seperti `periksa_url_pane`, tetapi menghormati kebijakan jaringan-lokal:
/// `izin_jaringan_lokal` membuka IP privat/link-local/loopback dan nama lokal
/// (`localhost`, `*.localhost`, `*.local`); `portWeb` memperluas port yang sah;
/// `169.254.169.254` TETAP ditolak. Skema terlarang dan userinfo tetap ditolak
/// tanpa syarat — tidak ada setelan yang membukanya.
pub fn periksa_url_pane_dengan(url: &str, kb: &KebijakanJaringan) -> ZResult<tauri::Url> {
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
    let izin = kb.izin_jaringan_lokal;
    if let Ok(ip) = host_telanjang.parse::<IpAddr>() {
        if ip_terlarang_dengan(ip, izin) {
            return Err(ZephyrError::InvalidInput(format!(
                "host {host} menunjuk alamat privat/link-local — ditolak"
            )));
        }
    } else {
        let bawah = host.trim_end_matches('.').to_ascii_lowercase();
        if !izin
            && (bawah == "localhost"
                || bawah.ends_with(".localhost")
                || bawah.ends_with(".local"))
        {
            return Err(ZephyrError::InvalidInput(format!(
                "nama host lokal {host} ditolak"
            )));
        }
    }

    let port = u.port_or_known_default().unwrap_or(0);
    if !kb.port_diizinkan(port) {
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
    langkah_redirect_dengan(dasar, location, hop_selesai, &KebijakanJaringan::default())
}

/// Seperti `langkah_redirect`, tetapi plafon hop dan lantai alamat mengikuti
/// `kb` (`hopRedirect` di-clamp `HOP_REDIRECT_MAKS`; `izinJaringanLokal`
/// melonggarkan IP privat/nama lokal, tapi TIDAK membuka `169.254.169.254`).
pub fn langkah_redirect_dengan(
    dasar: &str,
    location: &str,
    hop_selesai: u32,
    kb: &KebijakanJaringan,
) -> ZResult<tauri::Url> {
    let batas_hop = kb.hop_dipakai();
    if hop_selesai >= batas_hop {
        return Err(ZephyrError::InvalidInput(format!(
            "batas {batas_hop} hop redirect terlampaui"
        )));
    }
    let basis: tauri::Url = dasar
        .parse()
        .map_err(|e| ZephyrError::InvalidInput(format!("invalid base URL: {e}")))?;
    let tujuan = basis
        .join(location.trim())
        .map_err(|e| ZephyrError::InvalidInput(format!("Location tidak sah: {e}")))?;
    validate_outbound_url_dengan(tujuan.as_str(), kb)?;
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
    ambil_batas_dengan(url, batas_byte, &KebijakanJaringan::default())
}

/// Seperti `ambil_batas`, tetapi lantai URL dan plafon hop mengikuti `kb`
/// (`izinJaringanLokal`, `portWeb`, `hopRedirect`). Inilah jalur yang dipakai
/// `web_fetch` setelah setelan `zeph-buka-jaringan-lokal` dipasang.
fn ambil_batas_dengan(url: &str, batas_byte: usize, kb: &KebijakanJaringan) -> ZResult<String> {
    let batas = batas_byte.clamp(1, BATAS_BYTE_MAKS);
    let mut sekarang = validate_outbound_url_dengan(url, kb)?.to_string();
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
            let tujuan = langkah_redirect_dengan(&sekarang, &lokasi, hop, kb)?;
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
pub fn web_fetch(
    state: tauri::State<crate::app_state::AppState>,
    url: String,
    max_chars: Option<usize>,
) -> ZResult<String> {
    let batas = max_chars.unwrap_or(12_000).clamp(500, 60_000);
    // Permintaan karakter diterjemahkan ke batas byte (UTF-8 paling buruk = 4
    // byte/karakter) lalu di-clamp: bawaan 2 MiB, tidak pernah lebih dari 8 MiB.
    let batas_byte = batas_byte_dipakai(Some(batas.saturating_mul(4)));
    // Kebijakan jaringan-lokal dibaca dari setelan yang berlaku (`zeph-buka-
    // jaringan-lokal`). Tanpa setelan = default AMAN (jaringan lokal tertutup).
    let kb = KebijakanJaringan::dari_setelan(&crate::settings::read_settings_value(&state));
    let html = ambil_batas_dengan(&url, batas_byte, &kb)?;
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
pub fn web_search(
    state: tauri::State<crate::app_state::AppState>,
    query: String,
    max_results: Option<usize>,
) -> ZResult<Vec<HasilCari>> {
    let q = query.trim();
    if q.is_empty() {
        return Err(ZephyrError::InvalidInput("keyword is empty".into()));
    }
    let batas = max_results.unwrap_or(8).clamp(1, 20);
    let param = urlencode(q);

    // Mesin pencari ini selalu publik (80/443), tapi tetap melewati gerbang
    // yang sama dengan `web_fetch`: `portWeb`/`hopRedirect`/`izinJaringanLokal`
    // tidak boleh punya dua wajah yang berbeda.
    let kb = KebijakanJaringan::dari_setelan(&crate::settings::read_settings_value(&state));

    let mesin = [
        format!("https://search.brave.com/search?q={param}"),
        format!("https://html.duckduckgo.com/html/?q={param}"),
        format!("https://lite.duckduckgo.com/lite/?q={param}"),
    ];

    let mut galat = String::new();
    for url in &mesin {
        match ambil_batas_dengan(url, batas_byte_dipakai(None), &kb) {
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
        batas_byte_dipakai, ip_terlarang, ip_terlarang_dengan, is_metadata, langkah_redirect,
        langkah_redirect_dengan, periksa_url_pane, periksa_url_pane_dengan, validate_outbound_url,
        validate_outbound_url_dengan, KebijakanJaringan, BATAS_BYTE_BAWAAN, BATAS_BYTE_MAKS,
        BATAS_HOP_REDIRECT, HOP_REDIRECT_MAKS, PORT_SAH,
    };
    use std::net::IpAddr;

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

    /* ------------------------------------------------------------------ */
    /* zeph-buka-jaringan-lokal: bukti on/off tiap setelan                */
    /* ------------------------------------------------------------------ */

    fn kb_lokal() -> KebijakanJaringan {
        KebijakanJaringan {
            izin_jaringan_lokal: true,
            ..KebijakanJaringan::default()
        }
    }

    #[test]
    fn default_kebijakan_aman() {
        let kb = KebijakanJaringan::default();
        assert!(!kb.izin_jaringan_lokal, "jaringan lokal harus MATI secara bawaan");
        assert_eq!(kb.hop_dipakai(), BATAS_HOP_REDIRECT);
        assert_eq!(kb.port_dipakai(), vec![80, 443]);
    }

    #[test]
    fn izin_jaringan_lokal_off_menolak_ip_privat() {
        let kb = KebijakanJaringan::default();
        for url in [
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            "http://[::1]/",
            "http://localhost/",
            "http://pane.local/",
        ] {
            assert!(
                validate_outbound_url_dengan(url, &kb).is_err(),
                "OFF: {url} harus ditolak"
            );
            assert!(
                periksa_url_pane_dengan(url, &kb).is_err(),
                "OFF (pane): {url} harus ditolak"
            );
        }
    }

    #[test]
    fn izin_jaringan_lokal_on_membuka_ip_privat_tanpa_dns() {
        let kb = kb_lokal();
        // IP literal: tidak memanggil DNS, jadi uji ini tanpa jaringan.
        for url in [
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            "http://[::1]/",
            "http://100.64.0.1/", // CGNAT
        ] {
            assert!(
                validate_outbound_url_dengan(url, &kb).is_ok(),
                "ON: {url} harus diterima"
            );
            assert!(
                periksa_url_pane_dengan(url, &kb).is_ok(),
                "ON (pane): {url} harus diterima"
            );
        }
    }

    #[test]
    fn izin_jaringan_lokal_on_membuka_nama_lokal() {
        let kb = kb_lokal();
        for url in ["http://localhost/", "http://pane.local/", "http://x.localhost/"] {
            assert!(
                periksa_url_pane_dengan(url, &kb).is_ok(),
                "ON: nama lokal {url} harus diterima"
            );
        }
        assert!(
            periksa_url_pane_dengan("http://pane.local/", &KebijakanJaringan::default()).is_err(),
            "OFF: nama lokal harus ditolak"
        );
    }

    #[test]
    fn metadata_cloud_tetap_ditolak_walau_jaringan_lokal_nyala() {
        let kb = kb_lokal();
        for url in [
            "http://169.254.169.254/latest/meta-data/",
            "http://169.254.169.254/",
        ] {
            assert!(
                validate_outbound_url_dengan(url, &kb).is_err(),
                "ON: metadata {url} HARUS tetap ditolak"
            );
            assert!(
                periksa_url_pane_dengan(url, &kb).is_err(),
                "ON (pane): metadata {url} HARUS tetap ditolak"
            );
        }
        let meta: IpAddr = "169.254.169.254".parse().expect("ip uji");
        assert!(is_metadata(meta));
        assert!(ip_terlarang_dengan(meta, true), "metadata dilarang walau izin nyala");
        assert!(ip_terlarang_dengan(meta, false));
    }

    #[test]
    fn skema_terlarang_dan_userinfo_tetap_ditolak_saat_jaringan_lokal_nyala() {
        let kb = kb_lokal();
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<h1>x</h1>",
            "about:blank",
        ] {
            assert!(
                periksa_url_pane_dengan(url, &kb).is_err(),
                "ON: skema {url} HARUS tetap ditolak"
            );
        }
        let trik = format!("https://contoh.com{}jahat.com/x", "@");
        assert!(
            periksa_url_pane_dengan(&trik, &kb).is_err(),
            "ON: userinfo HARUS tetap ditolak"
        );
    }

    #[test]
    fn port_web_off_default_hanya_80_443() {
        let kb = KebijakanJaringan::default();
        assert!(periksa_url_pane_dengan("https://contoh.com/x", &kb).is_ok());
        assert!(periksa_url_pane_dengan("https://contoh.com:8080/x", &kb).is_err());
        assert!(validate_outbound_url_dengan("https://127.0.0.1:8080/", &kb).is_err());
    }

    #[test]
    fn port_web_on_membuka_port_tambahan_tetap_menolak_lainnya() {
        let kb = KebijakanJaringan {
            port_sah: vec![8080, 3000],
            ..KebijakanJaringan::default()
        };
        assert!(periksa_url_pane_dengan("https://contoh.com:8080/x", &kb).is_ok());
        assert!(periksa_url_pane_dengan("http://contoh.com:3000/x", &kb).is_ok());
        // 80/443 tetap sah walau tidak didaftarkan ulang.
        assert!(periksa_url_pane_dengan("https://contoh.com/x", &kb).is_ok());
        // Port yang tidak terdaftar tetap ditolak.
        assert!(periksa_url_pane_dengan("https://contoh.com:9090/x", &kb).is_err());
        assert!(kb.port_diizinkan(8080) && kb.port_diizinkan(443) && !kb.port_diizinkan(9090));
    }

    #[test]
    fn hop_redirect_off_default_dan_on_mengikuti_setelan_dengan_clamp() {
        // OFF (bawaan): 5 hop -> hop ke-5 (index 5) ditolak.
        let kb = KebijakanJaringan::default();
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 4, &kb).is_ok());
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 5, &kb).is_err());

        // ON: hopRedirect 8 -> hop ke-8 boleh, hop ke-8 (index 8) ditolak.
        let kb8 = KebijakanJaringan {
            hop_redirect: 8,
            ..KebijakanJaringan::default()
        };
        assert_eq!(kb8.hop_dipakai(), 8);
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 7, &kb8).is_ok());
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 8, &kb8).is_err());

        // Clamp keras: 99 -> 10.
        let kb99 = KebijakanJaringan {
            hop_redirect: 99,
            ..KebijakanJaringan::default()
        };
        assert_eq!(kb99.hop_dipakai(), HOP_REDIRECT_MAKS);
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 9, &kb99).is_ok());
        assert!(langkah_redirect_dengan("https://contoh.com/a", "https://contoh.com/b", 10, &kb99).is_err());
    }

    #[test]
    fn langkah_redirect_on_tetap_menolak_metadata_dan_privat_sesuai_kebijakan() {
        let kb = kb_lokal();
        // Jaringan lokal nyala: 127.0.0.1 boleh, tapi metadata TETAP ditolak.
        assert!(langkah_redirect_dengan("https://contoh.com/a", "http://127.0.0.1/", 0, &kb).is_ok());
        assert!(langkah_redirect_dengan("https://contoh.com/a", "http://169.254.169.254/", 0, &kb).is_err());
    }
}
