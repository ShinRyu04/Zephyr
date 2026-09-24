// browser_pane.rs — child webview asli untuk panel browser.
//
// KENAPA bukan iframe lagi: isi <iframe> tidak bisa dibaca dari luar (aturan
// same-origin browser), jadi agent tidak bisa melihat halaman maupun
// mengkliknya. Webview2 anak milik proses kita sendiri, sehingga eval() bisa
// read the DOM and run clicks inside it.
//
// The remaining limit: a page that sends X-Frame-Options cannot be
// dimuat di sini karena kita menaruhnya di dalam jendela utama. Untuk halaman
// seperti itu, buka di browser eksternal.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

/// Label webview anak yang sedang hidup, dipetakan dari id pane.
static PANES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn label_untuk(pane_id: &str) -> String {
    format!("browser-{pane_id}")
}

fn daftar() -> std::sync::MutexGuard<'static, Option<HashMap<String, String>>> {
    PANES.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize)]
pub struct PaneInfo {
    pub pane_id: String,
    pub label: String,
    pub url: String,
    pub title: String,
}

/// Bikin webview anak untuk satu pane browser.
#[tauri::command(async)]
pub fn browser_pane_open(
    app: AppHandle,
    pane_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> ZResult<PaneInfo> {
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "URL harus diawali http:// atau https://".into(),
        ));
    }
    let label = label_untuk(&pane_id);

    if let Some(w) = app.get_webview(&label) {
        let _ = w.set_bounds(tauri::Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(width, height).into(),
        });
        let _ = w.navigate(
            u.parse()
                .map_err(|e| ZephyrError::InvalidInput(format!("URL tidak valid: {e}")))?,
        );
        return Ok(PaneInfo {
            pane_id,
            label,
            url: u.to_string(),
            title: String::new(),
        });
    }

    let jendela = app
        .get_window("main")
        .ok_or_else(|| ZephyrError::InvalidInput("jendela utama tidak ditemukan".into()))?;

    let builder = tauri::webview::WebviewBuilder::new(
        &label,
        WebviewUrl::External(
            u.parse()
                .map_err(|e| ZephyrError::InvalidInput(format!("URL tidak valid: {e}")))?,
        ),
    )
    .auto_resize();

    let _wv = jendela
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal membuat webview: {e}")))?;

    daftar()
        .get_or_insert_with(HashMap::new)
        .insert(pane_id.clone(), label.clone());

    Ok(PaneInfo {
        pane_id,
        label,
        url: u.to_string(),
        title: String::new(),
    })
}

/// Geser/ukur webview anak mengikuti tata letak pane.
#[tauri::command(async)]
pub fn browser_pane_bounds(
    app: AppHandle,
    pane_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    w.set_bounds(tauri::Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    })
    .map_err(|e| ZephyrError::InvalidInput(format!("gagal mengubah ukuran: {e}")))?;
    Ok(true)
}

/// Tampilkan / sembunyikan tanpa membuang halaman yang sudah dimuat.
#[tauri::command(async)]
pub fn browser_pane_visible(app: AppHandle, pane_id: String, visible: bool) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    if visible { w.show() } else { w.hide() }
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal mengubah visibilitas: {e}")))?;
    Ok(true)
}

/// Tutup webview anak (dipanggil saat pane ditutup).
#[tauri::command(async)]
pub fn browser_pane_close(app: AppHandle, pane_id: String) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let ada = app.get_webview(&label).is_some();
    if ada {
        let _ = app.get_webview(&label).map(|w| w.close());
    }
    if let Some(m) = daftar().as_mut() {
        m.remove(&pane_id);
    }
    Ok(ada)
}

/// Navigasi: url baru, atau perintah 'back' / 'forward' / 'reload'.
#[tauri::command(async)]
pub fn browser_pane_nav(app: AppHandle, pane_id: String, aksi: String) -> ZResult<String> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("pane browser tidak ditemukan".into()))?;
    match aksi.as_str() {
        "back" => w
            .eval("history.back()")
            .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?,
        "forward" => w
            .eval("history.forward()")
            .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?,
        "reload" => w
            .eval("location.reload()")
            .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?,
        lain => {
            let u: tauri::Url = lain
                .parse()
                .map_err(|e| ZephyrError::InvalidInput(format!("URL tidak valid: {e}")))?;
            w.navigate(u)
                .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?;
        }
    }
    Ok(aksi)
}

/// Run JS inside the page and return the result.
///
/// WHY this is what lets the agent "see": eval runs in the page context, so it
/// can read document.title, innerText, the link list, and click elements.
///
/// The value travels through two layers that both quote strings, so it arrives
/// double-encoded and needs two unwraps:
///
/// 1. WebView2's `ExecuteScript` serializes the script's return value as JSON,
///    so a string result comes back wrapped in quotes.
/// 2. The script itself calls `JSON.stringify`, so the text is quoted once
///    more.
///
/// Parsing twice turns `"\"Example Domain\""` back into `Example Domain`. A
/// plain `return` without stringify does not work either, because a script
/// that returns a string keeps its outer quotes and one parse is not enough to
/// know how many layers to strip.
///
/// Errors come back as a JSON object with an `error` key rather than a throw,
/// so a page script failure does not leave Rust waiting for a reply.
#[tauri::command(async)]
pub fn browser_pane_eval(app: AppHandle, pane_id: String, js: String) -> ZResult<String> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("pane browser tidak ditemukan".into()))?;

    let skrip = format!(
        "(function(){{try{{var __r=eval({js:?});return JSON.stringify(__r===undefined?null:__r);}}catch(e){{return JSON.stringify({{error:String(e&&e.message||e)}});}}}})()"
    );

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    w.eval_with_callback(skrip, move |hasil| {
        let _ = tx.send(hasil);
    })
    .map_err(|e| ZephyrError::InvalidInput(format!("gagal menjalankan skrip: {e}")))?;

    let mentah = match rx.recv_timeout(std::time::Duration::from_secs(8)) {
        Ok(h) => h,
        Err(_) => {
            return Err(ZephyrError::InvalidInput(
                "halaman tidak menjawab dalam 8 detik".into(),
            ))
        }
    };

    // Unwrap the WebView2 JSON layer, then the script's own stringify layer.
    let lapis1 =
        serde_json::from_str::<serde_json::Value>(&mentah).unwrap_or(serde_json::Value::Null);
    let teks = match lapis1 {
        serde_json::Value::String(s) => s,
        other => other.to_string(),
    };
    match serde_json::from_str::<serde_json::Value>(&teks) {
        Ok(serde_json::Value::String(s)) => Ok(s),
        Ok(serde_json::Value::Null) => Ok(String::new()),
        Ok(v) => Ok(v.to_string()),
        Err(_) => Ok(teks),
    }
}

