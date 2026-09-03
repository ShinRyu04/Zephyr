// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Mode credential helper: dijalankan git sebagai proses terpisah
    // (`zephyr git-credential get`). Harus ditangani SEBELUM Tauri start —
    // helper hanya menulis jawaban ke stdout lalu keluar, tanpa membuka
    // window dan tanpa menyentuh state aplikasi utama.
    if zephyr_lib::run_credential_helper() {
        return;
    }
    // fase 28: `zephyr --help` / `--version` juga mode konsol. Sama alasannya —
    // membuka window untuk mencetak satu baris teks membuat editor berkedip
    // tiap kali user cuma memeriksa versi.
    if zephyr_lib::run_cli_console() {
        return;
    }
    zephyr_lib::run()
}
