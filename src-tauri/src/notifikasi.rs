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
pub async fn notify_show(title: String, body: String) -> bool {
    let judul = title.trim().to_owned();
    let isi = body.trim().to_owned();
    if judul.is_empty() && isi.is_empty() {
        return false;
    }

    /*
     * The Windows path builds a toast through PowerShell, which costs a process
     * spawn and can take seconds on a cold start. Running it directly on the
     * command thread held the IPC reply - and the caller's queue drain - for
     * that whole time. The notification is fire-and-forget; keeping it off the
     * async runtime is the only thing the caller needs.
     */
    tauri::async_runtime::spawn_blocking(move || tampil_platform(&judul, &isi))
        .await
        .unwrap_or(false)
}

fn tampil_platform(judul: &str, isi: &str) -> bool {
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
///
/// ## Why the toast used to show a generic icon
///
/// It passed the bare string `'Zephyr'` as the AppUserModelID. Windows does not
/// know that id — nothing ever registered it — so it fell back to its own default
/// icon, and the notification looked like it came from some anonymous program.
/// A toast only carries an icon when its AppUserModelID is backed by a Start-menu
/// shortcut (or an installed package) that names one.
///
/// So this now:
///
///  1. creates a per-user shortcut in the Start menu whose target is this
///     executable and whose `IconLocation` is the app's own icon,
///  2. stamps the AppUserModelID onto that shortcut via the property store,
///  3. creates the toast against the SAME id.
///
/// The shortcut is what Windows reads the icon from. Once it exists the icon
/// survives reboots, so the work is skipped when the file is already there.
#[cfg(target_os = "windows")]
const AUMID: &str = "com.zephyr.editor";

/// The `<audio>` element that makes the toast audible.
///
/// A hand-built toast is SILENT by default: the XML schema treats a missing
/// `<audio>` as "no sound", so the notification slid in without a peep while
/// every system toast chimed. `ms-winsoundevent:Notification.Default` is the
/// same sound Windows plays for its own notifications, so Zephyr stops being
/// the one app whose alerts the user has to be watching to notice.
///
/// `silent='false'` is redundant next to a named source, but it is spelled out
/// because the attribute is what a reader will look for when asking "why is
/// this one noisy".
#[cfg(target_os = "windows")]
const SUARA_TOAST: &str =
    "<audio src='ms-winsoundevent:Notification.Default' loop='false' silent='false'/>";

/// The app's own icon, compiled into the binary.
///
/// A toast reads its icon from the Start-menu shortcut's `IconLocation`, which is
/// a PATH — so the icon has to exist on disk when the notification fires. The
/// installer drops `icon.ico` next to the exe, but a `cargo run` build does not,
/// and pointing at a missing file is how a toast ends up with a generic icon
/// again. Embedding the bytes and writing them out on first use makes the icon
/// available in every build, dev included.
#[cfg(target_os = "windows")]
const IKON_ICO: &[u8] = include_bytes!("../icons/icon.ico");

/// The same mark as a PNG, for the toast's own image slot.
///
/// `appLogoOverride` takes an image SOURCE, and WinRT's toast parser does not
/// accept an `.ico` there — it wants PNG/JPEG. This is the 512px master, which
/// the toast downscales; handing it a 512px source is what keeps the mark sharp
/// at the 48px it is drawn.
#[cfg(target_os = "windows")]
const IKON_PNG: &[u8] = include_bytes!("../icons/icon.png");

/// Write an embedded asset somewhere stable and return its path.
#[cfg(target_os = "windows")]
fn tulis_aset(nama: &str, isi: &[u8]) -> Option<std::path::PathBuf> {
    let dir = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from)?;
    let dir = dir.join("zephyr");
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(nama);
    /* Rewritten only when missing or a different size, so a run does not touch
       the disk every time a notification fires. */
    let sama = std::fs::metadata(&path)
        .map(|m| m.len() == isi.len() as u64)
        .unwrap_or(false);
    if !sama {
        std::fs::write(&path, isi).ok()?;
    }
    Some(path)
}

#[cfg(target_os = "windows")]
fn pastikan_ikon() -> Option<std::path::PathBuf> {
    tulis_aset("zephyr.ico", IKON_ICO)
}

#[cfg(target_os = "windows")]
fn pastikan_logo() -> Option<std::path::PathBuf> {
    tulis_aset("zephyr.png", IKON_PNG)
}

/// Set the AppUserModelID property on a shortcut.
///
/// WHY NOT `ExtendedProperty`. The obvious spelling is
/// `$item.ExtendedProperty('System.AppUserModel.ID') = $id`, and it does not
/// work: `ExtendedProperty` is a READ-ONLY COM method, so PowerShell throws
/// "Error while invoking ExtendedProperty. Could not find member." and the id
/// silently stays empty. That is exactly why the toast kept falling back to
/// Windows' generic icon even after the shortcut existed.
///
/// The property store has to be opened through the shell item's `IPropertyStore`
/// and written with `SetValue` + `Commit`. No PowerShell cmdlet exposes that, so
/// the C# below does it directly. `GPS_READWRITE` (2) is what makes `Commit`
/// legal — with the default read-only flag the write is refused.
#[cfg(target_os = "windows")]
const CS_PROPERTY_STORE: &str = r#"
using System;
using System.Runtime.InteropServices;

