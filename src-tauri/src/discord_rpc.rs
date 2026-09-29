use crate::app_state::AppState;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const CLIENT_ID: &str = "1554470184771649629";
const ASSET_KEY: &str = "icon-source";

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start(app: AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::Builder::new()
        .name("zephyr-discord-rpc".into())
        .spawn(move || {
            let start_time = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            while RUNNING.load(Ordering::Relaxed) {
                let mut client = match DiscordIpcClient::new(CLIENT_ID) {
                    c => c,
                };

                if client.connect().is_ok() {
                    tracing::info!("Discord RPC: terhubung ke Discord");

                    while RUNNING.load(Ordering::Relaxed) {
                        let state_str = {
                            let st = app.state::<AppState>();
                            if let Some(ws) = st.workspace_path() {
                                let name = ws
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("Workspace");
                                format!("Workspace: {}", name)
                            } else {
                                "Ready to code".to_string()
                            }
                        };

                        let act = activity::Activity::new()
                            .state(&state_str)
                            .details("Lightweight AI Code Editor")
                            .assets(
                                activity::Assets::new()
                                    .large_image(ASSET_KEY)
                                    .large_text("Zephyr Editor"),
                            )
                            .timestamps(activity::Timestamps::new().start(start_time));

                        if client.set_activity(act).is_err() {
                            tracing::warn!("Discord RPC: koneksi terputus");
                            let _ = client.close();
                            break;
                        }

                        for _ in 0..10 {
                            if !RUNNING.load(Ordering::Relaxed) {
                                break;
                            }
                            std::thread::sleep(Duration::from_millis(500));
                        }
                    }

                    let _ = client.close();
                }

                for _ in 0..20 {
                    if !RUNNING.load(Ordering::Relaxed) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
            }
            tracing::info!("Discord RPC: thread selesai");
        })
        .ok();
}

pub fn stop() {
    RUNNING.store(false, Ordering::SeqCst);
}
