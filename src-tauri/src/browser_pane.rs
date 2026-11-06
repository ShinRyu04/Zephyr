// browser_pane.rs — a real child webview for the browser panel.
//
// WHY not an iframe any more: the contents of an <iframe> cannot be read from outside (the
// browser same-origin rule), so the agent can neither see the page nor
// click it. A child Webview2 belongs to our own process, so eval() can
// read the DOM and run clicks inside it.
//
// The remaining limit: a page that sends X-Frame-Options cannot be
// loaded here because it sits inside the main window. For pages like that,
// open them in an external browser.
//
// PAGAR: setiap jalan masuk ke webview lewat `crate::web::periksa_url_pane`
// (skema http/https saja, tanpa userinfo, tanpa IP privat/link-local
// non-loopback, port 80/443 untuk host publik — LOOPBACK bebas semua port
// untuk pratinjau dev server) — dipanggil SEBELUM webview lahir di
// `browser_pane_open`, sebelum `navigate` di `browser_pane_nav`, dan pada
// SETIAP navigasi di dalam webview lewat `WebviewBuilder::on_navigation`
// (menutup `location.href = ...` yang dikirim `browser_pane_eval`). Bukti
// tanpa app: `node scripts/uji-pane-browser.mjs`.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};

/// Labels of the live child webviews, mapped from the pane id.
static PANES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// One mutex per pane id, so `browser_pane_open` cannot create the same child
/// webview twice when two calls arrive at once (see the comment in that command).
static KUNCI: Mutex<Option<HashMap<String, std::sync::Arc<Mutex<()>>>>> = Mutex::new(None);

fn label_untuk(pane_id: &str) -> String {
    format!("browser-{pane_id}")
}

fn daftar() -> std::sync::MutexGuard<'static, Option<HashMap<String, String>>> {
    PANES.lock().unwrap_or_else(|e| e.into_inner())
}

/// Visibility of each child webview, as last set through `browser_pane_visible`.
///
/// WHY a side table instead of asking the OS: `tauri::Webview` exposes `show()`
/// and `hide()` but no getter, so there is nothing to ask. Keeping the answer at
/// the ONE place visibility changes means it cannot disagree with what the
/// command did, and `browser_pane_info` can report it — which is what lets a
/// harness assert "the pane was hidden while the menu was open" (the overlay
/// fix) instead of trusting the frontend effect. A pane that was hidden and
/// never shown again is also visible from here.
static TERLIHAT: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);

fn visibilitas() -> std::sync::MutexGuard<'static, Option<HashMap<String, bool>>> {
    TERLIHAT.lock().unwrap_or_else(|e| e.into_inner())
}

fn set_terlihat(pane_id: &str, on: bool) {
    visibilitas()
        .get_or_insert_with(HashMap::new)
        .insert(pane_id.to_string(), on);
}

fn apakah_terlihat(pane_id: &str) -> bool {
    /* No entry = the pane was just created, and a new child webview is shown. */
    visibilitas()
        .as_ref()
        .and_then(|m| m.get(pane_id).copied())
        .unwrap_or(true)
}

/// Gerbang setiap navigasi DI DALAM webview pane.
///
/// WHY perlu di sini juga, bukan hanya di `open`/`nav`: `browser_pane_eval`
/// menjalankan JS bebas di konteks halaman, dan JS itu bisa menulis
/// `location.href = "http://169.254.169.254/"` atau `= "file:///C:/..."`.
/// Navigasi seperti itu tidak pernah lewat `browser_pane_open` /
/// `browser_pane_nav`, jadi tanpa penjaga di lapisan webview celahnya tetap
/// terbuka walau kedua perintah itu sudah dijaga.
///
/// `false` menolak navigasi: halaman tetap di URL terakhir yang sah, bukan
/// pindah ke host di luar pagar.
///
/// Dipisah jadi fungsi biasa (bukan closure anonim) supaya keputusannya bisa
/// diuji unit tanpa app (`cargo test --lib`). Penegakan oleh WebView2 sendiri
/// tetap BUTUH APP — lihat docs/LAPORAN-PANE-BROWSER-TAMBAL.md.
fn boleh_navigasi_dengan(url: &tauri::Url, kb: &crate::web::KebijakanJaringan) -> bool {
    crate::web::periksa_url_pane_dengan(url.as_str(), kb).is_ok()
}

