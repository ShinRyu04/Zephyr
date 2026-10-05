//! Lihat isi berkas kunci publik apa adanya: panjang, karakter tak sah, dan
//! hasil decode base64-nya. Dipakai untuk memastikan apakah masalahnya di
//! kuncinya atau di cara kunci itu dibaca.

use base64::Engine;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).cloned().unwrap_or_default();
    let isi = std::fs::read(&path).expect("gagal membaca berkas");

    println!("berkas    : {path}");
    println!("byte      : {}", isi.len());
    println!("16 pertama: {:02X?}", &isi[..isi.len().min(16)]);

    let teks = String::from_utf8_lossy(&isi).trim().to_string();
    println!("panjang teks setelah trim: {}", teks.len());

    let tak_sah: Vec<(usize, char)> = teks
        .char_indices()
        .filter(|(_, c)| !c.is_ascii_alphanumeric() && *c != '+' && *c != '/' && *c != '=')
        .collect();
    println!("karakter di luar base64: {}", tak_sah.len());
    for (i, c) in tak_sah.iter().take(10) {
        println!("  indeks {i}: {:?} (U+{:04X})", c, *c as u32);
    }

    match base64::engine::general_purpose::STANDARD.decode(teks.as_bytes()) {
        Ok(b) => println!("decode base64: OK, {} byte", b.len()),
        Err(e) => println!("decode base64: GAGAL - {e}"),
    }

    match minisign_verify::PublicKey::decode(&teks) {
        Ok(_) => println!("PublicKey::decode: OK"),
        Err(e) => println!("PublicKey::decode: GAGAL - {e}"),
    }
}
