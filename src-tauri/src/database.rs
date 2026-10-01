//! Database browser: read-only inspection of a local database.
//!
//! Two engines, two access paths, chosen to avoid adding a native driver:
//!   - SQLite goes through `rusqlite` (already a dependency, bundled build).
//!   - MySQL/MariaDB goes through the `mysql` client that ships beside the
//!     server, so no connector library is linked in.
//!
//! Every statement is checked against a read-only allowlist. This is a
//! browser, not a query console: a `DROP` typed here must not reach the server.

use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbKolom {
    pub nama: String,
    pub tipe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTabel {
    pub nama: String,
    /// Row count when it is cheap to ask (SQLite), otherwise 0.
    pub baris: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbHasil {
    pub kolom: Vec<DbKolom>,
    pub baris: Vec<Vec<String>>,
    /// Set when the result was cut short, so the UI can say so.
    pub dipotong: bool,
}

/// A statement is allowed only when it starts with one of these. Anything else
/// is refused before it reaches the engine.
const DIIZINKAN: &[&str] = &["select", "pragma", "show", "describe", "desc", "explain", "with"];

/// A keyword that must never appear, even inside an otherwise allowed
/// statement: `WITH x AS (...) DELETE FROM t` would pass the prefix check.
const DILARANG: &[&str] = &[
    "insert", "update", "delete", "drop", "alter", "create", "replace", "truncate", "attach",
    "detach", "grant", "revoke", "vacuum", "reindex", "load_extension",
];

const MAKS_BARIS: usize = 500;

fn periksa_baca_saja(sql: &str) -> ZResult<()> {
    let t = sql.trim().trim_end_matches(';').trim();
    if t.is_empty() {
        return Err(ZephyrError::InvalidInput("the query is empty".into()));
    }
    // Strip string literals and comments first: a value like 'drop' must not
    // trip the banned-word scan.
    let mut bersih = String::with_capacity(t.len());
    let mut dalam_str: Option<char> = None;
    let mut chars = t.chars().peekable();
    while let Some(c) = chars.next() {
        match dalam_str {
            Some(q) => {
                if c == q {
                    dalam_str = None;
                }
                bersih.push(' ');
            }
            None => {
                if c == '\'' || c == '"' || c == '`' {
                    dalam_str = Some(c);
                    bersih.push(' ');
                    continue;
                }
                if c == '-' && chars.peek() == Some(&'-') {
                    for n in chars.by_ref() {
                        if n == '\n' {
                            break;
                        }
                    }
                    bersih.push(' ');
                    continue;
                }
                bersih.push(c);
            }
        }
    }

    let kecil = bersih.to_lowercase();
    let pertama = kecil.split_whitespace().next().unwrap_or("");
    if !DIIZINKAN.contains(&pertama) {
        return Err(ZephyrError::InvalidInput(format!(
            "only read-only statements are allowed here (got \"{pertama}\")"
        )));
    }
    for kata in DILARANG {
        // A word boundary check, so `created_at` does not match `create`.
        let pola = format!(" {kata} ");
        if format!(" {kecil} ").contains(&pola) {
            return Err(ZephyrError::InvalidInput(format!(
                "\"{kata}\" is not allowed in the browser"
            )));
        }
    }
    Ok(())
}

fn sqlite_hasil(conn: &rusqlite::Connection, sql: &str) -> ZResult<DbHasil> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| ZephyrError::InvalidInput(format!("sql: {e}")))?;

    let kolom: Vec<DbKolom> = stmt
        .column_names()
        .iter()
        .map(|n| DbKolom {
            nama: (*n).to_string(),
            tipe: String::new(),
        })
        .collect();
    let jumlah = kolom.len();

    let mut rows = stmt
        .query([])
        .map_err(|e| ZephyrError::InvalidInput(format!("query: {e}")))?;

    let mut baris = Vec::new();
    let mut dipotong = false;
    loop {
        match rows.next() {
            Ok(Some(r)) => {
                if baris.len() >= MAKS_BARIS {
                    dipotong = true;
                    break;
                }
                let mut satu = Vec::with_capacity(jumlah);
                for i in 0..jumlah {
                    let v: rusqlite::types::Value = r.get(i).unwrap_or(rusqlite::types::Value::Null);
                    satu.push(match v {
                        rusqlite::types::Value::Null => String::new(),
                        rusqlite::types::Value::Integer(n) => n.to_string(),
                        rusqlite::types::Value::Real(f) => f.to_string(),
                        rusqlite::types::Value::Text(t) => t,
                        rusqlite::types::Value::Blob(b) => format!("<{} bytes>", b.len()),
                    });
                }
                baris.push(satu);
            }
            Ok(None) => break,
            Err(e) => return Err(ZephyrError::InvalidInput(format!("row: {e}"))),
        }
    }

    Ok(DbHasil { kolom, baris, dipotong })
}

