/**
 * mcp_stdio.rs - klien MCP lewat transport STDIO.
 *
 * ## Kenapa berkas ini ada
 *
 * Sampai sekarang Zephyr hanya bisa bicara ke server MCP yang sudah hidup di
 * sebuah URL (`mcp_client.rs`). Itu menutup hampir SELURUH ekosistem: server
 * MCP yang dipasang dari katalog (Context7, GitHub, Sequential Thinking,
 * Filesystem, Memory, Puppeteer, ...) hampir semuanya didistribusikan sebagai
 * perintah yang dijalankan klien (`npx -y @modelcontextprotocol/server-x`),
 * lalu bicara JSON-RPC lewat stdin/stdout. Tanpa transport ini, tombol
 * "Install" di katalog hanya bisa menyimpan baris yang tidak pernah dipakai -
 * dan itu persis jenis janji palsu yang harus dihindari.
 *
 * ## Bentuk protokolnya
 *
 * JSON-RPC 2.0, satu pesan per baris (`newline-delimited`), di atas stdin dan
 * stdout proses anak. Bukan HTTP, bukan SSE, bukan Content-Length framing.
 * Server MCP memakai framing itu untuk transport `stdio`; klien yang memakai
 * `Content-Length` akan menggantung selamanya karena server tidak pernah
 * mengirim header itu.
 *
 * ## Kenapa prosesnya TIDAK dimatikan setelah satu panggilan
 *
 * `npx -y <paket>` butuh detik-an untuk menyiapkan paket di pemanggilan
 * pertama. Kalau tiap `tools/list` atau `tools/call` membuka proses baru,
 * panggilan pertama selalu lambat dan setiap panggilan berikutnya membayar
 * ongkos itu lagi. Prosesnya karena itu disimpan per-server dan dipakai ulang.
 *
 * Konsekuensinya harus jujur diakui: proses anak tetap hidup setelah panggilan
 * selesai, persis seperti server MCP yang dijalankan user sendiri. Itu memang
 * harga dari transport stdio - klien yang mematikannya setiap kali akan
 * kehilangan state server (sesi, cache, koneksi database).
 */
use crate::errors::{ZResult, ZephyrError};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Satu proses server MCP yang hidup, beserta pipa bicaranya.
struct SesiStdio {
    child: Child,
    masuk: ChildStdin,
    keluar: BufReader<ChildStdout>,
    /// Nomor pesan JSON-RPC. Naik tiap panggilan; id yang sama dipakai lagi
    /// akan membuat jawaban tertukar, jadi ia harus terus naik.
    berikut: u64,
}

/*
 * Peta sesi, dikunci sekali.
 *
 * `Mutex` di sini melindungi SATU proses dari dua panggilan bersamaan: menulis
 * dua permintaan lalu membaca dua jawaban secara paralel akan membuat jawaban
 * tertukar antar-pemanggil. Selama satu proses dipakai bersama, seluruh
 * urutan tulis-baca harus jadi satu operasi.
 */
fn sesi() -> &'static Mutex<HashMap<String, SesiStdio>> {
    static PETA: OnceLock<Mutex<HashMap<String, SesiStdio>>> = OnceLock::new();
    PETA.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Batas waktu satu panggilan, dalam detik.
///
/// Dua puluh detik, bukan tiga puluh: `npx` yang harus mengunduh paket besar
/// masih bisa lewat, sementara server yang menggantung karena salah konfigurasi
/// tidak menahan agen selama satu menit penuh. Server yang butuh lebih lama
/// untuk SATU tool (indeks repo, query database besar) tetap bisa - yang
/// dibatasi adalah menunggu jawaban yang tidak akan datang.
const BATAS_PANGGILAN: Duration = Duration::from_secs(20);

fn kunci(id: &str) -> String {
    id.trim().to_string()
}

/**
 * Pastikan ada proses hidup untuk server ini; kembalikan kunci petanya.
 *
 * Server yang sudah mati (prosesnya keluar karena crash atau `exit`) TIDAK
 * dipakai lagi: prosesnya dibuang lebih dulu, lalu dijalankan ulang. Tanpa ini,
 * satu server yang mati sekali akan terus menjawab "pipa tertutup" sampai app
 * di-restart - dan pesan itu terbaca seperti konfigurasi yang salah, padahal
 * prosesnya cuma perlu dijalankan lagi.
 */