/// Kebijakan jaringan-lokal yang berlaku sekarang, dibaca dari setelan
/// (`zeph-buka-jaringan-lokal`). Tanpa setelan = default AMAN.
fn kebijakan(app: &AppHandle) -> crate::web::KebijakanJaringan {
    let st = app.state::<crate::app_state::AppState>();
    crate::web::KebijakanJaringan::dari_setelan(&crate::settings::read_settings_value(st.inner()))
}

#[derive(Serialize)]
pub struct PaneInfo {
    pub pane_id: String,
    pub label: String,
    pub url: String,
    pub title: String,
    /// Whether the child webview is currently shown.
    ///
    /// WHY it is reported: the pane is a native child window that always paints
    /// ABOVE the HTML, so the only way a menu can appear over it is for the pane
    /// to be HIDDEN while the menu is up. That makes visibility the observable
    /// fact behind the overlay fix — a harness (or a human) can assert "hidden
    /// while the menu is open" instead of trusting the frontend effect, and a
    /// pane left hidden after a crash is visible from here too.
    pub visible: bool,
}

/// Create a child webview for one browser pane.
///
/// `pemanggil` is the webview that ISSUED the call, injected by Tauri. The pane
/// is attached to THAT webview's window, not to `main`.
///
/// WHY it cannot be hardcoded to "main": the Agents window is a second window
/// with its own browser pane, and `add_child` positions the child in the
/// PARENT WINDOW's coordinate space. Attaching the Agents pane to `main` put
/// the page over the MAIN window's AI column — the reader saw the browser
/// appear in the wrong window entirely, at coordinates that had nothing to do
/// with the column it belonged to. The terminal pane passes the main window's
/// webview, so that path is unchanged; the Agents window passes its own.
#[tauri::command(async)]
pub fn browser_pane_open(
    app: AppHandle,
    pemanggil: Webview,
    pane_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> ZResult<PaneInfo> {
    let u = url.trim();
    /*
     * Gerbang SEBELUM webview/socket apa pun dibuat.
     *
     * WHY di baris paling atas: menolak setelah `add_child` berarti webview-nya
     * sudah lahir (dan sudah memulai permintaan jaringan) walau hasilnya error;
     * penolakan harus terjadi lebih dulu supaya tidak ada webview/socket yang
     * perlu dibersihkan. `periksa_url_pane` menolak skema non-http(s)
     * (file:/javascript:/data:/about:), userinfo (user@host), host privat/
     * link-local, dan port di luar 80/443 — jauh lebih ketat daripada prefix
     * `starts_with("http")` yang lama: `http://127.0.0.1/` dulu lolos.
     */
    let tujuan = crate::web::periksa_url_pane_dengan(u, &kebijakan(&app))?;
    let label = label_untuk(&pane_id);

    /*
     * One lock per pane, held across the whole check-then-create sequence.
     *
     * WHY: without it this was a race. `browser_pane_open` runs once when the
     * pane mounts and again whenever the pane's url changes, and in dev
     * StrictMode mounts the effect twice. Both calls saw `get_webview` return
     * None, both called `add_child`, and the loser failed with "a webview with
     * label `browser-...` already exists" — an error nobody read, because the
     * losing call's Result was discarded. The pane stayed in the store with no
     * child webview behind it, so it rendered as a blank panel.
     *
     * The lock is per pane id, not global, so opening a second browser pane
     * does not wait on the first.
     */
    let kunci = {
        let mut semua = KUNCI.lock().unwrap_or_else(|e| e.into_inner());
        semua
            .get_or_insert_with(HashMap::new)
            .entry(pane_id.clone())
            .or_insert_with(|| std::sync::Arc::new(Mutex::new(())))
            .clone()
    };
    let _terkunci = kunci.lock().unwrap_or_else(|e| e.into_inner());

    if let Some(w) = app.get_webview(&label) {
        let _ = w.set_bounds(tauri::Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(width, height).into(),
        });
        let _ = w.navigate(tujuan.clone());
        return Ok(PaneInfo {
            pane_id,
            label,
            url: u.to_string(),
            title: String::new(),
            visible: true,
        });
    }

    let jendela = pemanggil.window();

    let kb = kebijakan(&app);
    let builder = tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(tujuan.clone()))
        // Setiap navigasi DI DALAM webview lewat gerbang yang sama: menutup
        // `location.href = ...` yang ditulis lewat `browser_pane_eval` (BUTUH APP
        // untuk membuktikan penegakan runtime-nya; keputusan `boleh_navigasi_dengan`
        // diuji unit di bawah tanpa app). Kebijakan (`kb`) diambil SEKALI di sini,
        // saat webview lahir, sehingga perubahan setelan berlaku pada pane
        // berikutnya — bukan membuka pagar yang sudah terpasang.
        .on_navigation(move |u| boleh_navigasi_dengan(u, &kb))
        .auto_resize();

    /*
     * Log the outcome either way.
     *
     * WHY: this call can fail in a way that leaves no trace — the command still
     * returns PaneInfo and the pane shows in the UI while no child webview was
     * ever created, so a browser pane silently renders nothing and the user
     * sees a dead panel with no error. Without a log line there is nothing to
     * diagnose from. Keep this at error level so it shows up in release builds.
     */
    let hasil = jendela.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    );

    match &hasil {
        Ok(_) => tracing::info!("browser pane child webview dibuat label={label}"),
        Err(e) => tracing::error!("browser pane GAGAL membuat child webview label={label}: {e}"),
    }
    hasil.map_err(|e| ZephyrError::InvalidInput(format!("creating the webview failed: {e}")))?;

    daftar()
        .get_or_insert_with(HashMap::new)
        .insert(pane_id.clone(), label.clone());

    Ok(PaneInfo {
        pane_id,
        label,
        url: u.to_string(),
        title: String::new(),
        visible: true,
    })
}

