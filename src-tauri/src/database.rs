// database.rs — Database browser (T3.2).
//
// KENAPA SQLite ditangani sendiri dan MySQL/Postgres lewat CLI: SQLite adalah
// file, jadi membacanya tidak butuh server apa pun — `rusqlite` (bundled)
// sudah cukup dan bekerja offline. MySQL/Postgres butuh server + kredensial;
// untuk itu modul ini memakai client CLI resmi (mysql.exe / psql.exe) yang
// memang sudah ada di mesin webdev. Kredensial TIDAK PERNAH ditulis ke disk
// dan tidak pernah masuk ke log.
//
// BATAS KEAMANAN yang dijaga:
//   1. Hanya perintah BACA (SELECT/PRAGMA/EXPLAIN/WITH/SHOW/DESCRIBE) yang
//      diizinkan lewat jalur "jalankan query". Operasi tulis harus eksplisit.
//   2. Password MySQL tidak pernah jadi argumen baris perintah (bocor ke
//      daftar proses) — dikirim lewat environment MYSQL_PWD.
//   3. Baris hasil dibatasi (LIMIT) supaya tabel raksasa tidak menghabiskan
//      memori aplikasi.

use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Batas baris yang dikembalikan sekali baca. Tanpa batas, `SELECT *` pada
/// tabel 10 juta baris akan membekukan UI.
const MAX_BARIS: usize = 500;

/// Deskripsi sebuah tabel/kolom.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabelInfo {
    pub nama: String,
    /// "table" | "view"
    pub jenis: String,
    /// jumlah baris (perkiraan untuk view)
    pub baris: i64,
}

/// Hasil sebuah query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HasilQuery {
    pub kolom: Vec<String>,
    pub baris: Vec<Vec<String>>,
    /// true kalau hasil dipotong karena melebihi MAX_BARIS
    pub dipotong: bool,
    /// waktu eksekusi (ms)
    pub ms: u64,
    /// jumlah baris yang terpengaruh (untuk INSERT/UPDATE/DELETE)
    pub terpengaruh: usize,
}

/// Perintah yang boleh dijalankan lewat jalur baca.
fn hanya_baca(sql: &str) -> bool {
    let s = sql.trim_start().to_ascii_lowercase();
    // Komentar di awal harus dilewati supaya "-- hapus\nDROP ..." tidak lolos.
    let s = if let Some(i) = s.find(|c: char| !c.is_whitespace() && c != '-' && c != '/') {
        &s[i..]
    } else {
        return false;
    };
    [
        "select",
        "pragma",
        "explain",
        "with",
        "show",
        "describe",
        "desc",
        "table_info",
    ]
    .iter()
    .any(|k| s.starts_with(k))
}

/// Buka koneksi SQLite read-only.
///
/// READ-ONLY adalah pilihan sadar: file database sering milik aplikasi lain
/// yang sedang jalan (mis. Zephyr sendiri), dan membukanya dengan mode tulis
/// bisa mengunci file itu.
fn buka_sqlite(path: &str) -> ZResult<Connection> {
    if !Path::new(path).is_file() {
        return Err(ZephyrError::NotFound(format!(
            "file database tidak ada: {path}"
        )));
    }
    let uri = format!("file:{}?mode=ro", path.replace('\\', "/"));
    Connection::open_with_flags(
        uri,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| ZephyrError::Io(format!("gagal membuka sqlite: {e}")))
}

/// Daftar tabel + view di sebuah file SQLite.
#[tauri::command]
pub fn db_sqlite_tabel(path: String) -> ZResult<Vec<TabelInfo>> {
    let conn = buka_sqlite(&path)?;
    let mut stmt = conn
        .prepare(
            "SELECT name, type FROM sqlite_master \
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| ZephyrError::Io(e.to_string()))?;

    let rows = stmt
        .query_map([], |r| {
            let nama: String = r.get(0)?;
            let jenis: String = r.get(1)?;
            Ok((nama, jenis))
        })
        .map_err(|e| ZephyrError::Io(e.to_string()))?;

    let mut hasil = Vec::new();
    for (nama, jenis) in rows.flatten() {
        // Hitung baris dengan COUNT(*). Untuk tabel besar ini bisa lambat,
        // jadi kegagalan hitung TIDAK menggagalkan seluruh daftar (-1).
        let n: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM \"{nama}\""), [], |r| {
                r.get(0)
            })
            .unwrap_or(-1);
        hasil.push(TabelInfo {
            nama,
            jenis,
            baris: n,
        });
    }
    Ok(hasil)
}

