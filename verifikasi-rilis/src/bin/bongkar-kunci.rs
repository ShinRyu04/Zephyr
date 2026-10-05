//! Bongkar isi kunci publik setelah base64, untuk melihat apakah formatnya
//! minisign yang dikenal pustaka. Dipakai ketika decode gagal dan penyebabnya
//! harus dilihat, bukan ditebak.

use base64::Engine;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let isi = std::fs::read_to_string(&args[1]).expect("gagal membaca");
    let teks = isi.trim();
    let raw = base64::engine::general_purpose::STANDARD
        .decode(teks.as_bytes())
        .expect("base64 gagal");
    println!("panjang raw: {} byte", raw.len());
    println!("raw: {:02X?}", raw);
    println!("sebagai teks:\n{}", String::from_utf8_lossy(&raw));

    /* Kunci minisign dimulai dengan 2 byte algoritma lalu 8 byte key id. */
    if raw.len() >= 10 {
        println!("\nalgoritma (2 byte): {:02X?}", &raw[..2]);
        println!("key id (8 byte)   : {:02X?}", &raw[2..10]);
        println!("panjang sisa      : {}", raw.len() - 10);
    }
}