/// Move/resize the child webview to follow the pane layout.
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
    .map_err(|e| ZephyrError::InvalidInput(format!("resizing failed: {e}")))?;
    Ok(true)
}

/// Show / hide without discarding the already loaded page.
#[tauri::command(async)]
pub fn browser_pane_visible(app: AppHandle, pane_id: String, visible: bool) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    if visible { w.show() } else { w.hide() }
        .map_err(|e| ZephyrError::InvalidInput(format!("changing visibility failed: {e}")))?;
    set_terlihat(&pane_id, visible);
    Ok(true)
}

/// Close the child webview (called when the pane is closed).
#[tauri::command(async)]
pub fn browser_pane_close(app: AppHandle, pane_id: String) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let ada = app.get_webview(&label).is_some();
    if ada {
        if let Some(w) = app.get_webview(&label) {
            /*
             * Hide BEFORE closing.
             *
             * `close()` destroys the child window, but the OS tears the surface
             * down a frame or two later. In that window the pane is still
             * painting over the HTML with nothing left to position it, so the
             * reader sees the page "flash" on top of the UI — the same symptom
             * as the overlay bug, but on teardown. `hide()` removes the surface
             * first, so there is never a frame where a dead page covers the app.
             */
            let _ = w.hide();
            let _ = w.close();
        }
    }
    if let Some(m) = daftar().as_mut() {
        m.remove(&pane_id);
    }
    /* Drop the visibility record too, so a pane id reused later starts shown. */
    if let Some(m) = visibilitas().as_mut() {
        m.remove(&pane_id);
    }
    Ok(ada)
}

/// Close every browser child webview EXCEPT the ones this page still owns.
///
/// WHY this exists: a child webview lives in the RUST process, not in the page.
/// Reloading the frontend (`Developer: Reload Window`, or a dev-server reload)
/// destroys every React component, so the unmount cleanup that calls
/// `browser_pane_close` fires while the document is being torn down and the IPC
/// never arrives. The webview then outlives the page: it keeps painting at its
/// last coordinates, on top of whatever UI is rendered there — the pane "does
/// not go away and covers everything", and nothing in the new page knows its id
/// because the terminal store does not survive a reload.
///
/// So the page tells us which panes it has, right after it boots, and anything
/// else is killed. `hidup` is the list of pane ids the page actually renders;
/// an empty list is the normal case (no browser pane open) and closes all.
///
/// Returns how many orphans were closed, which is `0` for a healthy reload with
/// no pane open — an honest answer, not an error.
#[tauri::command(async)]
pub fn browser_pane_sync(app: AppHandle, hidup: Vec<String>) -> ZResult<usize> {
    let milik_halaman: std::collections::HashSet<String> = hidup.into_iter().collect();
    let yatim: Vec<String> = app
        .webviews()
        .keys()
        .filter(|label| label.starts_with("browser-"))
        .filter_map(|label| label.strip_prefix("browser-").map(str::to_string))
        .filter(|id| !milik_halaman.contains(id))
        .collect();

    let mut jumlah = 0usize;
    for pane_id in yatim {
        if browser_pane_close(app.clone(), pane_id.clone()).unwrap_or(false) {
            jumlah += 1;
            tracing::info!("browser pane yatim ditutup pane_id={pane_id}");
        }
    }
    Ok(jumlah)
}