fn pastikan_hidup(id: &str, perintah: &str, args: &[String], cwd: Option<&str>) -> ZResult<()> {
    let k = kunci(id);
    let mut peta = sesi()
        .lock()
        .map_err(|_| ZephyrError::Mcp("kunci sesi MCP stdio rusak".into()))?;

    if let Some(s) = peta.get_mut(&k) {
        match s.child.try_wait() {
            Ok(None) => return Ok(()),   // masih hidup
            Ok(Some(_)) => {
                /* Keluar sendiri: buang, lalu jalankan ulang di bawah. */
                peta.remove(&k);
            }
            Err(_) => {
                peta.remove(&k);
            }
        }
    }

    let nama = perintah.trim();
    if nama.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "perintah server MCP stdio kosong".into(),
        ));
    }

    let mut cmd = Command::new(nama);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        /* stderr DIBUANG, bukan diwarisi: server MCP yang berisik akan menulis
           log ke stderr, dan itu tampil di terminal Zephyr seolah-olah app yang
           mencetaknya. Yang penting bagi pemakai adalah pesan galat yang
           dilempar ke atas, bukan log internal server. */
        .stderr(Stdio::null());
    if let Some(dir) = cwd.map(str::trim).filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| ZephyrError::Mcp(format!("gagal menjalankan server MCP '{nama}': {e}")))?;
    let masuk = child
        .stdin
        .take()
        .ok_or_else(|| ZephyrError::Mcp("stdin server MCP tidak bisa dibuka".into()))?;
    let keluar = child
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::Mcp("stdout server MCP tidak bisa dibuka".into()))?;

    peta.insert(
        k,
        SesiStdio {
            child,
            masuk,
            keluar: BufReader::new(keluar),
            berikut: 1,
        },
    );
    Ok(())
}

/**
 * Kirim satu permintaan JSON-RPC, tunggu jawabannya, kembalikan `result`.
 *
 * Jawaban yang id-nya tidak cocok DILEWATI, bukan dianggap jawaban: server
 * boleh mengirim notifikasi (`method` tanpa `id`) di antara permintaan dan
 * jawaban, dan notifikasi pertama yang datang bukan jawaban dari panggilan ini.
 * Menganggapnya jawaban akan membuat hasil tool tertukar dengan notifikasi.
 */
fn rpc_stdio(
    id: &str,
    perintah: &str,
    args: &[String],
    cwd: Option<&str>,
    method: &str,
    params: Value,
) -> ZResult<Value> {
    pastikan_hidup(id, perintah, args, cwd)?;
    let k = kunci(id);
    let mut peta = sesi()
        .lock()
        .map_err(|_| ZephyrError::Mcp("kunci sesi MCP stdio rusak".into()))?;
    let s = peta
        .get_mut(&k)
        .ok_or_else(|| ZephyrError::Mcp("sesi MCP stdio hilang setelah dijalankan".into()))?;

    let no = s.berikut;
    s.berikut += 1;
    let pesan = json!({ "jsonrpc": "2.0", "id": no, "method": method, "params": params });
    let baris = format!("{pesan}\n");

    s.masuk
        .write_all(baris.as_bytes())
        .and_then(|_| s.masuk.flush())
        .map_err(|e| ZephyrError::Mcp(format!("tidak bisa menulis ke server MCP stdio: {e}")))?;

    let tenggat = Instant::now() + BATAS_PANGGILAN;
    let mut buf = String::new();
    loop {
        if Instant::now() >= tenggat {
            /* Habis waktu: sesi dibuang supaya panggilan berikutnya memulai
               proses bersih, bukan menunggu jawaban yang tidak akan datang. */
            peta.remove(&k);
            return Err(ZephyrError::Mcp(format!(
                "server MCP stdio tidak menjawab dalam {} detik ({method})",
                BATAS_PANGGILAN.as_secs()
            )));
        }
        buf.clear();
        let n = s
            .keluar
            .read_line(&mut buf)
            .map_err(|e| ZephyrError::Mcp(format!("pipa server MCP stdio rusak: {e}")))?;
        if n == 0 {
            peta.remove(&k);
            return Err(ZephyrError::Mcp(
                "server MCP stdio menutup pipa (prosesnya berhenti)".into(),
            ));
        }
        let teks = buf.trim();
        if teks.is_empty() {
            continue;
        }
        let v: Value = match serde_json::from_str(teks) {
            Ok(v) => v,
            /* Baris yang bukan JSON = log server yang bocor ke stdout. Bukan
               jawaban, jadi dilewati - bukan dianggap galat fatal. */
            Err(_) => continue,
        };
        if v.get("id").and_then(|i| i.as_u64()) != Some(no) {
            continue; /* notifikasi atau jawaban panggilan lain */
        }
        if let Some(err) = v.get("error") {
            let pesan = err
                .get("message")
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| err.to_string());
            return Err(ZephyrError::Mcp(format!("server MCP menolak: {pesan}")));
        }
        return Ok(v.get("result").cloned().unwrap_or(Value::Null));
    }
}