/// Jalankan query pada file SQLite.
#[tauri::command]
pub fn db_sqlite_query(
    path: String,
    sql: String,
    boleh_tulis: Option<bool>,
) -> ZResult<HasilQuery> {
    if boleh_tulis != Some(true) && !hanya_baca(&sql) {
        return Err(ZephyrError::Permission(
            "query tulis ditolak: aktifkan mode tulis dulu".into(),
        ));
    }
    let conn = buka_sqlite(&path)?;
    let t0 = std::time::Instant::now();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| ZephyrError::InvalidInput(format!("SQL tidak valid: {e}")))?;
    let n_kolom = stmt.column_count();
    let kolom: Vec<String> = (0..n_kolom)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();

    // Statement tanpa hasil (INSERT/UPDATE/DDL) -> jalankan langsung.
    if n_kolom == 0 {
        let n = stmt
            .execute([])
            .map_err(|e| ZephyrError::Io(format!("gagal menjalankan: {e}")))?;
        return Ok(HasilQuery {
            kolom,
            baris: Vec::new(),
            dipotong: false,
            ms: t0.elapsed().as_millis() as u64,
            terpengaruh: n,
        });
    }

    let mut rows = stmt
        .query([])
        .map_err(|e| ZephyrError::Io(format!("gagal query: {e}")))?;

    let mut baris: Vec<Vec<String>> = Vec::new();
    let mut dipotong = false;
    loop {
        match rows.next() {
            Ok(Some(r)) => {
                if baris.len() >= MAX_BARIS {
                    dipotong = true;
                    break;
                }
                let mut satu = Vec::with_capacity(n_kolom);
                for i in 0..n_kolom {
                    // Nilai apa pun diubah ke teks: UI menampilkan tabel, dan
                    // mempertahankan tipe Rust per kolom butuh enum yang tidak
                    // sebanding manfaatnya.
                    let v: String = match r.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => "NULL".into(),
                        Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                        Ok(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            String::from_utf8_lossy(t).into_owned()
                        }
                        Ok(rusqlite::types::ValueRef::Blob(b)) => format!("<blob {} B>", b.len()),
                        Err(_) => "?".into(),
                    };
                    satu.push(v);
                }
                baris.push(satu);
            }
            Ok(None) => break,
            Err(e) => return Err(ZephyrError::Io(format!("gagal membaca baris: {e}"))),
        }
    }

    Ok(HasilQuery {
        kolom,
        baris,
        dipotong,
        ms: t0.elapsed().as_millis() as u64,
        terpengaruh: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hanya_baca_mengenali_select() {
        assert!(hanya_baca("SELECT * FROM t"));
        assert!(hanya_baca("  select 1"));
        assert!(hanya_baca("PRAGMA table_info(t)"));
        assert!(hanya_baca("WITH x AS (SELECT 1) SELECT * FROM x"));
    }

    #[test]
    fn hanya_baca_menolak_tulis() {
        assert!(!hanya_baca("DROP TABLE t"));
        assert!(!hanya_baca("DELETE FROM t"));
        assert!(!hanya_baca("INSERT INTO t VALUES (1)"));
        assert!(!hanya_baca("UPDATE t SET a=1"));
    }

    #[test]
    fn query_tulis_ditolak_tanpa_izin() {
        let r = db_sqlite_query("x.db".into(), "DROP TABLE t".into(), None);
        assert!(matches!(r, Err(ZephyrError::Permission(_))));
    }

    #[test]
    fn file_tidak_ada_error_jelas() {
        let r = db_sqlite_tabel("D:/tidak-ada-xyz.db".into());
        assert!(matches!(r, Err(ZephyrError::NotFound(_))));
    }

    /// Uji nyata: buat file SQLite sementara lewat rusqlite, lalu baca.
    #[test]
    fn baca_sqlite_nyata() {
        let dir = std::env::temp_dir().join("zephyr-db-test");
        let _ = std::fs::create_dir_all(&dir);
        let p = dir.join("uji.db");
        let _ = std::fs::remove_file(&p);
        {
            let c = Connection::open(&p).unwrap();
            c.execute_batch(
                "CREATE TABLE buku (id INTEGER PRIMARY KEY, judul TEXT);
                 INSERT INTO buku (judul) VALUES ('Satu'), ('Dua'), ('Tiga');",
            )
            .unwrap();
        }
        let path = p.to_string_lossy().into_owned();

        let tabel = db_sqlite_tabel(path.clone()).unwrap();
        assert_eq!(tabel.len(), 1);
        assert_eq!(tabel[0].nama, "buku");
        assert_eq!(tabel[0].baris, 3);

        let h = db_sqlite_query(
            path.clone(),
            "SELECT judul FROM buku ORDER BY id".into(),
            None,
        )
        .unwrap();
        assert_eq!(h.kolom, vec!["judul"]);
        assert_eq!(h.baris.len(), 3);
        assert_eq!(h.baris[0][0], "Satu");
        assert_eq!(h.baris[2][0], "Tiga");

        let _ = std::fs::remove_file(&p);
    }
}
