// http_client.rs — penjalan file `.http` (T1.3).
//
// KENAPA modul ini ada: ekstensi "REST Client" adalah salah satu ekstensi VS
// Code paling sering dipakai webdev, dan tanpa itu Zephyr terasa kurang untuk
// kerja API. Format `.http` dipilih (bukan koleksi JSON ala Postman) karena:
//   * file teks biasa — ikut git, bisa di-review, tidak perlu UI khusus
//   * sudah jadi standar de-facto (JetBrains + VS Code REST Client)
//   * satu file bisa memuat banyak request, dipisah `###`
//
// FORMAT yang didukung:
//   ### komentar bebas
//   # @name login            <- nama request (opsional)
//   POST https://api.x.com/v1/login
//   Content-Type: application/json
//   Authorization: Bearer {{token}}
//
//   { "user": "{{user}}" }
//
// VARIABEL: `{{nama}}` diganti dari variabel yang dikirim frontend
// (mis. dari environment aktif). Variabel yang tidak dikenal DIBIARKAN apa
// adanya supaya user melihat kesalahannya, bukan mengirim string kosong.
//
// KEAMANAN: modul ini TIDAK menyimpan apa pun ke disk dan tidak pernah
// menuliskan header Authorization ke log. Timeout wajib supaya server yang
// menggantung tidak menahan thread.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Batas waktu satu request. 30 detik: cukup untuk API lambat, cukup pendek
/// supaya UI tidak terasa beku.
const TIMEOUT: Duration = Duration::from_secs(30);

/// Batas ukuran body yang dikembalikan ke UI (byte). Response raksasa
/// (unduhan, dump) akan membekukan panel kalau tidak dipotong.
const MAX_BODY: usize = 512 * 1024;

/// Satu request yang sudah diurai dari file `.http`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    /// nama dari `# @name x`, atau `METHOD /path` kalau tidak ada
    pub nama: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    /// body mentah (boleh kosong)
    pub body: String,
    /// nomor baris awal request di file (1-based) — untuk lompat ke sumbernya
    pub baris: usize,
}

/// Hasil satu request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResult {
    pub nama: String,
    pub method: String,
    pub url: String,
    pub ok: bool,
    /// 0 = gagal sebelum dapat response (DNS, koneksi ditolak, timeout)
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    /// true = body dipotong karena melebihi MAX_BODY
    pub terpotong: bool,
    pub ms: u64,
    /// pesan error kalau ok=false
    pub error: Option<String>,
}

/// Ganti `{{nama}}` dengan nilai dari peta variabel.
///
/// Variabel tak dikenal DIBIARKAN (`{{x}}` tetap `{{x}}`) — itu sinyal yang
/// jelas untuk user, sedangkan string kosong menyembunyikan kesalahan.
fn ganti_variabel(teks: &str, vars: &[(String, String)]) -> String {
    let mut hasil = teks.to_string();
    for (k, v) in vars {
        hasil = hasil.replace(&format!("{{{{{k}}}}}"), v);
    }
    hasil
}

