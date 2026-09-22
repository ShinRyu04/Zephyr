// proc.rs — pembuat proses terpusat.
//
// KENAPA modul ini ada: di Windows, setiap `Command::new()` dari proses GUI
// memunculkan jendela konsol sekejap kecuali diberi flag CREATE_NO_WINDOW.
// Sebelumnya flag itu ditulis manual di tiap tempat pemanggilan, dan beberapa
// terlewat — akibatnya membuka Zephyr memunculkan jendela terminal yang lalu
// hilang (dan setiap operasi git/debug/reveal bisa memunculkan lagi).
//
// Aturan: JANGAN panggil `std::process::Command::new` / `tokio::process::Command::new`
// langsung dari modul lain. Pakai `cmd()` / `tokio_cmd()` di sini, supaya
// tidak ada spawn yang lolos tanpa flag.

use std::ffi::OsStr;
use std::process::Command;

/// `CREATE_NO_WINDOW` — proses anak jalan tanpa jendela konsol.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Proses anak yang tidak boleh terlihat. Pakai ini untuk semua pemanggilan
/// `std::process::Command` dari dalam aplikasi.
pub fn cmd<S: AsRef<OsStr>>(program: S) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// Versi async (`tokio::process::Command`) dari `cmd()`.
pub fn tokio_cmd<S: AsRef<OsStr>>(program: S) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        // `creation_flags` di tokio adalah method bawaan, bukan trait.
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper harus benar-benar menjalankan program (bukan cuma membentuk
    /// struct) dan menangkap outputnya tanpa jendela konsol.
    #[test]
    fn cmd_menjalankan_program() {
        let out = cmd("cmd").args(["/c", "echo zephyr"]).output();
        #[cfg(windows)]
        {
            let out = out.expect("cmd harus jalan");
            assert!(String::from_utf8_lossy(&out.stdout).contains("zephyr"));
        }
        #[cfg(not(windows))]
        {
            let _ = out;
        }
    }
}
