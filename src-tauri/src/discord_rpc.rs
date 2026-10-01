use crate::app_state::AppState;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const CLIENT_ID: &str = "1554470184771649629";
const ASSET_KEY: &str = "icon-source";
const ACTIVITY_REFRESH: Duration = Duration::from_secs(5);
const RETRY_DELAY: Duration = Duration::from_secs(10);
const MAX_FOLDER_CHARS: usize = 64;

static WORKER_STOP: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);

fn workspace_state(path: Option<&Path>) -> String {
    let Some(name) = path
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
    else {
        return "Ready to code".to_string();
    };

    let mut chars = name.chars();
    let short_name: String = chars.by_ref().take(MAX_FOLDER_CHARS).collect();
    let suffix = if chars.next().is_some() { "…" } else { "" };
    format!("Workspace: {short_name}{suffix}")
}

fn stop_requested(receiver: &mpsc::Receiver<()>, timeout: Duration) -> bool {
    match receiver.recv_timeout(timeout) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => true,
        Err(mpsc::RecvTimeoutError::Timeout) => false,
    }
}

pub fn start(app: AppHandle) {
    let mut worker_stop = WORKER_STOP.lock().unwrap_or_else(|lock| lock.into_inner());
    if worker_stop.is_some() {
        return;
    }

    let (stop_sender, stop_receiver) = mpsc::channel();
    let worker = std::thread::Builder::new()
        .name("zephyr-discord-rpc".into())
        .spawn(move || run_worker(app, stop_receiver));

    match worker {
        Ok(_worker) => *worker_stop = Some(stop_sender),
        Err(error) => tracing::warn!(%error, "Discord RPC worker could not start"),
    }
}

fn run_worker(app: AppHandle, stop_receiver: mpsc::Receiver<()>) {
    let start_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    'worker: loop {
        if stop_requested(&stop_receiver, Duration::ZERO) {
            break;
        }

        let mut client = DiscordIpcClient::new(CLIENT_ID);
        if client.connect().is_ok() {
            tracing::info!("Discord RPC connected");

            loop {
                let state = {
                    let app_state = app.state::<AppState>();
                    workspace_state(app_state.workspace_path().as_deref())
                };
                let activity = activity::Activity::new()
                    .state(&state)
                    .details("Lightweight AI Code Editor")
                    .assets(
                        activity::Assets::new()
                            .large_image(ASSET_KEY)
                            .large_text("Zephyr Editor"),
                    )
                    .timestamps(activity::Timestamps::new().start(start_time));

                if client.set_activity(activity).is_err() {
                    tracing::warn!("Discord RPC connection was lost; retrying");
                    let _ = client.close();
                    break;
                }

                if stop_requested(&stop_receiver, ACTIVITY_REFRESH) {
                    let _ = client.close();
                    break 'worker;
                }
            }
        }

        if stop_requested(&stop_receiver, RETRY_DELAY) {
            break;
        }
    }

    tracing::info!("Discord RPC worker stopped");
}

pub fn stop() {
    let stop_sender = WORKER_STOP
        .lock()
        .unwrap_or_else(|lock| lock.into_inner())
        .take();
    if let Some(stop_sender) = stop_sender {
        let _ = stop_sender.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::workspace_state;
    use std::path::Path;

    #[test]
    fn workspace_state_only_includes_folder_name() {
        assert_eq!(
            workspace_state(Some(Path::new("C:/Users/alice/source/private-project"))),
            "Workspace: private-project"
        );
    }

    #[test]
    fn workspace_state_has_a_neutral_fallback() {
        assert_eq!(workspace_state(None), "Ready to code");
    }

    #[test]
    fn workspace_state_truncates_long_folder_names_on_character_boundaries() {
        let folder = "é".repeat(65);
        let path = Path::new("C:/workspace").join(folder);
        let state = workspace_state(Some(&path));
        assert_eq!(state, format!("Workspace: {}…", "é".repeat(64)));
    }
}
