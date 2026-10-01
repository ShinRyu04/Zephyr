/*
 * Penulisan berkas yang aman terhadap crash.
 *
 * MASALAHNYA. `std::fs::write` membuka berkas tujuan dengan O_TRUNC - artinya
 * isi lamanya dihapus LEBIH DULU, lalu isi baru ditulis. Kalau prosesnya mati
 * di antara keduanya (listrik putus, aplikasi dipaksa tutup, kernel panik),
 * yang tersisa adalah berkas yang kosong atau separuh. Untuk berkas yang
 * isinya seluruh state pengguna - pengaturan, rahasia, riwayat sesi, catatan -
 * itu berarti kehilangan semuanya, bukan kehilangan sebagian.
 *
 * SOLUSINYA. Tulis ke berkas sementara di direktori yang SAMA, sinkronkan ke
 * disk, lalu `rename` ke nama tujuan. `rename` di dalam satu volume bersifat
 * atomik di Windows maupun Unix: pembaca akan melihat berkas LAMA yang utuh,
 * atau berkas BARU yang utuh, tidak pernah campuran.
 *
 * Disinkronkan (`sync_all`) sebelum rename, karena tanpa itu isi berkasnya
 * masih bisa berada di cache sistem saat rename terjadi - dan urutan di disk
 * belum tentu sama dengan urutan pemanggilannya.
 *
 * Berkas sementara diberi akhiran proses-id supaya dua proses Zephyr yang
 * berjalan bersamaan (mis. rilis dan portable untuk pengujian) tidak saling
 * menimpa berkas sementara satu sama lain.
 */

use std::io::Write;
use std::path::Path;

use crate::errors::{ZephyrError, ZResult};

/// Tulis `isi` ke `path` secara atomik, buat direktori induknya bila perlu.
pub fn tulis_atomik(path: &Path, isi: &[u8]) -> ZResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let tmp = berkas_sementara(path);

    /*
     * Bila penulisan gagal di tengah, berkas sementaranya dibersihkan. Tanpa
     * ini, kegagalan berulang meninggalkan sampah `.tmp-<pid>` di direktori
     * data pengguna - dan berkas sampah itu tidak pernah dibersihkan oleh apa
     * pun.
     */
    let hasil = (|| -> ZResult<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(isi)?;
        /* Sinkronkan isinya ke disk SEBELUM rename. Tanpa ini, urutan di disk
           belum tentu sama dengan urutan pemanggilan. */
        f.sync_all()?;
        Ok(())
    })();

    if let Err(e) = hasil {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(ZephyrError::Internal(format!(
                "gagal menyimpan {}: {e}",
                path.display()
            )))
        }
    }
}

/// Sama dengan `tulis_atomik`, untuk isi berupa teks.
pub fn tulis_atomik_teks(path: &Path, isi: &str) -> ZResult<()> {
    tulis_atomik(path, isi.as_bytes())
}

/**
 * Nama berkas sementara untuk `path`.
 *
 * Akhiran proses-id dipakai supaya dua proses Zephyr yang berjalan bersamaan
 * tidak memakai berkas sementara yang sama - kalau itu terjadi, yang satu bisa
 * me-rename berkas sementara milik yang lain, dan hasilnya adalah state salah
 * satu proses.
 */
fn berkas_sementara(path: &Path) -> std::path::PathBuf {
    let mut nama = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "berkas".into());
    nama.push_str(&format!(".tmp-{}", std::process::id()));
    path.with_file_name(nama)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir_uji(nama: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join("zephyr-tulis-atomik").join(nama);
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn menulis_isi_dan_membuat_direktori_induk() {
        let d = dir_uji("baru");
        let f = d.join("dalam").join("berkas.txt");
        tulis_atomik_teks(&f, "halo").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "halo");
    }

    #[test]
    fn menimpa_isi_lama() {
        let d = dir_uji("timpa");
        let f = d.join("a.txt");
        tulis_atomik_teks(&f, "lama").unwrap();
        tulis_atomik_teks(&f, "baru").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "baru");
    }

    #[test]
    fn tidak_meninggalkan_berkas_sementara() {
        /*
         * Berkas sementara yang tertinggal akan menumpuk di direktori data
         * pengguna, dan tidak ada yang membersihkannya.
         */
        let d = dir_uji("bersih");
        let f = d.join("a.txt");
        tulis_atomik_teks(&f, "isi").unwrap();

        let sisa: Vec<_> = std::fs::read_dir(&d)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".tmp-"))
            .collect();
        assert!(sisa.is_empty(), "berkas sementara tertinggal: {sisa:?}");
    }

    #[test]
    fn isi_selalu_utuh_bukan_separuh() {
        /*
         * Inti dari atomik: pembaca tidak boleh pernah melihat berkas yang
         * separuh. Diuji dengan menulis isi yang jauh lebih besar daripada
         * ukuran blok, lalu memastikan panjangnya persis.
         */
        let d = dir_uji("utuh");
        let f = d.join("besar.txt");
        let isi = "x".repeat(200_000);
        tulis_atomik_teks(&f, &isi).unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap().len(), 200_000);
    }
}