/// Urai isi file `.http` menjadi daftar request.
///
/// Aturan:
///   * `###` memulai request baru (baris pertama file tidak perlu `###`)
///   * baris `#` atau `//` = komentar (diabaikan)
///   * baris pertama yang bukan komentar = `METHOD URL`
///   * setelah baris kosong pertama = body
///   * `Nama: nilai` sebelum baris kosong = header
pub fn parse(isi: &str, vars: &[(String, String)]) -> Vec<HttpRequest> {
    let mut daftar: Vec<HttpRequest> = Vec::new();
    let mut sekarang: Option<HttpRequest> = None;
    let mut di_body = false;
    /// `# @name x` yang muncul SEBELUM baris METHOD — dipakai saat request
    /// berikutnya terbentuk.
    let mut nama_tertunda = String::new();

    for (i, baris_mentah) in isi.lines().enumerate() {
        let nomor = i + 1;
        let baris = baris_mentah.trim_end();

        // Pemisah request.
        if baris.trim_start().starts_with("###") {
            if let Some(r) = sekarang.take() {
                if !r.url.is_empty() {
                    daftar.push(r);
                }
            }
            di_body = false;
            // Teks setelah ### jadi nama cadangan kalau tidak ada @name.
            continue;
        }

        // Belum ada request aktif: mulai dari baris METHOD URL pertama.
        if sekarang.is_none() {
            let t = baris.trim();
            // `# @name x` SEBELUM baris METHOD adalah bentuk yang lazim
            // (nama menempel di atas request). Disimpan dulu, dipakai saat
            // request-nya terbentuk.
            if let Some(sisa) = t.strip_prefix("# @name") {
                nama_tertunda = sisa.trim().to_string();
                continue;
            }
            // Variabel `@nama = nilai` — BUKAN request. Tanpa cabang ini,
            // `@base = http://x` terbaca sebagai method "@base" + URL "= ...".
            if t.starts_with('@') && t.contains('=') {
                continue;
            }
            if t.is_empty() || t.starts_with('#') || t.starts_with("//") {
                continue;
            }
            // Harus berbentuk METHOD URL.
            let mut it = t.splitn(2, char::is_whitespace);
            let m = it.next().unwrap_or("").to_uppercase();
            let u = it.next().unwrap_or("").trim();
            // Method HTTP hanya huruf; "@base" atau "= x" bukan method.
            if u.is_empty() || m.len() > 10 || !m.chars().all(|c| c.is_ascii_alphabetic()) {
                continue;
            }
            sekarang = Some(HttpRequest {
                nama: std::mem::take(&mut nama_tertunda),
                method: m,
                url: ganti_variabel(u, vars),
                headers: Vec::new(),
                body: String::new(),
                baris: nomor,
            });
            di_body = false;
            continue;
        }

        let r = sekarang.as_mut().expect("sekarang pasti Some");

        // Komentar `# @name x` = nama request.
        let t = baris.trim();
        if t.starts_with('#') || t.starts_with("//") {
            if let Some(sisa) = t.strip_prefix("# @name") {
                r.nama = sisa.trim().to_string();
            }
            continue;
        }

        // Baris kosong = mulai body.
        if t.is_empty() {
            di_body = true;
            continue;
        }

        if di_body {
            if !r.body.is_empty() {
                r.body.push('\n');
            }
            r.body.push_str(baris);
            continue;
        }

        // Masih bagian header: `Nama: nilai`.
        if let Some((k, v)) = t.split_once(':') {
            r.headers
                .push((k.trim().to_string(), ganti_variabel(v.trim(), vars)));
        } else {
            // Baris aneh sebelum body — anggap awal body (toleran).
            di_body = true;
            r.body.push_str(baris);
        }
    }

    if let Some(r) = sekarang.take() {
        if !r.url.is_empty() {
            daftar.push(r);
        }
    }

    // Isi nama default untuk yang tidak punya @name.
    for r in daftar.iter_mut() {
        if r.nama.is_empty() {
            let pendek = r
                .url
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            r.nama = format!(
                "{} {}",
                r.method,
                pendek.chars().take(48).collect::<String>()
            );
        }
    }

    daftar
}

/// Urai file `.http` (dari isi teks) — untuk ditampilkan di UI.
#[tauri::command]
pub fn http_parse(
    isi: String,
    variabel: Option<Vec<(String, String)>>,
) -> ZResult<Vec<HttpRequest>> {
    let vars = variabel.unwrap_or_default();
    Ok(parse(&isi, &vars))
}

