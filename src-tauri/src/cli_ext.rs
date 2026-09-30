use std::path::{Path, PathBuf};

use crate::errors::{ZResult, ZephyrError};

#[derive(Debug, Clone, PartialEq)]
pub enum Sub {
    ExtList,

    ExtInstall(String),

    ExtRemove(String),

    ExtRegistry(Option<String>),

    Info,

    ExtHelp,
}

pub fn parse_sub(argv: &[String]) -> Option<Sub> {
    if argv.is_empty() {
        return None;
    }

    if argv[0] != "ext" && argv[0] != "info" {
        return None;
    }
    if argv[0] == "info" {
        return Some(Sub::Info);
    }

    match argv.get(1).map(|s| s.as_str()) {
        Some("list") | Some("ls") => Some(Sub::ExtList),
        Some("install") | Some("i") | Some("add") => match argv.get(2) {
            Some(x) if !x.starts_with('-') => Some(Sub::ExtInstall(x.clone())),
            _ => Some(Sub::ExtInstall(String::new())),
        },
        Some("remove") | Some("rm") | Some("uninstall") => match argv.get(2) {
            Some(x) if !x.starts_with('-') => Some(Sub::ExtRemove(x.clone())),
            _ => Some(Sub::ExtRemove(String::new())),
        },
        Some("registry") => Some(Sub::ExtRegistry(argv.get(2).cloned())),

        _ => Some(Sub::ExtHelp),
    }
}

pub fn portable_aktif() -> bool {
    match std::env::current_exe() {
        Ok(exe) => exe
            .parent()
            .map(|d| d.join("portable").is_file())
            .unwrap_or(false),
        Err(_) => false,
    }
}

pub fn dir_data() -> PathBuf {
    if portable_aktif() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(d) = exe.parent() {
                return d.join("data");
            }
        }
    }
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("zephyr")
}

pub fn teks_ext_help(warna: bool) -> String {
    let (a, d) = if warna {
        (crate::cli::ACCENT_PUB, crate::cli::DIM_PUB)
    } else {
        ("", "")
    };
    format!(
        "{a}zephyr ext{d} — manage extensions from the command line\n\n\
         {a}Usage{d}\n  \
         zephyr ext list                 list installed extensions\n  \
         zephyr ext install <id|url>     install from registry or URL\n  \
         zephyr ext remove <id>          remove an extension\n  \
         zephyr ext registry             show the registry URL\n  \
         zephyr ext registry <url>       set the registry URL\n\n\
         {a}Note{d}\n  \
         Extensions are installed into the Zephyr data folder. If the app is running,\n  \
         changes appear immediately after the Extensions panel is reopened.\n",
        a = a,
        d = d
    )
}

pub fn daftar_terpasang(dir: &Path) -> ZResult<Vec<(String, String, String)>> {
    let file = dir.join("extensions").join("installed.json");
    if !file.is_file() {
        return Ok(Vec::new());
    }
    let teks = std::fs::read_to_string(&file)
        .map_err(|e| ZephyrError::Io(format!("failed membaca {}: {e}", file.display())))?;

    let mut hasil = Vec::new();
    for blok in teks.split('{').skip(1) {
        let ambil = |kunci: &str| -> Option<String> {
            let i = blok.find(&format!("\"{kunci}\""))?;
            let sisa = &blok[i..];
            let a = sisa.find(':')? + 1;
            let sisa = sisa[a..].trim_start();
            let sisa = sisa.strip_prefix('"')?;
            let akhir = sisa.find('"')?;
            Some(sisa[..akhir].to_string())
        };
        let id = ambil("id").unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        hasil.push((
            id,
            ambil("versi")
                .or_else(|| ambil("version"))
                .unwrap_or_default(),
            ambil("nama").or_else(|| ambil("name")).unwrap_or_default(),
        ));
    }
    Ok(hasil)
}