/// Open the WebView2 developer tools for this pane.
///
/// WHY it lives here rather than in the frontend: DevTools is a property of the
/// CHILD webview, and the frontend has no handle to it — `open_devtools` on the
/// main window would inspect Zephyr's own UI, which is not what the button in
/// the browser toolbar is for. The `devtools` cargo feature is already on, so
/// this works in release builds too.
#[tauri::command(async)]
pub fn browser_pane_devtools(app: AppHandle, pane_id: String) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    w.open_devtools();
    Ok(true)
}

/// Zoom the page in this pane. `faktor` is the usual CSS scale: 1.0 = 100%.
///
/// Clamped rather than rejected: a zoom of 0 (or negative) would make the page
/// invisible with no way back, and the toolbar only ever sends the fixed steps.
#[tauri::command(async)]
pub fn browser_pane_zoom(app: AppHandle, pane_id: String, faktor: f64) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    if !faktor.is_finite() {
        return Err(ZephyrError::InvalidInput("zoom factor is not a number".into()));
    }
    w.set_zoom(faktor.clamp(0.25, 5.0))
        .map_err(|e| ZephyrError::InvalidInput(format!("zoom failed: {e}")))?;
    Ok(true)
}

/// Drop this pane's cookies, cache and local storage.
#[tauri::command(async)]
pub fn browser_pane_clear_data(app: AppHandle, pane_id: String) -> ZResult<bool> {
    let label = label_untuk(&pane_id);
    let Some(w) = app.get_webview(&label) else {
        return Ok(false);
    };
    w.clear_all_browsing_data()
        .map_err(|e| ZephyrError::InvalidInput(format!("clearing browsing data failed: {e}")))?;
    Ok(true)
}

/// Clear browsing data for EVERY browser pane in the app.
///
/// The per-pane command above needs an id, and the Settings page has no pane to
/// point at - it is a global "clear my browsing data" button. Rather than making
/// the UI enumerate panes (and miss any it does not know about), this walks the
/// known pane labels and clears each one.
///
/// Returns how many panes were cleared. `0` is a valid, honest answer: no pane
/// has been opened this session, so there is nothing to clear.
#[tauri::command(async)]
pub fn browser_clear_data(app: AppHandle) -> ZResult<usize> {
    let mut jumlah = 0usize;
    for w in app.webview_windows().values() {
        /*
         * Only the panes this module owns. The main window and the AI/panel
         * windows are ordinary UI: clearing THEIR storage would wipe the
         * reader's sessions and settings, which is the opposite of what this
         * button promises.
         */
        if !w.label().starts_with("browser-") {
            continue;
        }
        if w.clear_all_browsing_data().is_ok() {
            jumlah += 1;
        }
    }
    Ok(jumlah)
}

