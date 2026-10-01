/*
 * Uji integrasi: penggantian teks TIDAK boleh merusak encoding berkas.
 *
 * Kenapa ini ada. `search_replace` dulu membaca berkas dengan
 * `String::from_utf8_lossy` lalu menulis dengan `baru.as_bytes()`. Dua-duanya
 * merusak berkas pengguna secara PERMANEN:
 *
 *   - berkas Windows-1252/ANSI: setiap byte yang bukan UTF-8 yang sah diganti
 *     U+FFFD, dan hasilnya ditulis sebagai UTF-8. Seluruh karakter beraksen di
 *     berkas itu rusak, bukan hanya bagian yang diganti;
 *   - berkas UTF-8 dengan BOM: BOM-nya hilang;
 *   - berkas CRLF: seluruh \r hilang, sehingga git melihat "seluruh berkas
 *     berubah".
 *
 * Kerusakannya TIDAK BISA dikembalikan byte-per-byte, karena informasi
 * encodingnya sudah terbuang saat membaca. Dan ini terjadi pada "Replace All"
 * yang jangkauannya bisa satu workspace penuh.
 *
 * Karena itu ujinya memeriksa BYTE, bukan string: yang penting adalah berkasnya
 * kembali utuh seperti semula kecuali teks yang memang diganti.
 */

use std::io::Write;

/// Tulis bytes mentah ke berkas sementara, kembalikan path-nya.
fn tulis_temp(nama: &str, bytes: &[u8]) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("zephyr-encoding-uji");
    std::fs::create_dir_all(&dir).expect("buat direktori temp");
    let path = dir.join(nama);
    let mut f = std::fs::File::create(&path).expect("buat berkas");
    f.write_all(bytes).expect("tulis bytes");
    f.flush().expect("flush");
    path
}

#[test]
fn read_file_detect_tidak_merusak_byte_non_utf8() {
    /*
     * Berkas ANSI (Windows-1252) dengan karakter 0xE9 = 'e' beraksen dalam
     * cp1252. Byte itu BUKAN UTF-8 yang sah, jadi pembaca lossy akan
     * merusaknya.
     */
    let asli: Vec<u8> = vec![b'c', b'a', b'f', 0xE9, b'\n'];
    let path = tulis_temp("ansi.txt", &asli);

    let hasil = zephyr_lib::fs_utils::read_file_detect(&path).expect("baca berkas");

    /*
     * Kontrak yang penting di sini bukan bentuk string-nya (itu urusan
     * deteksi), melainkan bahwa byte 0xE9 TIDAK menjadi U+FFFD. Kalau ia
     * menjadi U+FFFD, informasi aslinya sudah hilang dan penulisan ulang tidak
     * akan pernah bisa benar.
     */
    assert!(
        !hasil.content.contains('\u{FFFD}'),
        "byte 0xE9 dirusak menjadi U+FFFD - encoding aslinya hilang"
    );
}

#[test]
fn utf8_bom_tidak_ikut_masuk_ke_isi() {
    let mut asli: Vec<u8> = vec![0xEF, 0xBB, 0xBF]; // BOM UTF-8
    asli.extend_from_slice("halo\n".as_bytes());
    let path = tulis_temp("bom.txt", &asli);

    let hasil = zephyr_lib::fs_utils::read_file_detect(&path).expect("baca berkas");
    // BOM harus dikenali, bukan ikut masuk ke isi sebagai karakter tak terlihat.
    assert!(
        !hasil.content.starts_with('\u{FEFF}'),
        "BOM ikut masuk ke isi berkas"
    );
}

#[test]
fn crlf_dipertahankan_saat_ditulis_kembali() {
    let asli = b"satu\r\ndua\r\ntiga\r\n";
    let path = tulis_temp("crlf.txt", asli);

    let hasil = zephyr_lib::fs_utils::read_file_detect(&path).expect("baca berkas");
    let baru = hasil.content.replace("dua", "DUA");
    zephyr_lib::fs_utils::write_file_encoded(&path, &baru, &hasil.detected_encoding, &hasil.line_ending)
        .expect("tulis berkas");

    let sesudah = std::fs::read(&path).expect("baca ulang");
    let teks = String::from_utf8_lossy(&sesudah);

    /*
     * Inilah kerusakan yang dicegah: penulisan `baru.as_bytes()` selalu memakai
     * LF, jadi berkas CRLF kehilangan SEMUA \r dan git melaporkan seluruh
     * berkas berubah.
     */
    assert_eq!(
        teks.matches("\r\n").count(),
        3,
        "akhiran baris CRLF hilang saat ditulis ulang: {:?}",
        teks
    );
    assert!(teks.contains("DUA"), "penggantian teksnya sendiri gagal");
    assert!(!teks.contains("dua"), "teks lama masih ada");
}

#[test]
fn batas_baca_masuk_akal() {
    /*
     * Batas ukurannya diperiksa dari metadata SEBELUM membaca. Menguji dengan
     * berkas 33 MB sungguhan akan lambat; sebagai gantinya konstantanya
     * diperiksa berada di rentang yang benar.
     *
     * `std::fs::read` menyerap seluruh berkas, lalu decode membuat salinan
     * kedua, lalu replace salinan ketiga - jadi berkas 500MB menjadi lonjakan
     * beberapa GB dan UI membeku.
     */
    assert!(
        zephyr_lib::fs_utils::MAX_READ_BYTES <= 64 * 1024 * 1024,
        "batas baca terlalu besar untuk mencegah lonjakan memori"
    );
    assert!(
        zephyr_lib::fs_utils::MAX_READ_BYTES >= 1024 * 1024,
        "batas baca terlalu kecil, berkas biasa akan ditolak"
    );
}

#[test]
fn berkas_normal_tetap_bisa_dibaca() {
    /* Kendali: perbaikan di atas tidak boleh menolak berkas yang normal. */
    let asli = b"fn main() {\n    println!(\"halo\");\n}\n";
    let path = tulis_temp("normal.rs", asli);

    let hasil = zephyr_lib::fs_utils::read_file_detect(&path).expect("baca berkas normal");
    assert!(hasil.content.contains("fn main()"));
    assert!(hasil.content.contains("halo"));
}