/// Jalankan SATU request.
#[tauri::command(async)]
pub fn http_send(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    variabel: Option<Vec<(String, String)>>,
) -> ZResult<HttpResult> {
    let vars = variabel.unwrap_or_default();
    let url = ganti_variabel(url.trim(), &vars);
    let method = method.trim().to_uppercase();

    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "URL harus diawali http:// atau https://".into(),
        ));
    }
    if method.is_empty() {
        return Err(ZephyrError::InvalidInput("method kosong".into()));
    }

    let mulai = std::time::Instant::now();
    let body_final = body.as_deref().map(|b| ganti_variabel(b, &vars));

    let cfg = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .build();
    let agent: ureq::Agent = cfg.into();

    // ureq 3.4 memakai TIPE BERBEDA per method (dicek di registry):
    //   get/delete/head -> RequestBuilder<WithoutBody> -> .call()
    //   post/put/patch  -> RequestBuilder<WithBody>    -> .send(body)
    // Karena tipenya tidak bisa disatukan, tiap kelompok dibangun terpisah.
    let pasang_header_wb = |mut req: ureq::RequestBuilder<ureq::typestate::WithoutBody>| {
        for (k, v) in &headers {
            req = req.header(k, v);
        }
        if !headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
        {
            req = req.header("User-Agent", "Zephyr/1.1.10 (http-client)");
        }
        req
    };

    let resp = match method.as_str() {
        // ── tanpa body ──
        "GET" | "HEAD" | "DELETE" => {
            let dasar = if method == "GET" {
                agent.get(&url)
            } else if method == "HEAD" {
                agent.head(&url)
            } else {
                agent.delete(&url)
            };
            pasang_header_wb(dasar).call()
        }
        // ── berbody ──
        "POST" | "PUT" | "PATCH" => {
            let dasar = if method == "POST" {
                agent.post(&url)
            } else if method == "PUT" {
                agent.put(&url)
            } else {
                agent.patch(&url)
            };
            let mut req = dasar;
            for (k, v) in &headers {
                req = req.header(k, v);
            }
            if !headers
                .iter()
                .any(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
            {
                req = req.header("User-Agent", "Zephyr/1.1.10 (http-client)");
            }
            // Body kosong tetap dikirim sebagai string kosong: sebagian API
            // menolak request ber-method body tanpa body sama sekali.
            req.send(body_final.as_deref().unwrap_or(""))
        }
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "method tidak didukung: {lain}"
            )))
        }
    };

    match resp {
        Ok(r) => {
            let status = r.status().as_u16();
            let status_text = r.status().canonical_reason().unwrap_or("").to_string();
            let mut hdr: Vec<(String, String)> = Vec::new();
            for nama in r.headers().keys() {
                if let Some(v) = r.headers().get(nama).and_then(|x| x.to_str().ok()) {
                    hdr.push((nama.to_string(), v.to_string()));
                }
            }
            let mut teks = r.into_body().read_to_string().unwrap_or_default();
            let terpotong = teks.len() > MAX_BODY;
            if terpotong {
                teks.truncate(MAX_BODY);
            }
            Ok(HttpResult {
                nama: String::new(),
                method,
                url,
                ok: true,
                status,
                status_text,
                headers: hdr,
                body: teks,
                terpotong,
                ms: mulai.elapsed().as_millis() as u64,
                error: None,
            })
        }
        // Status >= 400 BUKAN kegagalan transport: server menjawab, dan
        // jawabannya justru yang ingin dilihat user (pesan error API).
        Err(ureq::Error::StatusCode(code)) => Ok(HttpResult {
            nama: String::new(),
            method,
            url,
            ok: true,
            status: code,
            status_text: String::new(),
            headers: Vec::new(),
            body: String::new(),
            terpotong: false,
            ms: mulai.elapsed().as_millis() as u64,
            error: None,
        }),
        Err(e) => Ok(HttpResult {
            nama: String::new(),
            method,
            url,
            ok: false,
            status: 0,
            status_text: String::new(),
            headers: Vec::new(),
            body: String::new(),
            terpotong: false,
            ms: mulai.elapsed().as_millis() as u64,
            error: Some(format!("{e}")),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_satu_request_sederhana() {
        let isi = "GET https://api.example.com/users\nAccept: application/json\n";
        let r = parse(isi, &[]);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].method, "GET");
        assert_eq!(r[0].url, "https://api.example.com/users");
        assert_eq!(r[0].headers.len(), 1);
        assert_eq!(r[0].headers[0].0, "Accept");
    }

    #[test]
    fn parse_beberapa_request_dipisah_tiga_pagar() {
        let isi = "\
### Ambil user
GET https://api.example.com/users

### Buat user
POST https://api.example.com/users
Content-Type: application/json

{ \"nama\": \"Budi\" }
";
        let r = parse(isi, &[]);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].method, "GET");
        assert_eq!(r[1].method, "POST");
        assert!(r[1].body.contains("Budi"), "body={}", r[1].body);
    }

    #[test]
    fn parse_name_diambil_dari_komentar() {
        let isi = "# @name login\nPOST https://api.example.com/login\n";
        let r = parse(isi, &[]);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].nama, "login");
    }

    #[test]
    fn variabel_diganti() {
        let isi = "GET {{base}}/users\nAuthorization: Bearer {{token}}\n";
        let vars = vec![
            ("base".to_string(), "https://api.example.com".to_string()),
            ("token".to_string(), "RAHASIA".to_string()),
        ];
        let r = parse(isi, &vars);
        assert_eq!(r[0].url, "https://api.example.com/users");
        assert_eq!(r[0].headers[0].1, "Bearer RAHASIA");
    }

    #[test]
    fn variabel_tak_dikenal_dibiarkan() {
        let isi = "GET https://x.com/{{tidakada}}\n";
        let r = parse(isi, &[]);
        assert_eq!(r[0].url, "https://x.com/{{tidakada}}");
    }

    #[test]
    fn body_multibaris_dipertahankan() {
        let isi = "POST https://x.com/a\n\n{\n  \"a\": 1,\n  \"b\": 2\n}\n";
        let r = parse(isi, &[]);
        assert!(r[0].body.contains("\"a\": 1"));
        assert!(r[0].body.contains("\"b\": 2"));
        assert_eq!(r[0].body.lines().count(), 4);
    }

    /// `@nama = nilai` adalah definisi variabel, BUKAN request. Tanpa aturan
    /// ini, `@base = http://x` terbaca sebagai method "@base".
    #[test]
    fn definisi_variabel_bukan_request() {
        let isi = "@base = http://127.0.0.1:8098

### cek
GET {{base}}/v
";
        let vars = vec![("base".to_string(), "http://127.0.0.1:8098".to_string())];
        let r = parse(isi, &vars);
        assert_eq!(r.len(), 1, "harus 1 request, dapat {}", r.len());
        assert_eq!(r[0].method, "GET");
        assert_eq!(r[0].url, "http://127.0.0.1:8098/v");
    }

    #[test]
    fn file_kosong_menghasilkan_daftar_kosong() {
        assert!(parse("", &[]).is_empty());
        assert!(parse("\n\n# cuma komentar\n", &[]).is_empty());
    }

    #[test]
    fn url_tidak_valid_ditolak() {
        let err = http_send("GET".into(), "ftp://x.com".into(), vec![], None, None);
        assert!(err.is_err());
    }

    #[test]
    fn method_tidak_didukung_ditolak() {
        let err = http_send("TRACE".into(), "https://x.com".into(), vec![], None, None);
        assert!(err.is_err());
    }
}
