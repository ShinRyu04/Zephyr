//! Dekripsi nilai dari secrets.json, memakai langkah yang SAMA seperti
//! aplikasi (secrets.rs): base64 lalu XOR dengan keystream BLAKE3-XOF dari
//! SALT|MachineGuid|hostname|username.
//!
//! Kenapa harus sama persis: nilai di secrets.json BUKAN key, melainkan
//! base64(XOR(key)). Mengirimnya langsung ke provider menghasilkan 401, dan itu
//! terbaca seperti key yang salah padahal key-nya baik - saya sempat menyesatkan
//! diri sendiri begitu.
//!
//! Pakai: dekrip <nilai-terenkripsi>
//! Hanya mencetak hasilnya ke stdout. Jangan dipakai untuk mencatat ke berkas.

use base64::Engine;

/// Sama dengan konstanta di secrets.rs. Salah nilai di sini menghasilkan
/// "bukan teks yang sah" - bukan pesan yang menjelaskan bahwa salt-nya beda.
const SALT: &str = "zephyr/secrets/v1";

fn machine_seed() -> String {
    /* Dibaca dari Windows lewat registry, sama seperti aplikasi. */
    let guid = std::process::Command::new("reg")
        .args([
            "query",
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.split_whitespace().last().map(str::to_string))
        .unwrap_or_else(|| "no-guid".into());

    let nama = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "unknown-user".into());
    format!("{SALT}|{guid}|{nama}|{user}")
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

fn main() {
    let enc = std::env::args().nth(1).expect("pakai: dekrip <nilai>");
    let raw = base64::engine::general_purpose::STANDARD
        .decode(enc.trim().as_bytes())
        .expect("base64 tidak sah");
    let plain = xor_crypt(&raw);
    match String::from_utf8(plain) {
        Ok(s) => println!("{s}"),
        Err(_) => {
            eprintln!("hasil bukan teks yang sah - salt mesin mungkin berbeda");
            std::process::exit(1);
        }
    }
}
