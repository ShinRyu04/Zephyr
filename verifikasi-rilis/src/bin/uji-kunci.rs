//! Uji langsung: apakah minisign-verify 0.2.5 bisa membaca kunci ini?
//!
//! Sudah berkali-kali saya menebak (berkasnya, barisnya, shellnya) dan selalu
//! salah. Di sini tidak ada tebakan: berbai bentuk masukan dicoba berturut-turut,
//! dan yang mana pun yang berhasil akan terlihat - termasuk kalau TIDAK ADA yang
//! berhasil, yang berarti pustakanya memang mengharapkan format lain.

use base64::Engine;

fn coba(label: &str, isi: &str) {
    match minisign_verify::PublicKey::decode(isi) {
        Ok(_) => println!("  BERHASIL  {label}"),
        Err(e) => println!("  gagal     {label}  -> {e}"),
    }
}

fn main() {
    let path = std::env::args().nth(1).expect("butuh path berkas kunci");
    let mentah = std::fs::read_to_string(&path).expect("gagal membaca");

    println!("isi berkas ({} byte):", mentah.len());
    for (i, l) in mentah.lines().enumerate() {
        println!("  baris {}: {} char | {}", i, l.len(), &l[..l.len().min(60)]);
    }

    println!("\nmencoba beberapa bentuk:");
    coba("seluruh isi apa adanya", &mentah);
    coba("seluruh isi di-trim", mentah.trim());

    let baris: Vec<&str> = mentah.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    for (i, l) in baris.iter().enumerate() {
        coba(&format!("hanya baris {i}"), l);
    }

    /* Baris base64 yang di-decode lalu di-encode ULANG: kalau isinya sebenarnya
       sudah benar, hasilnya akan sama - dan itu memisahkan masalah base64 dari
       masalah format. */
    for (i, l) in baris.iter().enumerate() {
        if let Ok(raw) = base64::engine::general_purpose::STANDARD.decode(l.as_bytes()) {
            let ulang = base64::engine::general_purpose::STANDARD.encode(&raw);
            coba(&format!("baris {i} di-decode lalu di-encode ulang"), &ulang);
        }
    }
}