/// Info halaman: URL dan judul saat ini.
#[tauri::command(async)]
pub fn browser_pane_info(app: AppHandle, pane_id: String) -> ZResult<PaneInfo> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("pane browser tidak ditemukan".into()))?;
    let url = w.url().map(|u| u.to_string()).unwrap_or_default();

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    // `document.title` is a string, so WebView2's own JSON layer quotes it.
    // Parsing here keeps the quotes out of the UI and out of the agent's
    // context; the title shows up in tab labels and page summaries.
    let _ = w.eval_with_callback("document.title", move |t| {
        let _ = tx.send(t);
    });
    let mentah = rx
        .recv_timeout(std::time::Duration::from_secs(3))
        .unwrap_or_default();
    let title = serde_json::from_str::<serde_json::Value>(&mentah)
        .ok()
        .and_then(|v| match v {
            serde_json::Value::String(s) => Some(s),
            serde_json::Value::Null => Some(String::new()),
            other => Some(other.to_string()),
        })
        .unwrap_or(mentah);

    Ok(PaneInfo {
        pane_id,
        label,
        url,
        title,
    })
}

/// Draw a short-lived ring around an element and move a visible cursor dot to
/// it, then return the element's position.
///
/// WHY: when the agent clicks something, the click happens inside the page and
/// leaves no visible trace in the pane. Watching a page change with no
/// explanation reads as a bug. The ring and the dot show what was targeted and
/// where, then fade out on their own so nothing has to be cleaned up.
///
/// The overlay lives in the page's own DOM rather than in a native window, so
/// it scrolls with the content and needs no coordinate translation.
#[tauri::command(async)]
pub fn browser_pane_cursor(app: AppHandle, pane_id: String, selector: String) -> ZResult<String> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("pane browser tidak ditemukan".into()))?;

    let skrip = format!(
        r#"(function(){{
  try {{
    var sel = {selector:?};
    var el = document.querySelector(sel);
    if (!el) return JSON.stringify({{ok:false, error:'no element for '+sel}});
    el.scrollIntoView({{block:'center', behavior:'smooth'}});
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;

    var old = document.getElementById('__zephyr_cursor__');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = '__zephyr_cursor__';
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
      + 'left:' + r.left + 'px;top:' + r.top + 'px;'
      + 'width:' + r.width + 'px;height:' + r.height + 'px;'
      + 'border:2px solid #4aa3ff;border-radius:4px;'
      + 'box-shadow:0 0 0 2px rgba(74,163,255,.25);'
      + 'transition:opacity .4s ease 1.2s;opacity:1;';

    var dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
      + 'left:' + (x - 6) + 'px;top:' + (y - 6) + 'px;'
      + 'width:12px;height:12px;border-radius:50%;'
      + 'background:#4aa3ff;border:2px solid #fff;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.4);'
      + 'transition:opacity .4s ease 1.2s;opacity:1;';

    document.documentElement.appendChild(box);
    document.documentElement.appendChild(dot);
    setTimeout(function(){{ box.style.opacity='0'; dot.style.opacity='0'; }}, 100);
    setTimeout(function(){{ box.remove(); dot.remove(); }}, 2000);

    return JSON.stringify({{ok:true, x:Math.round(x), y:Math.round(y),
      w:Math.round(r.width), h:Math.round(r.height),
      tag:el.tagName, text:(el.innerText||el.value||'').slice(0,60)}});
  }} catch (e) {{
    return JSON.stringify({{ok:false, error:String(e && e.message || e)}});
  }}
}})()"#
    );

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    w.eval_with_callback(skrip, move |h| {
        let _ = tx.send(h);
    })
    .map_err(|e| ZephyrError::InvalidInput(format!("gagal menjalankan skrip: {e}")))?;

    let mentah = match rx.recv_timeout(std::time::Duration::from_secs(6)) {
        Ok(h) => h,
        Err(_) => {
            return Err(ZephyrError::InvalidInput(
                "halaman tidak menjawab dalam 6 detik".into(),
            ))
        }
    };
    let lapis1 = serde_json::from_str::<serde_json::Value>(&mentah)
        .unwrap_or(serde_json::Value::Null);
    let teks = match lapis1 {
        serde_json::Value::String(s) => s,
        other => other.to_string(),
    };
    match serde_json::from_str::<serde_json::Value>(&teks) {
        Ok(serde_json::Value::String(s)) => Ok(s),
        Ok(serde_json::Value::Null) => Ok(String::new()),
        Ok(v) => Ok(v.to_string()),
        Err(_) => Ok(teks),
    }
}
