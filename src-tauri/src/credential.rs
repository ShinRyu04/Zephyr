// credential.rs — subcommand `zephyr git-credential get|store|erase`.
//
// Ini BUKAN command Tauri: dijalankan git sebagai proses terpisah, tanpa
// window, lewat argumen yang disisipkan git.rs per-invocation:
//
//   git -c credential.helper= \
//       -c credential.helper='!"<zephyr.exe>" git-credential' push
//
// Kontrak protokol credential git: baris `key=value` dari stdin, diakhiri
// baris kosong; balasan ditulis ke stdout dengan bentuk yang sama.
//
// BATAS YANG DISENGAJA (invariant §10.3):
//   * hanya menjawab untuk host github.com — host lain dijawab KOSONG
//     supaya credential manager milik user (GCM) tetap yang menangani.
//     Karena itu `git push` dari terminal biasa tidak berubah perilaku.
//   * `store` dan `erase` NO-OP: token dikelola Zephyr, git tidak boleh
//     menyalinnya ke tempat lain.
//   * token tidak pernah muncul di argv (hanya di stdout proses ini) dan
//     tidak pernah ditulis ke log.

use std::io::{BufRead, Write};

/// true = argumen memang untuk mode helper, dan sudah ditangani di sini.
/// Dipanggil paling awal di main(), sebelum Tauri dijalankan.
pub fn handle_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();
    // args[0] = exe; args[1] = "git-credential"; args[2] = get|store|erase
    if args.len() < 2 || args[1] != "git-credential" {
        return false;
    }
    let op = args.get(2).map(|s| s.as_str()).unwrap_or("get");
    let input = read_stdin_kv();
    let out = respond(op, &input);
    if !out.is_empty() {
        let stdout = std::io::stdout();
        let mut lock = stdout.lock();
        let _ = lock.write_all(out.as_bytes());
        let _ = lock.flush();
    }
    true
}

/// Baca pasangan key=value dari stdin sampai baris kosong / EOF.
fn read_stdin_kv() -> Vec<(String, String)> {
    let mut out = Vec::new();
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let t = line.trim_end_matches(['\r', '\n']);
        if t.is_empty() {
            break;
        }
        if let Some((k, v)) = t.split_once('=') {
            out.push((k.to_string(), v.to_string()));
        }
    }
    out
}

/// Bagian yang bisa diuji tanpa proses/stdin (tests_git.rs & V12).
pub fn respond(op: &str, input: &[(String, String)]) -> String {
    // store/erase: sengaja tidak melakukan apa pun.
    if op != "get" {
        return String::new();
    }
    let get = |k: &str| {
        input
            .iter()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.trim().to_ascii_lowercase())
    };
    let host = get("host").unwrap_or_default();
    let protocol = get("protocol").unwrap_or_default();

    // Host lain → kosong (GCM/sistem yang menangani).
    let is_github = host == "github.com" || host == "www.github.com";
    if !is_github {
        return String::new();
    }
    // Hanya HTTPS; SSH tidak lewat credential helper.
    if !protocol.is_empty() && protocol != "https" {
        return String::new();
    }

    // Ambil token dari secrets (Rust-only). Tanpa AppHandle: pakai jalur
    // data dir yang sama seperti aplikasi utama.
    let state = crate::app_state::AppState::new();
    let token = match crate::github::active_token(&state) {
        Some(t) => t,
        None => return String::new(),
    };
    let user = crate::github::stored_user(&state).unwrap_or_else(|| "x-access-token".to_string());
    format!("username={user}\npassword={token}\n")
}