public static class AumidSetter {
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PropertyKey {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct PropVariant {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        uint GetCount(out uint c);
        uint GetAt(uint i, out PropertyKey k);
        uint GetValue(ref PropertyKey k, out PropVariant v);
        uint SetValue(ref PropertyKey k, ref PropVariant v);
        uint Commit();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHGetPropertyStoreFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path,
        IntPtr reserved,
        int flags,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);

    public static bool Set(string lnkPath, string aumid) {
        IPropertyStore store = null;
        IntPtr teks = IntPtr.Zero;
        try {
            var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
            SHGetPropertyStoreFromParsingName(lnkPath, IntPtr.Zero, 2, ref iid, out store);

            var key = new PropertyKey();
            key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
            key.pid = 5;

            var pv = new PropVariant();
            pv.vt = 31;
            teks = Marshal.StringToCoTaskMemUni(aumid);
            pv.pointerValue = teks;

            store.SetValue(ref key, ref pv);
            store.Commit();
            return true;
        } catch {
            return false;
        } finally {
            if (teks != IntPtr.Zero) Marshal.FreeCoTaskMem(teks);
            if (store != null) Marshal.ReleaseComObject(store);
        }
    }
}
"#;

#[cfg(target_os = "windows")]
fn tampil_windows(judul: &str, isi: &str) -> bool {
    let esc = |s: &str| s.replace('\'', "''");
    let iko = pastikan_ikon()
        .map(|p| p.to_string_lossy().replace('\'', "''"))
        .unwrap_or_default();
    let logo = pastikan_logo()
        .map(|p| format!("file:///{}", p.to_string_lossy().replace('\\', "/").replace('\'', "''")))
        .unwrap_or_default();

    /*
     * `ToastGeneric`, not `ToastText02`.
     *
     * `ToastText02` is the legacy template: it has no image slot at all, so the
     * only icon Windows can draw is the 16px app mark from the AUMID's shortcut
     * — which is why the notification looked like a tiny default glyph. The
     * generic template carries `appLogoOverride`, a 48px slot that takes a real
     * image, and that is the one the user asked to see filled with Zephyr's own
     * mark.
     *
     * The `<audio>` element is what makes it AUDIBLE. A toast is silent unless
     * it names a sound source, and the default for a `ToastGeneric` built by
     * hand is `silent` — so the notification appeared without a peep while the
     * system's own toasts chimed. `ms-winsoundevent:Notification.Default` is
     * the scheme Windows uses for those; naming it explicitly gets the same
     * chime every other app gets, and keeps working if the user has set a
     * different system sound.
     *
     * `loop="false"` is spelled out rather than left to the default because a
     * looping alert on a finished run would be a nuisance, not a courtesy.
     *
     * The XML is built as a string and handed to `ToastNotification` directly;
     * PowerShell's template objects cannot express `appLogoOverride` or a
     * custom audio source without a lot more ceremony.
     */
    let mut xml = format!(
        "<toast><visual><binding template='ToastGeneric'>\
         <image placement='appLogoOverride' hint-crop='circle' src='{logo}'/>\
         <text>{judul}</text><text>{isi}</text>\
         </binding></visual>",
        logo = esc(&logo),
        judul = esc(judul),
        isi = esc(isi),
    );
    xml.push_str(SUARA_TOAST);
    xml.push_str("</toast>");

    /*
     * One script, in three steps, each of which must actually happen:
     *
     *  1. create the Start-menu shortcut pointing at this exe with Zephyr's icon,
     *  2. stamp the AUMID onto it through IPropertyStore (see `CS_PROPERTY_STORE`
     *     for why the obvious PowerShell spelling silently does nothing),
     *  3. show the toast against that same id.
     *
     * The C# is added with `Add-Type` only when the type is not already loaded,
     * so repeated notifications do not recompile it.
     */
    let skrip = format!(
        "$ErrorActionPreference = 'SilentlyContinue'; \
         $aumid = '{aumid}'; \
         $ico = '{iko}'; \
         $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName; \
         $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Zephyr.lnk'; \
         if (-not (Test-Path $lnk)) {{ \
           $w = New-Object -ComObject WScript.Shell; \
           $s = $w.CreateShortcut($lnk); \
           $s.TargetPath = $exe; \
           if ($ico -and (Test-Path $ico)) {{ $s.IconLocation = $ico }}; \
           $s.Description = 'Zephyr'; \
           $s.Save(); \
         }}; \
         if (-not ('AumidSetter' -as [type])) {{ Add-Type -TypeDefinition @'\n{cs}\n'@ }}; \
         [AumidSetter]::Set($lnk, $aumid) > $null; \
         [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; \
         [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null; \
         $doc = New-Object Windows.Data.Xml.Dom.XmlDocument; \
         $doc.LoadXml('{xml}'); \
         $n = [Windows.UI.Notifications.ToastNotification]::new($doc); \
         [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show($n)",
        aumid = AUMID,
        iko = iko,
        xml = xml.replace('\'', "''"),
        cs = CS_PROPERTY_STORE,
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
        let hasil = tauri::async_runtime::block_on(notify_show("   ".into(), "  ".into()));
        assert!(!hasil);
    }

    #[test]
    fn panggilan_tidak_pernah_panic() {
        /* The contract is "best effort": whatever the platform does, this must
           return rather than unwind. A notification failing is not an error. */
        let _ = tauri::async_runtime::block_on(notify_show(
            "Zephyr".into(),
            "Run finished".into(),
        ));
    }
}
