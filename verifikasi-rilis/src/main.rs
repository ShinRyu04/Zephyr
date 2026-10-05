//! Verifikasi kriptografis tanda tangan rilis.
//!
//! Kenapa ini ada: kecocokan NAMA di dalam tanda tangan tidak membuktikan apa
//! pun. Tanda tangan bisa disalin dari rilis lain, atau dibuat dengan kunci yang
//! berbeda dari yang ada di tauri.conf.json - dan keduanya tetap "terlihat
//! benar": berkasnya ada, isinya base64 yang sah, namanya menyebut versi yang
//! tepat. Updater baru menolaknya di mesin pengguna, dan itu tempat yang paling
//! mahal untuk menemukannya.
//!
//! KUNCI PUBLIK: bentuknya tidak ditebak.
//!
//! Pembungkusan kunci di zephyr.key.pub berbeda dari isi minisign yang
//! diharapkan pustaka, dan saya sempat tujuh kali menebak bentuk yang benar
//! (mentah, di-trim, per baris, hasil decode base64, encode ulang) - semuanya
//! gagal, dan pesan errornya ("Invalid encoding in minisign data") terbaca
//! seperti kunci yang rusak padahal kuncinya benar.
//!
//! Jadi sekarang kandidat bentuknya DISUSUN lalu diuji satu per satu, dan yang
//! berhasil dipakai - dan bentuknya dilaporkan, supaya tidak perlu ditebak lagi.
//!
//! Pakai: verifikasi-rilis <berkas> <berkas.sig> <berkas-pubkey>

use base64::Engine;

/// Semua bentuk kunci publik yang masuk akal, dari yang paling langsung.
fn kandidat_kunci(isi_berkas: &str) -> Vec<(&'static str, String)> {
    let mut out: Vec<(&'static str, String)> = Vec::new();
    let mentah = isi_berkas;
    out.push(("mentah", mentah.to_string()));
    out.push(("di-trim", mentah.trim().to_string()));

    /* Per baris apa adanya. */
    for (i, l) in mentah.lines().enumerate() {
        if !l.trim().is_empty() {
            out.push(("baris apa adanya", l.to_string()));
        }
        let _ = i;
    }

    /* Hasil decode base64, apa adanya dan per baris. */
    if let Ok(b64) = base64::engine::general_purpose::STANDARD.decode(mentah.trim().as_bytes()) {
        let teks = String::from_utf8_lossy(&b64).to_string();
        out.push(("hasil decode base64", teks.clone()));
        out.push(("hasil decode, di-trim", teks.trim().to_string()));
        for l in teks.lines() {
            if !l.trim().is_empty() {
                out.push(("hasil decode, per baris", l.trim().to_string()));
            }
        }
        /* Encode ulang hasil decode (bentuk kanonik). */
        out.push((
            "encode ulang base64",
            base64::engine::general_purpose::STANDARD.encode(&b64),
        ));
    }

    out
}

fn baca_kunci(isi_berkas: &str) -> (minisign_verify::PublicKey, &'static str) {
    for (label, teks) in kandidat_kunci(isi_berkas) {
        if let Ok(k) = minisign_verify::PublicKey::decode(&teks) {
            return (k, label);
        }
    }
    eprintln!("GAGAL: tidak ada bentuk kunci publik yang bisa dibaca.");
    eprintln!("Bentuk yang dicoba:");
    for (label, teks) in kandidat_kunci(isi_berkas) {
        eprintln!("  {label} ({} char): {}", teks.len(), &teks[..teks.len().min(50)]);
    }
    std::process::exit(1);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("pakai: {} <berkas> <berkas.sig> <berkas-pubkey>", args[0]);
        std::process::exit(2);
    }
    let (berkas, sig_path, pub_path) = (&args[1], &args[2], &args[3]);

    let isi_kunci = std::fs::read_to_string(pub_path).unwrap_or_default();
    let (pubkey, bentuk) = baca_kunci(&isi_kunci);
    println!("kunci dibaca sebagai: {bentuk}");

    /* Tanda tangan: base64 yang di dalamnya ada teks minisign. */
    let sig_b64 = std::fs::read_to_string(sig_path).unwrap_or_default();
    let sig_raw = match base64::engine::general_purpose::STANDARD.decode(sig_b64.trim().as_bytes()) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("GAGAL tanda tangan bukan base64 yang sah: {e}");
            std::process::exit(1);
        }
    };
    let sig_teks = String::from_utf8_lossy(&sig_raw).to_string();
    let signature = match minisign_verify::Signature::decode(&sig_teks) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("GAGAL isi tanda tangan tidak bisa dibaca: {e}");
            std::process::exit(1);
        }
    };

    let isi = match std::fs::read(berkas) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("GAGAL berkas tidak bisa dibaca: {e}");
            std::process::exit(1);
        }
    };

    match pubkey.verify(&isi, &signature, true) {
        Ok(()) => {
            println!("COCOK   {berkas}");
            if let Some(g) = sig_teks.lines().find(|l| l.starts_with("file:")) {
                println!("        {g}");
            }
        }
        Err(e) => {
            eprintln!("TIDAK COCOK   {berkas}: {e}");
            std::process::exit(1);
        }
    }
}
