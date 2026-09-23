use std::io::{BufRead, Write};

pub fn handle_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();

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

pub fn respond(op: &str, input: &[(String, String)]) -> String {
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

    let is_github = host == "github.com" || host == "www.github.com";
    if !is_github {
        return String::new();
    }

    if !protocol.is_empty() && protocol != "https" {
        return String::new();
    }

    let state = crate::app_state::AppState::new();
    let token = match crate::github::active_token(&state) {
        Some(t) => t,
        None => return String::new(),
    };
    let user = crate::github::stored_user(&state).unwrap_or_else(|| "x-access-token".to_string());
    format!("username={user}\npassword={token}\n")
}
