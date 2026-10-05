//! Uji kunci: telusuri SEMUA jalan sampai ketemu yang berhasil.
//!
//! Enam percobaan sebelumnya gagal karena saya menebak bentuk masukan. Di sini
//! setiap kombinasi dicoba dan dilaporkan, jadi jawabannya terlihat - bukan
//! ditebak.

use base64::Engine;

fn coba(label: &str, isi: &str) {
    match minisign_verify::PublicKey::decode(isi) {
        Ok(_) => println!("  BERHASIL  {label}"),
        Err(e) => println!("  gagal     {label}  -> {e}"),
    }
}

fn main() {
    let path = std::env::args().nth(1).expect("butuh path");
    let mentah = std::fs::read_to_string(&path).expect("gagal membaca");
    let trim = mentah.trim();

    println!("== lapis 1: langsung dari berkas ==");
    coba("mentah", &mentah);
    coba("trim", trim);

    println!("\n== lapis 2: decode base64 dulu, lalu coba isinya ==");
    let b64 = base64::engine::general_purpose::STANDARD.decode(trim.as_bytes());
    match &b64 {
        Err(e) => println!("  (decode base64 gagal: {e})"),
        Ok(raw) => {
            let teks = String::from_utf8_lossy(raw).to_string();
            println!("  hasil decode ({} byte):", raw.len());
            for (i, l) in teks.lines().enumerate() {
                println!("    baris {i}: {}", &l[..l.len().min(70)]);
            }
            coba("isi decode apa adanya", &teks);
            coba("isi decode di-trim", teks.trim());
            let baris: Vec<&str> = teks.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            for (i, l) in baris.iter().enumerate() {
                coba(&format!("isi decode, baris {i}"), l);
            }
            /* Baris terakhir biasanya kuncinya. */
            if let Some(last) = baris.last() {
                coba("isi decode, baris TERAKHIR", last);
            }
        }
    }

    println!("\n== lapis 3: encode ULANG base64 dari isi decode (bentuk kanonik) ==");
    if let Ok(raw) = &b64 {
        let ulang = base64::engine::general_purpose::STANDARD.encode(raw);
        coba("base64 kanonik", &ulang);
    }
}