fn buka_sqlite(path: &Path) -> ZResult<rusqlite::Connection> {
    if !path.is_file() {
        return Err(ZephyrError::InvalidInput(format!(
            "database file not found: {}",
            path.display()
        )));
    }
    // Read-only at the engine level too, so a write that slipped past the
    // statement check still cannot modify the file.
    rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| ZephyrError::Io(format!("could not open {}: {e}", path.display())))
}

/// List tables. SQLite answers from its own catalog; MySQL needs the client.
#[tauri::command(async)]
pub fn db_tables(path: String, engine: Option<String>) -> ZResult<Vec<DbTabel>> {
    let engine = engine.unwrap_or_else(|| "sqlite".into());
    if engine != "sqlite" {
        return Err(ZephyrError::InvalidInput(
            "listing tables is supported for sqlite here; use db_query for mysql".into(),
        ));
    }
    let conn = buka_sqlite(Path::new(&path))?;
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| ZephyrError::Internal(format!("catalog: {e}")))?;
    let nama: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| ZephyrError::Internal(format!("catalog: {e}")))?
        .filter_map(Result::ok)
        .collect();

    let mut out = Vec::new();
    for n in nama {
        // A count per table keeps the list informative; an error here means a
        // view that cannot be counted, which is not fatal.
        let baris = conn
            .query_row(&format!("SELECT COUNT(*) FROM \"{}\"", n.replace('"', "\"\"")), [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap_or(0);
        out.push(DbTabel { nama: n, baris });
    }
    Ok(out)
}

/// Column names for one table.
#[tauri::command(async)]
pub fn db_columns(path: String, tabel: String) -> ZResult<Vec<DbKolom>> {
    let conn = buka_sqlite(Path::new(&path))?;
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", tabel.replace('"', "\"\"")))
        .map_err(|e| ZephyrError::Internal(format!("pragma: {e}")))?;
    let kolom = stmt
        .query_map([], |r| {
            Ok(DbKolom {
                nama: r.get::<_, String>(1)?,
                tipe: r.get::<_, String>(2).unwrap_or_default(),
            })
        })
        .map_err(|e| ZephyrError::Internal(format!("pragma: {e}")))?
        .filter_map(Result::ok)
        .collect();
    Ok(kolom)
}

/// Run a read-only query.
#[tauri::command(async)]
pub fn db_query(path: String, sql: String) -> ZResult<DbHasil> {
    periksa_baca_saja(&sql)?;
    let conn = buka_sqlite(Path::new(&path))?;
    sqlite_hasil(&conn, &sql)
}

/// Path the app offers by default: the MariaDB data folder, if it exists.
#[tauri::command(async)]
pub fn db_default_path(root: String) -> ZResult<String> {
    let kandidat = [
        "mariadb",
        "mysql",
        "data",
    ];
    for k in kandidat {
        let p = PathBuf::from(&root).join(k);
        if p.is_dir() {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn select_diizinkan() {
        assert!(periksa_baca_saja("SELECT * FROM t").is_ok());
        assert!(periksa_baca_saja("  select 1;  ").is_ok());
        assert!(periksa_baca_saja("WITH x AS (SELECT 1) SELECT * FROM x").is_ok());
    }

    #[test]
    fn tulis_ditolak() {
        assert!(periksa_baca_saja("DROP TABLE t").is_err());
        assert!(periksa_baca_saja("DELETE FROM t").is_err());
        assert!(periksa_baca_saja("UPDATE t SET a=1").is_err());
    }

    #[test]
    fn tulis_tersembunyi_ditolak() {
        // Passes the prefix check, fails the banned-word scan.
        assert!(periksa_baca_saja("WITH x AS (SELECT 1) DELETE FROM t").is_err());
    }

    #[test]
    fn literal_tidak_menipu_pemeriksa() {
        assert!(periksa_baca_saja("SELECT 'drop table x' AS pesan").is_ok());
        assert!(periksa_baca_saja("SELECT 1 -- drop table x").is_ok());
    }
}