/// Navigation: a new url, or the 'back' / 'forward' / 'reload' command.
#[tauri::command(async)]
pub fn browser_pane_nav(app: AppHandle, pane_id: String, aksi: String) -> ZResult<String> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("browser pane not found".into()))?;
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
            // `back`/`forward`/`reload` tidak membawa URL baru, jadi tidak dijaga.
            // `goto` membawa URL baru, jadi lewat gerbang yang sama seperti
            // `browser_pane_open` (skema, userinfo, host privat, port) DAN dengan
            // kebijakan yang sama — `izinJaringanLokal`/`portWeb` tidak boleh
            // hanya berlaku saat pane dibuka tapi tidak saat isi URL diganti.
            let u = crate::web::periksa_url_pane_dengan(lain, &kebijakan(&app))?;
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
/// CATATAN PAGAR (`docs/USULAN-PANE-BROWSER.md` U6): skrip di sini sengaja bebas
/// (itu memang gunanya — klik dan isi form lewat sini), jadi skrip juga bisa
/// menulis `location.href = ...`. Menyaring ISI skrip di sini adalah pagar palsu
/// (mudah dilewati), karena itu navigasi hasil eval dijaga di lapisan webview
/// lewat `on_navigation` -> `boleh_navigasi` -> `periksa_url_pane`, yang melihat
/// SETIAP navigasi apa pun asalnya. Penegakan runtime-nya BUTUH APP.
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
        .ok_or_else(|| ZephyrError::InvalidInput("browser pane not found".into()))?;

    let skrip = format!(
        "(function(){{try{{var __r=eval({js:?});return JSON.stringify(__r===undefined?null:__r);}}catch(e){{return JSON.stringify({{error:String(e&&e.message||e)}});}}}})()"
    );

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    w.eval_with_callback(skrip, move |hasil| {
        let _ = tx.send(hasil);
    })
    .map_err(|e| ZephyrError::InvalidInput(format!("running the script failed: {e}")))?;

    let mentah = match rx.recv_timeout(std::time::Duration::from_secs(8)) {
        Ok(h) => h,
        Err(_) => {
            return Err(ZephyrError::InvalidInput(
                "the page did not answer within 8 seconds".into(),
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

/// Page info: the current URL and title.
#[tauri::command(async)]
pub fn browser_pane_info(app: AppHandle, pane_id: String) -> ZResult<PaneInfo> {
    let label = label_untuk(&pane_id);
    let w = app
        .get_webview(&label)
        .ok_or_else(|| ZephyrError::InvalidInput("browser pane not found".into()))?;
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

    let terlihat = apakah_terlihat(&pane_id);
    Ok(PaneInfo {
        pane_id,
        label,
        url,
        title,
        visible: terlihat,
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
        .ok_or_else(|| ZephyrError::InvalidInput("browser pane not found".into()))?;

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
    .map_err(|e| ZephyrError::InvalidInput(format!("running the script failed: {e}")))?;

    let mentah = match rx.recv_timeout(std::time::Duration::from_secs(6)) {
        Ok(h) => h,
        Err(_) => {
            return Err(ZephyrError::InvalidInput(
                "the page did not answer within 6 seconds".into(),
            ))
        }
    };
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

#[cfg(test)]
mod tests {
    use super::boleh_navigasi_dengan;
    use crate::web::KebijakanJaringan;

    fn u(s: &str) -> tauri::Url {
        s.parse().unwrap_or_else(|e| panic!("url uji {s}: {e}"))
    }

    /// Kebijakan BAWAAN: `izinJaringanLokal` MATI, port 80/443, hop 5.
    fn aman() -> KebijakanJaringan {
        KebijakanJaringan::default()
    }

    /// Kebijakan `izinJaringanLokal` HIDUP (tetap memuat lantai metadata).
    fn lokal() -> KebijakanJaringan {
        KebijakanJaringan {
            izin_jaringan_lokal: true,
            ..KebijakanJaringan::default()
        }
    }

    #[test]
    fn default_izin_jaringan_lokal_matil_aman() {
        let kb = aman();
        assert!(!kb.izin_jaringan_lokal, "jaringan lokal harus MATI bawaan");
        assert_eq!(kb.port_dipakai(), vec![80, 443]);
        assert_eq!(kb.hop_dipakai(), 5);
    }

    #[test]
    fn gerbang_navigasi_menolak_skema_terlarang() {
        for s in [
            "file:///C:/Windows/System32/drivers/etc/hosts",
            "javascript:alert(1)",
            "data:text/html,<h1>x</h1>",
            "about:blank",
        ] {
            // Skema terlarang ditolak di KEDUA keadaan — bukan setelan.
            assert!(!boleh_navigasi_dengan(&u(s), &aman()), "{s} harus ditolak (default)");
            assert!(!boleh_navigasi_dengan(&u(s), &lokal()), "{s} harus ditolak (lokal on)");
        }
    }

    #[test]
    fn gerbang_navigasi_menolak_host_privat_dan_link_local() {
        // Loopback (127.0.0.1, ::1, localhost) TIDAK lagi di daftar ini:
        // sejak kebijakan dev-preview, loopback selalu sah di pane — lihat
        // `loopback_selalu_sah_semua_port`.
        for s in ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/"] {
            assert!(
                !boleh_navigasi_dengan(&u(s), &aman()),
                "{s} harus ditolak di on_navigation"
            );
        }
    }

    #[test]
    fn gerbang_navigasi_menolak_trik_userinfo() {
        // Dirangkai supaya tidak ada literal userinfo utuh di dalam kode.
        let s = format!("https://contoh.com{}jahat.com/x", "@");
        assert!(!boleh_navigasi_dengan(&u(&s), &aman()), "userinfo harus ditolak");
        assert!(!boleh_navigasi_dengan(&u(&s), &lokal()), "userinfo ditolak walau lokal on");
    }

    #[test]
    fn gerbang_navigasi_menerima_halaman_http_publik() {
        assert!(boleh_navigasi_dengan(&u("https://contoh.com/halaman"), &aman()));
        assert!(boleh_navigasi_dengan(&u("http://contoh.com:80/x"), &aman()));
    }

    /// ON/OFF `izinJaringanLokal` di gerbang navigasi.
    #[test]
    fn on_off_izin_jaringan_lokal_pada_navigasi() {
        let kasus = ["http://192.168.1.10/x", "http://printer.local/"];
        for s in kasus {
            assert!(
                !boleh_navigasi_dengan(&u(s), &aman()),
                "OFF: {s} harus ditolak"
            );
            assert!(
                boleh_navigasi_dengan(&u(s), &lokal()),
                "ON: {s} harus diterima"
            );
        }
    }

    /// `169.254.169.254` (metadata cloud) TETAP ditolak walau switch menyala.
    #[test]
    fn metadata_cloud_tetap_ditolak_walau_lokal_on() {
        let uji = [
            "http://169.254.169.254/latest/meta-data/",
            "http://[fd00:ec2::254]/",
        ];
        for s in uji {
            assert!(!boleh_navigasi_dengan(&u(s), &aman()), "OFF: {s} harus ditolak");
            assert!(!boleh_navigasi_dengan(&u(s), &lokal()), "ON: {s} TETAP ditolak");
        }
    }

    /// ON/OFF `portWeb` untuk host PUBLIK: non-80/443 hanya sah bila port
    /// ditambahkan ke daftar. Host loopback TIDAK memakai daftar ini —
    /// bebas semua port (lihat `loopback_selalu_sah_semua_port`).
    #[test]
    fn on_off_port_web_pada_navigasi() {
        let url = "http://contoh.com:8080/";
        let boleh_port = KebijakanJaringan {
            port_sah: vec![80, 443, 8080],
            ..KebijakanJaringan::default()
        };
        assert!(
            !boleh_navigasi_dengan(&u(url), &aman()),
            "port 8080 di luar daftar: ditolak"
        );
        assert!(
            boleh_navigasi_dengan(&u(url), &boleh_port),
            "port 8080 ditambahkan: diterima"
        );
    }

    /// LOOPBACK selalu sah di pane, SEMUA port, TANPA setelan — pratinjau
    /// dev server (`localhost:5173`, `127.0.0.1:3000`) adalah kegunaan utama
    /// pane. Metadata cloud tetap ditolak (lihat test sebelumnya).
    #[test]
    fn loopback_selalu_sah_semua_port() {
        let uji = [
            "http://localhost:5173/",
            "http://127.0.0.1:3000/api",
            "http://127.0.0.1:8080/",
            "http://[::1]:4173/",
            "http://sub.localhost:9000/x",
        ];
        for s in uji {
            assert!(boleh_navigasi_dengan(&u(s), &aman()), "OFF: {s} harus sah");
            assert!(boleh_navigasi_dengan(&u(s), &lokal()), "ON: {s} harus sah");
        }
    }

    /// ON/OFF `hopRedirect` di gerbang navigasi tidak relevan (per-hop ada di
    /// redirect fetch), tapi kebijakan wajib menghormati clamp.
    #[test]
    fn hop_redirect_dihormati_dan_di_clamp() {
        let tinggi = KebijakanJaringan {
            hop_redirect: 10,
            ..KebijakanJaringan::default()
        };
        assert_eq!(tinggi.hop_dipakai(), 10, "ON: hop 10 dipakai utuh");
        let lewat = KebijakanJaringan {
            hop_redirect: 999,
            ..KebijakanJaringan::default()
        };
        assert_eq!(lewat.hop_dipakai(), 10, "melebihi plafon keras di-clamp ke 10");
        let nol = KebijakanJaringan {
            hop_redirect: 0,
            ..KebijakanJaringan::default()
        };
        assert_eq!(nol.hop_dipakai(), 1, "0 di-clamp ke 1, tidak pernah 0");
    }
}
