//! OS notifications for work that finished while the reader was looking elsewhere.
//!
//! ## Why this exists at all
//!
//! An agent run can take minutes. The reader starts it, switches to another
//! application, and has no way to know it finished - so either they sit watching
//! a spinner or they come back twenty minutes later to a result they could have
//! acted on immediately. A notification is the difference between "the editor
//! waits for me" and "I wait for the editor".
//!
//! ## Why not `tauri-plugin-notification`
//!
//! Two reasons, both concrete:
//!
//!  * It is a new dependency and a new permission surface for something the OS
//!    already exposes through one call. This module is ~40 lines and no plugin.
//!  * The plugin asks for permission through a JS prompt on first use. Zephyr
//!    already has enough first-run prompts, and a notification nobody asked for
//!    at the exact moment a run finishes is worse than no notification.
//!
//! ## What is deliberately NOT here
//!
//! No polling, no queue, no history. This is fire-and-forget: if the notification
//! cannot be shown, the run is still finished and the UI still says so. A
//! notification is a courtesy, never the source of truth.

use std::process::Command;

/// Show a desktop notification.
///
/// Every platform is best-effort: a failure returns `Ok(false)` rather than an
/// error, because "the toast did not appear" must never be reported as "the run
/// failed". The caller is told whether it was shown so the UI can decide to fall
/// back to an in-app toast.
#[tauri::command]
pub fn notify_show(title: String, body: String) -> bool {
    let judul = title.trim();
    let isi = body.trim();
    if judul.is_empty() && isi.is_empty() {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        tampil_windows(judul, isi)
    }

    #[cfg(target_os = "macos")]
    {
        tampil_macos(judul, isi)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        tampil_linux(judul, isi)
    }
}

/// Windows: a one-line PowerShell toast through the WinRT notifier.
///
/// `CreateToastNotifier` needs an AppUserModelID to attribute the toast. Without
/// one Windows silently drops it for a process that is not a packaged app, which
/// is why the id is set explicitly instead of relying on the default.
#[cfg(target_os = "windows")]
fn tampil_windows(judul: &str, isi: &str) -> bool {
    let esc = |s: &str| s.replace('\'', "''");
    let skrip = format!(
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; \
         $t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
         $x = $t.GetElementsByTagName('text'); \
         $x.Item(0).AppendChild($t.CreateTextNode('{}')) > $null; \
         $x.Item(1).AppendChild($t.CreateTextNode('{}')) > $null; \
         $n = [Windows.UI.Notifications.ToastNotification]::new($t); \
         [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Zephyr').Show($n)",
        esc(judul),
        esc(isi)
    );

    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &skrip])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn tampil_macos(judul: &str, isi: &str) -> bool {
    let esc = |s: &str| s.replace('"', "\\\"");
    let skrip = format!(
        "display notification \"{}\" with title \"{}\"",
        esc(isi),
        esc(judul)
    );
    Command::new("osascript")
        .args(["-e", &skrip])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Linux: `notify-send` from libnotify, which every desktop ships or stubs.
#[cfg(all(unix, not(target_os = "macos")))]
fn tampil_linux(judul: &str, isi: &str) -> bool {
    Command::new("notify-send")
        .args([judul, isi])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn judul_dan_isi_kosong_tidak_memanggil_apa_pun() {
        /* Nothing to say means nothing to show - and crucially, no process is
           spawned for it. */
        assert!(!notify_show("   ".into(), "  ".into()));
    }

    #[test]
    fn panggilan_tidak_pernah_panic() {
        /* The contract is "best effort": whatever the platform does, this must
           return rather than unwind. A notification failing is not an error. */
        let _ = notify_show("Zephyr".into(), "Run finished".into());
    }
}
