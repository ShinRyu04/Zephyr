#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if zephyr_lib::run_credential_helper() {
        return;
    }

    if zephyr_lib::run_cli_console() {
        return;
    }
    zephyr_lib::run()
}