/// Nama tool yang ditawarkan server stdio.
pub fn list_tools(id: &str, perintah: &str, args: &[String], cwd: Option<&str>) -> ZResult<Vec<crate::mcp_client::McpToolSpec>> {
    let result = rpc_stdio(id, perintah, args, cwd, "tools/list", json!({}))?;
    let arr = result
        .get("tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(arr
        .iter()
        .filter_map(|t| crate::mcp_client::spec_dari_json(t))
        .collect())
}

/// Panggil satu tool di server stdio.
pub fn call_tool(
    id: &str,
    perintah: &str,
    args: &[String],
    cwd: Option<&str>,
    tool: &str,
    argumen: Value,
) -> ZResult<Value> {
    let nama = tool.trim();
    if nama.is_empty() {
        return Err(ZephyrError::InvalidInput("tool empty".into()));
    }
    let a = if argumen.is_null() { json!({}) } else { argumen };
    rpc_stdio(
        id,
        perintah,
        args,
        cwd,
        "tools/call",
        json!({ "name": nama, "arguments": a }),
    )
}

/// Matikan satu sesi stdio, kalau ada. Dipakai saat server dihapus/dinonaktifkan.
pub fn matikan(id: &str) -> bool {
    let k = kunci(id);
    let Ok(mut peta) = sesi().lock() else {
        return false;
    };
    match peta.remove(&k) {
        Some(mut s) => {
            let _ = s.child.kill();
            let _ = s.child.wait();
            true
        }
        None => false,
    }
}

/// Berapa sesi stdio yang hidup - untuk pemeriksaan/uji.
pub fn jumlah_sesi_hidup() -> usize {
    sesi().lock().map(|p| p.len()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Server MCP tiruan: satu skrip yang menjawab `tools/list` lewat stdout.
    /// Dipakai untuk membuktikan framing baris-per-pesan benar-benar jalan -
    /// tanpa bergantung pada jaringan atau paket npx.
    fn tulis_server_tiruan(dir: &std::path::Path) -> String {
        let p = dir.join("server-tiruan.cmd");
        let isi = "@echo off\r\n\
node -e \"const rl=require('readline').createInterface({input:process.stdin});\
rl.on('line',(l)=>{if(!l.trim())return;const m=JSON.parse(l);\
if(m.method==='tools/list'){console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'ping',description:'p',inputSchema:{type:'object'}}]}}));}\
else{console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true,echo:m.params}}));}});\"\r\n";
        std::fs::write(&p, isi).expect("tulis server tiruan");
        p.to_string_lossy().to_string()
    }

    #[test]
    fn framing_baris_per_pesan_menjawab_tools_list() {
        if !cfg!(windows) {
            return; /* skrip tiruannya .cmd; uji ini untuk host Windows */
        }
        let dir = std::env::temp_dir();
        let cmd = tulis_server_tiruan(&dir);
        let hasil = list_tools("uji-tiruan", &cmd, &[], None);
        let _ = matikan("uji-tiruan");
        let daftar = hasil.expect("tools/list harus terjawab");
        assert_eq!(daftar.len(), 1);
        assert_eq!(daftar[0].name, "ping");
    }

    #[test]
    fn jawaban_dengan_id_lain_dilewati_bukan_dianggap_jawaban() {
        if !cfg!(windows) {
            return;
        }
        let dir = std::env::temp_dir();
        let p = dir.join("server-notif.cmd");
        /* Server yang mengirim NOTIFIKASI dulu (tanpa id), baru jawaban. Klien
           yang menerima notifikasi sebagai jawaban akan mengembalikan null. */
        let isi = "@echo off\r\n\
node -e \"const rl=require('readline').createInterface({input:process.stdin});\
rl.on('line',(l)=>{if(!l.trim())return;const m=JSON.parse(l);\
console.log(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{}}));\
console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'x',description:'',inputSchema:{}}]}}));});\"\r\n";
        std::fs::write(&p, isi).expect("tulis server notifikasi");
        let hasil = list_tools("uji-notif", &p.to_string_lossy(), &[], None);
        let _ = matikan("uji-notif");
        let daftar = hasil.expect("jawaban setelah notifikasi harus terbaca");
        assert_eq!(daftar.len(), 1);
        assert_eq!(daftar[0].name, "x");
    }
}