pub fn jalankan(argv: &[String]) -> bool {
    let Some(sub) = parse_sub(argv) else {
        return false;
    };

    #[cfg(windows)]
    crate::cli::attach_console_pub();

    let warna = crate::cli::stdout_tty_pub();
    let dir = dir_data();

    let keluaran = match sub {
        Sub::Info => {
            let p = portable_aktif();
            format!(
                "Zephyr {}\nmode      : {}\nfolder data: {}\n",
                env!("CARGO_PKG_VERSION"),
                if p { "portable" } else { "installed" },
                dir.display()
            )
        }
        Sub::ExtList => match daftar_terpasang(&dir) {
            Ok(list) if list.is_empty() => "No extensions installed yet.\n".to_string(),
            Ok(list) => {
                let mut s = format!("{} extensions installed:\n", list.len());
                for (id, versi, nama) in list {
                    s.push_str(&format!(
                        "  {:<28} {:<10} {}\n",
                        id,
                        versi,
                        if nama.is_empty() { "-" } else { &nama }
                    ));
                }
                s
            }
            Err(e) => format!("failed to read extension list: {e}\n"),
        },
        Sub::ExtHelp => teks_ext_help(warna),
        Sub::ExtInstall(x) if x.is_empty() => teks_ext_help(warna),
        Sub::ExtInstall(x) => {
            format!(
                "To install \"{x}\":\n  \
                 1. open Zephyr\n  \
                 2. Ctrl+Shift+P → \"Extensions: Install\"\n  \
                 3. paste: {x}\n\n\
                 Direct CLI installation is not yet available because it needs\n\
                 signature verification + runtime checks that only exist\n\
                 inside the app.\n"
            )
        }
        Sub::ExtRemove(x) if x.is_empty() => teks_ext_help(warna),
        Sub::ExtRemove(x) => {
            let target = dir.join("extensions").join(&x);
            if !target.exists() {
                format!("Extension \"{x}\" not found in {}.\n", dir.display())
            } else {
                match std::fs::remove_dir_all(&target) {
                    Ok(_) => format!("Extension \"{x}\" removed.\n"),
                    Err(e) => format!("failed to remove \"{x}\": {e}\n"),
                }
            }
        }
        Sub::ExtRegistry(None) => {
            let f = dir.join("extensions").join("registry-url.txt");
            let url = std::fs::read_to_string(&f).unwrap_or_default();
            if url.trim().is_empty() {
                "Registry: built-in (index bundled with the app).\n".to_string()
            } else {
                format!("Registry: {}\n", url.trim())
            }
        }
        Sub::ExtRegistry(Some(url)) => {
            let f = dir.join("extensions").join("registry-url.txt");
            if let Some(p) = f.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            match std::fs::write(&f, url.trim()) {
                Ok(_) => format!("Registry set to: {}\n", url.trim()),
                Err(e) => format!("failed to write registry: {e}\n"),
            }
        }
    };

    use std::io::Write;
    let out = std::io::stdout();
    let mut lock = out.lock();
    let _ = lock.write_all(keluaran.as_bytes());
    let _ = lock.flush();
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sub_mengenali_ext() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(parse_sub(&a(&["ext", "list"])), Some(Sub::ExtList));
        assert_eq!(
            parse_sub(&a(&["ext", "install", "tema-gelap"])),
            Some(Sub::ExtInstall("tema-gelap".into()))
        );
        assert_eq!(
            parse_sub(&a(&["ext", "remove", "x"])),
            Some(Sub::ExtRemove("x".into()))
        );
        assert_eq!(
            parse_sub(&a(&["ext", "registry", "https://a/b.json"])),
            Some(Sub::ExtRegistry(Some("https://a/b.json".into())))
        );
        assert_eq!(parse_sub(&a(&["info"])), Some(Sub::Info));

        assert_eq!(parse_sub(&a(&["ext"])), Some(Sub::ExtHelp));
    }

    #[test]
    fn parse_sub_tidak_menyerobot_nama_file() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(parse_sub(&a(&["main.ts"])), None);
        assert_eq!(parse_sub(&a(&["src/ext.rs"])), None);
        assert_eq!(parse_sub(&[]), None);

        assert_eq!(parse_sub(&a(&["--help", "ext"])), None);
    }

    #[test]
    fn parse_sub_install_tanpa_argumen_aman() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        assert_eq!(
            parse_sub(&a(&["ext", "install"])),
            Some(Sub::ExtInstall(String::new()))
        );
        assert_eq!(
            parse_sub(&a(&["ext", "install", "--force"])),
            Some(Sub::ExtInstall(String::new()))
        );
    }

    #[test]
    fn dir_data_portable_mengikuti_exe() {
        let d = dir_data();
        assert!(
            d.to_string_lossy().len() > 3,
            "dir data aneh: {}",
            d.display()
        );
        assert!(d.to_string_lossy().contains("zephyr") || portable_aktif());
    }

    #[test]
    fn daftar_terpasang_file_tidak_ada_kosong() {
        let r = daftar_terpasang(Path::new("D:/tidak-ada-xyz")).unwrap();
        assert!(r.is_empty());
    }

    #[test]
    fn daftar_terpasang_parse_json_sederhana() {
        let dir = std::env::temp_dir().join("zephyr-cli-ext-test");
        let ext = dir.join("extensions");
        let _ = std::fs::create_dir_all(&ext);
        let f = ext.join("installed.json");
        std::fs::write(
            &f,
            r#"[{"id":"tema-gelap","versi":"1.2.0","nama":"Tema Gelap"},
                {"id":"linter","versi":"0.3.1","nama":"Linter"}]"#,
        )
        .unwrap();
        let r = daftar_terpasang(&dir).unwrap();
        assert_eq!(r.len(), 2, "{r:?}");
        assert_eq!(r[0].0, "tema-gelap");
        assert_eq!(r[0].1, "1.2.0");
        assert_eq!(r[1].2, "Linter");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn teks_ext_help_memuat_semua_subcommand() {
        let t = teks_ext_help(false);
        for k in ["list", "install", "remove", "registry"] {
            assert!(t.contains(k), "bantuan tidak memuat {k}");
        }
    }
}
