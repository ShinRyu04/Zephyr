// ports.rs: TCP ports currently listening on this machine.
//
// KENAPA di Rust: daftar port hanya bisa dibaca lewat tabel socket sistem
// (GetExtendedTcpTable di Windows, /proc/net/tcp di Linux). Renderer tidak
// punya akses ke sana.
//
// KENAPA GetExtendedTcpTable, bukan `netstat`: netstat menulis proses cmd
// tersembunyi tiap pemanggilan (console flash, yang justru sedang dihindari
// proyek ini) dan keluarannya harus diurai sebagai teks yang formatnya
// berubah antar versi Windows.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub alamat: String,
    pub proses: String,
    pub pid: u32,
}

/// Ports worth showing: drop system ports and Zephyr's own ports.
///
/// KENAPA ada daftar buang: panel Ports dimaksudkan untuk dev server yang user
/// jalankan. Menampilkan 135, 445, 5040, dan debug port WebView2 hanya
/// membanjiri daftar dengan hal yang tidak bisa dibuka.
const ABAIKAN: &[u16] = &[
    135, 137, 138, 139, 445, 5040, 5353, 5355, 7680, 9223, 9224, 9225, 9226,
];

#[cfg(windows)]
mod sys {
    use super::PortInfo;
    use crate::errors::{ZResult, ZephyrError};
    use std::collections::HashMap;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MibTcpRowOwnerPid {
        state: u32,
        local_addr: u32,
        local_port: u32,
        remote_addr: u32,
        remote_port: u32,
        owning_pid: u32,
    }

    #[link(name = "iphlpapi")]
    extern "system" {
        fn GetExtendedTcpTable(
            table: *mut u8,
            size: *mut u32,
            order: i32,
            af: u32,
            class: u32,
            reserved: u32,
        ) -> u32;
    }

    const AF_INET: u32 = 2;
    const TCP_TABLE_OWNER_PID_ALL: u32 = 5;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
    const NO_ERROR: u32 = 0;
    const MIB_TCP_STATE_LISTEN: u32 = 2;

    /// Baca tabel TCP sekali. Mengembalikan baris mentah untuk IPv4.
    fn baris() -> ZResult<Vec<MibTcpRowOwnerPid>> {
        let mut ukuran: u32 = 0;
        // Panggilan pertama dengan buffer nol: hanya untuk mendapatkan ukuran.
        unsafe {
            GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut ukuran,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            );
        }
        if ukuran == 0 {
            return Ok(Vec::new());
        }

        let mut buf = vec![0u8; ukuran as usize];
        let rc = unsafe {
            GetExtendedTcpTable(
                buf.as_mut_ptr(),
                &mut ukuran,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if rc == ERROR_INSUFFICIENT_BUFFER {
            return Err(ZephyrError::InvalidInput(
                "tabel TCP berubah saat dibaca, coba lagi".into(),
            ));
        }
        if rc != NO_ERROR {
            return Err(ZephyrError::InvalidInput(format!(
                "GetExtendedTcpTable gagal (kode {rc})"
            )));
        }

        let jumlah = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
        let mulai = std::mem::size_of::<u32>();
        let lebar = std::mem::size_of::<MibTcpRowOwnerPid>();
        let mut hasil = Vec::with_capacity(jumlah);
        for i in 0..jumlah {
            let o = mulai + i * lebar;
            if o + lebar > buf.len() {
                break;
            }
            let r =
                unsafe { std::ptr::read_unaligned(buf[o..].as_ptr() as *const MibTcpRowOwnerPid) };
            hasil.push(r);
        }
        Ok(hasil)
    }

    /// Build a pid-to-process-name map from ONE system snapshot.
    ///
    /// WHY the map and not a lookup per pid: CreateToolhelp32Snapshot walks the
    /// entire process table, and the first version called it once per listening
    /// port. On a machine with 25 listening ports that is 25 full process
    /// enumerations per scan, every 5 seconds, which is visible as stutter in
    /// the whole window. One snapshot serves every port.
    fn peta_pid_ke_nama() -> HashMap<u32, String> {
        #[repr(C)]
        struct ProcessEntry32 {
            dw_size: u32,
            cnt_usage: u32,
            th32_process_id: u32,
            th32_default_heap_id: usize,
            th32_module_id: u32,
            cnt_threads: u32,
            th32_parent_process_id: u32,
            pc_pri_class_base: i32,
            dw_flags: u32,
            sz_exe_file: [u8; 260],
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> isize;
            fn Process32First(snap: isize, entry: *mut ProcessEntry32) -> i32;
            fn Process32Next(snap: isize, entry: *mut ProcessEntry32) -> i32;
            fn CloseHandle(h: isize) -> i32;
        }
        const TH32CS_SNAPPROCESS: u32 = 0x2;
        const INVALID: isize = -1;

        let mut peta = HashMap::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID {
                return peta;
            }
            let mut e: ProcessEntry32 = std::mem::zeroed();
            e.dw_size = std::mem::size_of::<ProcessEntry32>() as u32;
            if Process32First(snap, &mut e) != 0 {
                loop {
                    let akhir = e
                        .sz_exe_file
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(e.sz_exe_file.len());
                    let nama = String::from_utf8_lossy(&e.sz_exe_file[..akhir]).to_string();
                    peta.insert(e.th32_process_id, nama);
                    if Process32Next(snap, &mut e) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
        }
        peta
    }

    pub fn daftar() -> ZResult<Vec<PortInfo>> {
        let mut peta: HashMap<u16, PortInfo> = HashMap::new();
        let nama_pid = peta_pid_ke_nama();
        for r in baris()? {
            if r.state != MIB_TCP_STATE_LISTEN {
                continue;
            }
            let port = u16::from_be((r.local_port & 0xFFFF) as u16);
            if port == 0 || super::ABAIKAN.contains(&port) {
                continue;
            }
            // Alamat disimpan little-endian di struktur ini.
            let a = r.local_addr.to_le_bytes();
            let alamat = if a == [0, 0, 0, 0] {
                "0.0.0.0".to_string()
            } else if a == [127, 0, 0, 1] {
                "127.0.0.1".to_string()
            } else {
                format!("{}.{}.{}.{}", a[0], a[1], a[2], a[3])
            };
            peta.entry(port).or_insert(PortInfo {
                port,
                alamat,
                proses: nama_pid.get(&r.owning_pid).cloned().unwrap_or_default(),
                pid: r.owning_pid,
            });
        }
        let mut hasil: Vec<PortInfo> = peta.into_values().collect();
        hasil.sort_by_key(|p| p.port);
        Ok(hasil)
    }
}

#[cfg(not(windows))]
mod sys {
    use super::PortInfo;
    use crate::errors::ZResult;

    /// Di Linux, daftar socket ada di /proc/net/tcp. Formatnya hex, dan
    /// kepemilikan proses dibaca dari /proc/<pid>/fd (butuh hak akses root
    /// for processes owned by other users, so the name may be empty).
    pub fn daftar() -> ZResult<Vec<PortInfo>> {
        use std::collections::HashMap;
        let mut peta: HashMap<u16, PortInfo> = HashMap::new();
        let isi = std::fs::read_to_string("/proc/net/tcp").unwrap_or_default();
        for baris in isi.lines().skip(1) {
            let kolom: Vec<&str> = baris.split_whitespace().collect();
            if kolom.len() < 4 || kolom[3] != "0A" {
                continue;
            }
            let Some((alamat_hex, port_hex)) = kolom[1].split_once(':') else {
                continue;
            };
            let Ok(port) = u16::from_str_radix(port_hex, 16) else {
                continue;
            };
            if port == 0 || super::ABAIKAN.contains(&port) {
                continue;
            }
            let Ok(nilai) = u32::from_str_radix(alamat_hex, 16) else {
                continue;
            };
            let b = nilai.to_le_bytes();
            let alamat = if b == [0, 0, 0, 0] {
                "0.0.0.0".to_string()
            } else {
                format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
            };
            peta.entry(port).or_insert(PortInfo {
                port,
                alamat,
                proses: String::new(),
                pid: 0,
            });
        }
        let mut hasil: Vec<PortInfo> = peta.into_values().collect();
        hasil.sort_by_key(|p| p.port);
        Ok(hasil)
    }
}

/// Listening ports, sorted from the lowest number.
#[tauri::command(async)]
pub fn ports_list() -> ZResult<Vec<PortInfo>> {
    sys::daftar()
}

/// Proses pemilik sebuah port, dipakai tombol "matikan proses".
#[tauri::command(async)]
pub fn ports_kill(pid: u32) -> ZResult<bool> {
    if pid == 0 {
        return Err(ZephyrError::InvalidInput("pid tidak valid".into()));
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn OpenProcess(akses: u32, inherit: i32, pid: u32) -> isize;
            fn TerminateProcess(h: isize, kode: u32) -> i32;
            fn CloseHandle(h: isize) -> i32;
        }
        const PROCESS_TERMINATE: u32 = 0x0001;
        unsafe {
            let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if h == 0 {
                return Err(ZephyrError::InvalidInput(
                    "tidak bisa membuka proses (hak akses ditolak)".into(),
                ));
            }
            let ok = TerminateProcess(h, 1);
            CloseHandle(h);
            if ok == 0 {
                return Err(ZephyrError::InvalidInput(
                    "gagal menghentikan proses".into(),
                ));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let ok = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return Err(ZephyrError::InvalidInput(
                "gagal menghentikan proses".into(),
            ));
        }
    }
    Ok(true)
}
