/**
 * Tool Web & Browser - 11 tool yang tersedia tapi tidak menyala default.
 *
 * ## Kenapa berkas ini ada
 *
 * 11 tool ini memungkinkan agen mencari di web, mengambil halaman (fetch),
 * membuka pane browser di dalam aplikasi, membaca DOM di dalam pane, mengklik,
 * mengetik, menavigasi, dan mengunduh berkas.
 *
 * Sesuai instruksi, seluruh kemampuan web & browser ini TIDAK DIHAPUS dan
 * dipertahankan utuh, terpisah dari 40 tool inti.
 */
import { useTerminal } from '../terminalStore';
import { useStore } from '../store';
import { periksaTulis } from '../agentGuard';
import * as cmd from '../commands';
import type { AgentTool } from '../agentTools';
import { potong, wajib } from './builtins';
import {
  ID_PANE_AGENTS,
  daftarPaneAgents,
  diJendelaAgents,
  paneAgents,
  mintaPaneAgents,
  mintaBukaDiAgents,
} from '../agentsBrowserStore';
import {
  ambilIsiWeb,
  batasByteBerlaku,
  batasiByte,
  gerbangIsiKonten,
  kebijakanDariSetelan,
  periksaUrl,
  potongKeluaran,
  saringKeModel,
  ukuranByte,
  type KebijakanIsiWeb,
  type KeputusanUrl,
} from './kebijakanIsiWeb';
/**
 * Kebijakan ISI WEB yang berlaku sekarang - dibaca dari setelan tersimpan.
 *
 * Ini pintu tunggal untuk keempat aturan di `kebijakanIsiWeb.ts`: izin opt-in,
 * daftar host, batas ukuran keluaran, dan "tidak ada jalur otomatis". Setiap
 * tool web/browser memanggilnya SEBELUM menyentuh jaringan, jadi tidak ada tool
 * yang bisa lupa memeriksanya sendiri.
 *
 * Setelan yang belum punya field izin isi web dibaca sebagai "belum ada izin"
 * (lihat `kebijakanDariSetelan`) - jadi pemasangan UI-nya tidak pernah
 * memperluas izin secara diam-diam.
 */
function kebijakan(): KebijakanIsiWeb {
  return kebijakanDariSetelan(useStore.getState().settings);
}

/** Cari tab Browser yang ada di editor. Null bila belum pernah dibuka. */
function tabBrowser(): { id: string; url?: string } | null {
  const s = useStore.getState();
  const t = s.tabs.find((x) => x.view === 'browser');
  return t ? { id: t.id, url: t.url } : null;
}

/**
 * Identitas webview milik tab Browser.
 *
 * The browser is one editor tab now, so there is exactly one id. It has to be
 * the SAME constant `BrowserTab` registers with, or every eval would address a
 * pane that does not exist.
 */
const ID_TAB_BROWSER = 'tab-browser';

/**
 * Pesan galat yang bisa dibaca.
 *
 * Galat dari Tauri datang sebagai OBJEK, bukan Error: `String(e)` untuknya
 * menghasilkan "[object Object]" - teks yang tidak memberi tahu apa pun. Itu
 * yang dulu muncul di hasil `browser_read`, dan menyembunyikan sebab aslinya.
 */
function pesanGalat(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

/**
 * Alasan penolakan gerbang, dalam teks yang BISA DITINDAKLANJUTI model.
 *
 * Alasan mentah (`host-luar-allowlist:youtube.com`) bermakna bagi pembaca kode,
 * tapi jalan buntu bagi model: dicoba ulang, lalu dialihkan ke tool web lain
 * yang memakai gerbang yang SAMA, lalu dilaporkan ke user sebagai "error".
 * Itu persis yang terjadi pada keluhan "buka YouTube/Google selalu error":
 * pagar bekerja sebagaimana dirancang, tapi tidak ada satu pun teks yang
 * menyebut host mana yang kurang dan apa jalan keluarnya.
 *
 * Teks di sini menyebut keduanya: host persisnya, dan langkah berikutnya
 * (minta user menambahkannya lewat Chat Settings > Konten web). Petunjuk
 * `izinIsiWeb` juga diralih karena versi lama menunjuk ke panel Settings yang
 * tidak pernah ada — UI untuk izin/allowlist isi web baru dipasang di halaman
 * Chat Settings (section "Konten web"), jadi teks di sini mengarahkannya ke
 * sana, bukan ke penyuntingan settings.json.
 */
function pesanTolakGerbang(alasan: string): string {
  if (alasan.startsWith('izin-isi-web-mati')) {
    return (
      alasan +
      ' - the web-content permission is OFF, so every web/browser tool is closed. ' +
      'This is a setting, not a failure of the request: do NOT apologise, do NOT retry, do NOT switch tools - ' +
      'they all share this gate. Tell the user in one sentence that the permission is off and that it is ' +
      'no longer exposed in Chat Settings, so they must set "izinIsiWeb" to true in settings.json. ' +
      'Once they say it is on, run the same call again.'
    );
  }
  if (alasan.startsWith('host-luar-allowlist:')) {
    const host = alasan.slice('host-luar-allowlist:'.length);
    return (
      alasan +
      ` - host ${host} is not in the web-content allowlist (settings key allowlistWeb). ` +
      'This is a setting, not a failure: do NOT retry and do NOT switch tools - web_fetch, browser_read and ' +
      'download share this gate and fail the same way. An EMPTY list means every host is allowed, so this ' +
      'list was filled in on purpose: tell the user the exact host and that it has to be added to ' +
      `"allowlistWeb" (one host per line) in settings.json. ` +
      `Ask whether to add ${host}; once they confirm, retry the same call. ` +
      'If the task allows another already-allowed source, use that instead and say so.'
    );
  }
  return alasan;
}

/**
 * Sebab kegagalan eval TERAKHIR, dipakai sebagai keterangan saat `browser_read`
 * harus jatuh ke jalur cadangan: model perlu tahu BUKAN "halaman kosong" tapi
 * "webview-nya belum ada".
 */
let galatEvalTerakhir: string | null = null;

/**
 * Jalankan satu ekspresi JS di dalam halaman pane browser dan kembalikan
 * nilainya. `null` berarti pane itu belum punya webview hidup (atau ekspresinya
 * melempar) - pemanggil yang memutuskan jalur cadangannya.
 *
 * `browser_pane_eval` di Rust mengembalikan JSON dari ekspresi itu, jadi nilai
 * yang dikembalikan di sini sudah berupa tipe aslinya (string/array/objek).
 */
async function evalPane<T>(paneId: string, ekspresi: string): Promise<T | null> {
  try {
    const mentah = await cmd.browserPaneEval(paneId, ekspresi);
    /*
     * Rust SUDAH membuka kedua lapis JSON (WebView2 + stringify skripnya), jadi
     * yang datang ke sini adalah NILAINYA, bukan JSON-nya. Untuk `document.title`
     * itu berarti teks mentah `Halaman Uji Baca` - dan `JSON.parse` atas teks itu
     * MELEMPAR.
     *
     * Percobaan pertama di sini salah persis di situ: setiap string ditolak
     * sebagai "bukan JSON", `browser_read` selalu jatuh ke jalur cadangan, dan
     * halaman yang jelas termuat dilaporkan sebagai halaman kosong. Aturannya
     * sekarang: parse hanya untuk mengenali nilai non-string (objek/array/angka,
     * yang memang dikirim sebagai teks JSON); kalau parse gagal, teksnya ITULAH
     * nilainya.
     */
    if (typeof mentah !== 'string') {
      galatEvalTerakhir = `jawaban eval bukan string: ${pesanGalat(mentah)}`;
      return null;
    }
    if (mentah === '') {
      /* Rust mengubah `undefined` dan string kosong menjadi "" - webview hidup. */
      galatEvalTerakhir = null;
      return '' as unknown as T;
    }
    let nilai: unknown;
    try {
      nilai = JSON.parse(mentah);
    } catch {
      galatEvalTerakhir = null;
      return mentah as unknown as T;
    }
    if (nilai && typeof nilai === 'object' && !Array.isArray(nilai) && 'error' in nilai) {
      galatEvalTerakhir = `skrip halaman melempar: ${String((nilai as { error?: unknown }).error)}`;
      return null;
    }
    galatEvalTerakhir = null;
    return nilai as T;
  } catch (e) {
    galatEvalTerakhir = pesanGalat(e);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * The Agents window's browser pane
 * ------------------------------------------------------------------ */

/**
 * Is THIS code running inside the `#agents` window?
 *
 * The URL hash is the marker the window is created with (`index.html#agents`);
 * the DOM class is the fallback for a build that renders the layout before the
 * hash is applied. Needed because the same tool module runs in both windows and
 * "open a link" must land in the column the reader is looking at.
 */
function diJendelaAgen(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.location.hash === '#agents') return true;
  return !!document.querySelector('.agents-window-root');
}

/**
 * True for ids owned by the Agents window's browser view.
 *
 * `agents-browser` is the fixed id the component publishes; `agx-bp-` is the
 * prefix older builds used. Both must be recognised: an id the resolver does
 * not treat as "Agents-window" falls through to the terminal store, and the
 * caller gets "browser pane not found" for a pane that is plainly on screen.
 */
function idAgents(paneId: string): boolean {
  return paneId === ID_PANE_AGENTS || paneId.startsWith('agx-bp-');
}

/**
 * Wait until the Agents window reports the page loaded.
 *
 * The pane is created and navigated by its own component, so this only watches
 * the shared registry: `siap` plus the URL it reports. Polling the registry
 * (rather than the webview) is deliberate — `browser_pane_eval` from this
 * window would work, but the address bar of the pane has not changed yet on the
 * first frames, so a successful eval would not prove the requested page loaded.
 */
async function tungguHalamanAgents(url: string, paneId: string, batasMs = 15000): Promise<boolean> {
  const mulai = Date.now();
  for (;;) {
    const p = paneAgents(paneId);
    if (p?.siap && p.url && samaUrl(p.url, url)) return true;
    /*
     * The registry is written by the other window on its own schedule, so a
     * freshly requested page can be fully loaded while the entry still shows the
     * previous one — that is what made the FIRST `browser_open` answer "did not
     * confirm within 15s" for a page that was on screen. Ask the webview
     * directly as a second source: `browser_pane_info` is app-wide (keyed by
     * pane id), so this window can read the child webview's real URL and title.
     */
    if (Date.now() - mulai > 1200) {
      try {
        const info = await cmd.browserPaneInfo(paneId);
        if (info?.url && samaUrl(info.url, url)) return true;
      } catch {
        /* pane not created yet — the loop keeps waiting */
      }
    }
    if (Date.now() - mulai > batasMs) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Wait until the Agents window's column has run the close request.
 *
 * A pane counts as closed when BOTH hold for the whole window:
 *   - the registry no longer lists it, and
 *   - the child webview itself is gone (`browser_pane_info` fails).
 *
 * Checking both is what makes the answer truthful. The registry alone lies for
 * up to a refresh interval (the view republishes its entry every 3 s, and a
 * republish already queued lands again after the entry was removed), while the
 * webview alone says nothing about the column's tab.
 */
async function tungguTutupAgents(paneId: string, batasMs = 12000): Promise<boolean> {
  const mulai = Date.now();
  let sejak = 0;
  for (;;) {
    let hidup = false;
    try {
      await cmd.browserPaneInfo(paneId);
      hidup = true;
    } catch {
      /* webview gone — that is what we want */
    }
    if (!hidup && !paneAgents(paneId)) {
      if (!sejak) sejak = Date.now();
      if (Date.now() - sejak > 700) return true;
    } else {
      sejak = 0;
    }
    if (Date.now() - mulai > batasMs) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Route a read/click/type at the pane that actually exists.
 *
 * The Agents window's browser lives in another WebView, so it is not in
 * `useTerminal` and the terminal resolver cannot see it. Both are checked, and
 * an explicitly named Agents pane always wins so `pane_id` is honoured.
 *
 * The Agents entry is only considered FROM the Agents window. `localStorage` is
 * shared by every window of the app, so the main window sees that entry too —
 * and once the column is closed the entry lingers as "ready" for
 * `BATAS_SEGAR_MS`. Trusting it there let a request be written into a window
 * that has no column to read it: the tool answered "closed successfully" while
 * the real pane kept painting.
 */
function idBrowserEfektif(idAtauUrl?: string): string | null {
  if (idAtauUrl && idAgents(idAtauUrl)) return paneAgents(idAtauUrl) ? idAtauUrl : null;
  const paneAg = diJendelaAgents() ? paneAgents(idAtauUrl)?.id : undefined;
  const tab = tabBrowser();
  /*
   * A caller may still pass an explicit id (older prompts, agents replaying a
   * transcript). Only ids this page actually owns are honoured: the Browser
   * tab's fixed id, or an Agents-column pane.
   */
  if (idAtauUrl && !tab && !paneAg) return null;
  return tab ? ID_TAB_BROWSER : (paneAg ?? null);
}

/**
 * Tampilkan pane ini di layar: jadikan tab-nya tab aktif, jadikan pane ini pane
 * aktif di tab itu, dan buka panelnya.
 *
 * WHY ini bukan hiasan: child webview pane dibuat BrowserPane SETELAH kontainernya
 * punya ukuran nyata. Pane yang tidak dirender - tab lain yang tidak aktif, panel
 * tertutup - tidak punya webview sama sekali, jadi `browser_pane_eval` gagal dan
 * agen menyimpulkan halaman yang dibukanya kosong.
 */
function pastikanTampil(paneId: string): void {
  /*
   * The Browser's home is an editor TAB now. Making it the active tab is what
   * gives its stage a real rect - and a tab that is not active renders no
   * stage at all, so its child webview would never be created and every eval
   * would fail for a page the agent was just told it opened.
   */
  if (paneId === ID_TAB_BROWSER) {
    const s = useStore.getState();
    const tab = s.tabs.find((x) => x.view === 'browser');
    if (!tab) return;
    if (s.activeTabId !== tab.id) s.setActiveTab(tab.id);
    return;
  }
  const t = useTerminal.getState();
  const tab = t.terminalTabs.find((x) => x.panes.some((p) => p.id === paneId));
  if (tab) {
    if (t.activeTabId !== tab.id) t.setActiveTab(tab.id);
    t.setActivePane(tab.id, paneId);
  }
  if (!t.visible) t.setVisible(true);
}

/**
 * Tunggu sampai webview pane benar-benar menjawab eval.
 *
 * `addPane` selesai jauh sebelum halamannya bisa dibaca: webview dibuat pada
 * frame berikutnya, dan halaman baru "hidup" setelah dimuat. Tanpa menunggu di
 * sini, `browser_read` yang dipanggil tepat sesudah `browser_open` selalu jatuh
 * ke jalur fetch statis dan melaporkan halaman kosong.
 */
async function tungguWebview(paneId: string, batasMs = 10000): Promise<boolean> {
  const mulai = Date.now();
  for (;;) {
    if ((await evalPane<string>(paneId, 'document.title')) !== null) return true;
    if (Date.now() - mulai > batasMs) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Bandingkan dua URL untuk keperluan pemakaian ulang pane: buang fragmen dan
 * garis miring di ujung, lalu bandingkan tanpa peduli huruf besar/kecil.
 *
 * Google menambahkan parameter sendiri (mis. `&sourceid=...`), jadi perbandingan
 * harus toleran - kalau tidak, halaman yang SUDAH benar akan dikira belum
 * dinavigasi dan agen menunggu 15 detik untuk sesuatu yang sudah selesai.
 */
function samaUrl(a: string, b: string): boolean {
  const n = (u: string) => String(u ?? '').trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
  const ka = n(a);
  const kb = n(b);
  return ka === kb || ka.startsWith(kb) || kb.startsWith(ka);
}

/**
 * Pastikan halaman di pane itu benar-benar memuat `url` - bukan sekadar
 * "webview-nya ada".
 *
 * `tungguWebview` cuma membuktikan webview MENJAWAB. Percobaan nyata (agen
 * disuruh cari kurs di Google tepat setelah aplikasi dinyalakan) menunjukkan
 * lubangnya: webview menjawab `document.title` di detik itu, tool melaporkan
 * "page loaded, ready to read", lalu `browser_read` berikutnya gagal dengan
 * "browser pane not found" - webview-nya belum benar-benar terdaftar/ter-render.
 * Lima langkah agen terbuang, dan `browser_open` berikutnya membuang pane lama
 * lalu membuat pane BARU (id berubah - persis keluhan "buka pane baru terus").
 *
 * Jadi di sini: cari webviewnya dulu, lalu NAVIGASI ke url dan tunggu
 * `readyState === 'complete'` dengan halaman yang bukan `about:blank`. Kalau
 * dalam batas waktu halaman itu tidak pernah siap, kembalikan false supaya
 * pemanggil melaporkan apa adanya - TIDAK membuang pane.
 */
async function pastikanHalaman(paneId: string, url: string, batasMs = 15000): Promise<boolean> {
  const mulai = Date.now();
  let pernahNav = false;
  for (;;) {
    const hidup = await tungguWebview(paneId, 3000);
    if (hidup) {
      const href = await evalPane<string>(paneId, 'String(location.href)');
      const siap = await evalPane<string>(paneId, 'String(document.readyState)');
      const halamanNyata = !!href && href !== 'about:blank';
      if (halamanNyata && siap === 'complete' && (pernahNav || samaUrl(href!, url))) return true;
    }
    if (!pernahNav) {
      pernahNav = true;
      try {
        await cmd.browserPaneNav(paneId, url);
      } catch (e) {
        galatEvalTerakhir = `navigasi di pane gagal: ${pesanGalat(e)}`;
      }
    }
    if (Date.now() - mulai > batasMs) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Pindahkan pane browser yang SUDAH ADA ke URL lain - satu pane, dipakai ulang.
 *
 * Inilah yang diminta pengguna: "dia selalu buka terminal pane baru, kalau bisa
 * tetap satu". Sebelum ini setiap URL baru dijalani dengan MENUTUP pane lama lalu
 * membuat pane baru (`closePane` + `addPane`), karena `setPaneUrl` hanya menulis
 * state sementara child webview tetap memuat halaman lama. Akibatnya setiap
 * `browser_open` melahirkan id pane baru dan panel berkedip buka-tutup - persis
 * keluhan itu.
 *
 * Jalur yang benar sudah tersedia di Rust: `browser_pane_nav` memanggil
 * `w.navigate(url)` pada webview yang hidup. Jadi pane yang sama benar-benar
 * berpindah halaman, riwayatnya tetap (back/forward masih bekerja), dan tidak ada
 * pane baru. `setPaneUrl` dipanggil SESUDAH navigasi supaya state mencerminkan
 * apa yang benar-benar ada di layar - bukan sebaliknya.
 *
 * Mengembalikan false bila pane itu belum punya webview hidup (panel belum
 * dirender): pemanggil yang memutuskan jalur cadangannya.
 */
async function pakaiUlangPane(paneId: string, url: string): Promise<boolean> {
  pastikanTampil(paneId);
  if (!(await pastikanHalaman(paneId, url))) return false;
  useStore.getState().setTabUrl(paneId, url);
  return true;
}

/**
 * Baca isi halaman dari pane browser.
 *
 * URUTANNYA PENTING. Pane browser sekarang adalah child webview milik proses
 * ini sendiri, BUKAN iframe - jadi `iframe.contentDocument` tidak pernah ada
 * untuknya, dan satu-satunya jalur yang tersisa dulu adalah `web_fetch`.
 *
 * Kenapa itu salah: `web_fetch` mengambil HTML mentah dan TIDAK menjalankan
 * skrip. Halaman yang isinya dibuat JavaScript (situs modern, SPA, aplikasi
 * localhost dev-server) terbaca kosong - agen lalu menjawab "halaman ini tidak
 * ada isinya" untuk halaman yang di layar pengguna jelas berisi. Jalur yang
 * benar adalah `browser_pane_eval`: JS dijalankan di konteks halaman yang SUDAH
 * dirender, jadi yang dibaca agen sama dengan yang dilihat pengguna.
 */
async function bacaHalamanMentah(paneId: string): Promise<string> {
  /* Jalur utama: DOM hidup di child webview. */
  const judul = await evalPane<string>(paneId, 'document.title');
  if (judul !== null) {
    const url = (await evalPane<string>(paneId, 'location.href')) ?? '';
    const teks = (await evalPane<string>(paneId, 'document.body ? document.body.innerText : ""')) ?? '';
    const tautan =
      (await evalPane<string[]>(
        paneId,
        'Array.from(document.querySelectorAll("a[href]")).slice(0, 40).map(function(a){return ((a.textContent||"").trim().slice(0,80)) + " -> " + a.href;})',
      )) ?? [];
    const bagian = [
      `judul: ${String(judul).trim() || '(kosong)'}`,
      `url: ${url}`,
      '',
      String(teks).trim() || '(belum ada teks - halaman mungkin masih dimuat)',
    ];
    if (tautan.length) bagian.push('', 'tautan: ' + tautan.join(' | '));
    return bagian.join('\n');
  }

  /* Cadangan 1: pane versi lama yang memang iframe same-origin. */
  const iframe = document.querySelector(`iframe[data-pane-id="${paneId}"]`) as HTMLIFrameElement | null;
  if (iframe) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.body) {
        return doc.body.innerText || doc.body.textContent || '';
      }
    } catch {
      // Cross-origin iframe tidak bisa dibaca langsung
    }
  }

  /* Cadangan 2: fetch statis (tanpa skrip dijalankan). */
  const sebab = galatEvalTerakhir ?? 'webview pane belum dibuat';
  if (paneId === ID_TAB_BROWSER) {
    const tab = tabBrowser();
    if (tab?.url) {
      try {
        return await cmd.webFetch(tab.url, 15000);
      } catch (e) {
        return `(gagal membaca halaman: jalur DOM tidak tersedia - ${sebab} - dan fetch statis gagal: ${pesanGalat(e)})`;
      }
    }
    return `(gagal membaca halaman: jalur DOM tidak tersedia - ${sebab} - dan tab Browser belum punya URL)`;
  }
  /*
   * Panes left here are terminals and Agents-column browsers. A terminal pane
   * has no page to fetch, and the Agents browser lives in another WebView, so
   * there is nothing more to try: say so instead of guessing a URL.
   */
  return `(halaman belum bisa dibaca: ${sebab})`;
}

/**
 * Baca halaman lewat GERBANG ISI WEB - satu-satunya jalan isi halaman sampai ke
 * model.
 *
 * Dua hal yang ditutup di sini:
 *
 *  1. IZIN DIPERIKSA SEBELUM apa pun disentuh. Tanpa izin, `browser_pane_eval`
 *     tidak pernah dipanggil, jadi tidak ada isi halaman yang ditarik keluar
 *     dari webview - bahkan dari pane yang SUDAH terbuka di layar pengguna.
 *  2. Ukuran keluaran dipotong kebijakan, bukan `potong()` milik builtins -
 *     jadi batas yang berlaku di sini sama dengan batas yang diuji harness.
 *
 * Jalur cadangan otomatis (fetch statis saat webview belum hidup) ada DI DALAM
 * `bacaHalamanMentah`, dan itu sebabnya gerbang ini membungkus keduanya: tidak
 * ada jalur otomatis yang bisa memakai "halaman belum dirender" sebagai alasan
 * untuk melewati izin.
 */
async function bacaHalaman(paneId: string, kb: KebijakanIsiWeb): Promise<string> {
  if (kb.izinIsiWeb !== true) {
    return `isi web ditolak: ${pesanTolakGerbang('izin-isi-web-mati')}`;
  }
  const saring = saringKeModel(await bacaHalamanMentah(paneId), kb);
  return saring.ok ? saring.teks : `(isi web ditolak: ${saring.alasan})`;
}

/**
 * LANTAI HTTPS + izin host untuk `web_fetch`.
 *
 * Kenapa ada di sini, bukan di `kebijakanIsiWeb.ts`: `periksaUrl` sudah
 * menegakkan izin, allowlist host eksplisit, IP privat, nama lokal, dan port -
 * TAPI ia menerima `http:` sama lapangnya dengan `https:`. Modul itu dipakai
 * juga oleh pintu lain (pane browser), jadi lantai khusus jalur AMBIL (yang
 * keluar ke jaringan tanpa halaman penengah) ditegakkan di pintu itu sendiri.
 *
 * Polanya mengikuti allowlist unduhan ekstensi di `src-tauri/src/ext_pkg.rs`
 * (`IZIN_UNDUH` + `izin_unduh`): skema https WAJIB, dan host dibandingkan
 * UTUH atau sebagai subdomain (`. + entri`) - bukan `contains`, supaya
 * `contoh.com.jahat.com` tidak lolos sebagai `contoh.com`. Perbandingan itu
 * sendiri dikerjakan `hostDiAllowlist` di `kebijakanIsiWeb.ts`; di sini yang
 * ditambah hanya lantai skema dan penolakan userinfo.
 *
 * Murni: nol jaringan, nol IPC. Dipanggil SEBELUM transport, jadi penolakan di
 * sini tidak pernah menghasilkan satu pun permintaan keluar (angka 0 itu
 * diperiksa harness lewat penghitung pemanggilan fetcher).
 */
export const SKEMA_WEB_FETCH = 'https:';

export function lantaiHttpsWeb(urlStr: unknown, kb: KebijakanIsiWeb): KeputusanUrl {
  /* Semua aturan lama dulu - supaya alasan penolakan yang sudah ada
     (`ip-privat:`, `nama-lokal:`, `host-luar-allowlist:`, `port-tak-lazim:`)
     tetap persis sama, dan tidak ada satu pun perilaku https yang berubah. */
  const dasar = periksaUrl(urlStr, kb);
  if (!dasar.ok) return dasar;

  let u: URL;
  try {
    u = new URL(dasar.url);
  } catch {
    return { ok: false, alasan: 'url-tak-valid' };
  }
  if (u.protocol !== SKEMA_WEB_FETCH) {
    return { ok: false, alasan: 'skema-bukan-https:' + u.protocol };
  }
  /* Trik userinfo. `new URL` membuang userinfo dari `hostname`, jadi
     `https://contoh.com@jahat.com/` divonis host `jahat.com` (dan ditolak
     allowlist) - benar. Tapi `https://jahat@contoh.com/` divonis `contoh.com`
     dan LOLOS, padahal yang terbaca mata manusia adalah `jahat`. Tidak ada
     pemakaian sah untuk userinfo di jalur ini, jadi ditolak apa adanya
     supaya host yang divonis selalu sama dengan host yang terlihat. */
  if (u.username !== '' || u.password !== '') {
    return { ok: false, alasan: 'userinfo-ditolak:' + u.hostname };
  }
  return { ok: true, url: u.href, host: dasar.host };
}

export const TOOL_WEB: AgentTool[] = [
  {
    /*
     * `open_link` - show a link INSIDE Zephyr, in the browser pane.
     *
     * Asked for directly, and the reason is sound: the terminal panel already
     * splits, so a page opened next to the code is visible while the reader
     * keeps working - and, unlike the OS browser, Zephyr can then READ that
     * same page (`browser_read`) instead of guessing what it says.
     *
     * This used to call the OS opener, which put the page in whatever browser
     * the machine defaults to: a different window, out of reach of the agent,
     * and a context switch for the reader. The pane is the better home for a
     * link that arrived in a conversation about code.
     *
     * It dispatches to `browser_open` rather than reimplementing it, so the
     * allowlist gate, the Agents-window routing and the pane-reuse rules stay
     * in exactly one place.
     */
    spec: {
      name: 'open_link',
      description:
        'Open a URL in Zephyr\'s own browser, which lives in an editor tab next to the code (or the browser column of the Agents window) so the user can SEE it and you can READ it afterwards with `browser`. ' +
        'Use this whenever the user shares a link or asks to open a page - sharing a link IS the request, so open it in the same turn instead of printing the URL. ' +
        'The same allowlist gate applies: if the result says the host is outside the allowlist, tell the user the host name instead of retrying.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to open.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      const buka = TOOL_WEB.find((t) => t.spec.name === 'browser_open');
      if (!buka) {
        throw new Error('ERROR: open_link butuh "browser_open" yang tidak ada di build ini.');
      }
      /*
       * The refusal wording from `browser_open` already names the host and the
       * setting, so it is passed through unchanged - a second phrasing of the
       * same gate would be one more thing to keep in sync.
       */
      return buka.run({ url });
    },
  },
  {
    spec: {
      name: 'web_search',
      description: 'Search the web through Zephyr built-in engines (Brave first, DuckDuckGo as fallback) and return result links with their titles. It does not return snippets - follow a promising link with web_fetch.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search keywords.' },
        },
        required: ['query'],
      },
    },
    run: async (a) => {
      const q = wajib(a, 'query');
      const kb = kebijakan();
      /* Hasil pencarian adalah ISI WEB yang dilihat model: izin opt-in berlaku
         juga di sini, walau host pencarinya milik tool (bukan URL pilihan model)
         sehingga daftar host tidak dipakai untuk jalur ini. */
      if (kb.izinIsiWeb !== true) {
        return `web_search ditolak: ${pesanTolakGerbang('izin-isi-web-mati')}`;
      }
      /* Pencarian lewat perintah Rust `web_search` (`src-tauri/src/web.rs`),
         BUKAN merangkai URL pencari sendiri lalu dilewatkan `webFetch`.
         Rust sudah punya tangga mesin (Brave dulu, DuckDuckGo cadangan) dan
         parser berbasis anchor yang tidak bergantung pada nama kelas CSS yang
         berubah antar-deploy.
         Versi lama merangkai `html.duckduckgo.com` sendiri: satu host saja
         diblokir jaringan pengguna, tool ini mati total sebelum menghasilkan
         satu baris - dan host itu memang diblokir di sebagian jaringan
         Indonesia (sertifikatnya dicokok penyedia, jadi TLS gagal). Tangga
         mesin di sisi Rust membuat pencarian tetap jalan lewat mesin lain. */
      let daftar: cmd.HasilCari[];
      try {
        daftar = await cmd.webSearch(q, 8);
      } catch (e) {
        return `Pencarian web gagal: ${e instanceof Error ? e.message : String(e)}`;
      }
      /* `judul` dari mesin sering multi-baris (Brave menyelipkan remah navigasi
         di dalam teks anchor yang sama). Dipedekan jadi satu baris supaya satu
         hasil selalu dua baris dan mudah dipindai model. */
      const satuBaris = (t: string) => t.replace(/\s+/g, ' ').trim();
      const hasil = daftar
        .slice(0, 8)
        .map((r) => `- ${r.url}\n  ${satuBaris(r.judul) || r.url}`);
      return hasil.length
        ? `Search results for "${q}":\n\n${hasil.join('\n\n')}`
        : `No web search results for "${q}".`;
    },
  },

  {
    spec: {
      name: 'web_fetch',
      description: 'Fetch the text of a web URL over HTTPS ONLY (converted from HTML to clean text with script/style removed). http:// and every other scheme are refused before a single request is made.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The https:// URL to fetch. http:// and other schemes are refused before any network request.' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      /* Gerbang izin + allowlist domain SEBELUM jaringan: URL di luar daftar
         tidak pernah sampai ke `web_fetch` di Rust, jadi tidak ada paket yang
         keluar untuk host yang tidak diizinkan (dibuktikan harness dengan
         penghitung pemanggilan fetcher). */
      const kb = { ...kebijakan() };
      if (typeof a.max_chars === 'number') kb.batasKarakter = a.max_chars; // di-clamp lagi oleh potongKeluaran()
      /* LANTAI HTTPS + izin host, juga SEBELUM jaringan. `periksaUrl` menerima
         `http:` dan `https:`; jalur ini hanya `https:`. Ditambah satu penolakan
         yang tidak ada di `periksaUrl`: URL ber-userinfo, karena di situ host
         yang DILIHAT mata pembaca bisa berbeda dari host yang divonis parser. */
      const lantai = lantaiHttpsWeb(url, kb);
      if (!lantai.ok) return `(isi web ditolak: ${pesanTolakGerbang(lantai.alasan)})`;
      const ambil = await ambilIsiWeb(lantai.url, kb, (u, maxChars) => cmd.webFetch(u, maxChars * 2));
      if (!ambil.ok) return `(isi web ditolak: ${pesanTolakGerbang(ambil.alasan)})`;
      const teksBersih = ambil.teks
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return potong(potongKeluaran(teksBersih, kb).teks || '(empty content)');
    },
  },

  {
    spec: {
      name: 'browser_open',
      description:
        'Open a URL in Zephyr\'s built-in browser, which lives in an editor tab next to the code so the user can see ' +
        'it and the agent can inspect it. There is exactly one Browser tab: opening another URL navigates that same ' +
        'tab, so browsing several pages does not pile up browsers. Use browser_read afterwards to read what the ' +
        'user is looking at.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to open.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      /* Pagar isi web: URL yang tidak diizinkan tidak pernah sampai ke pane -
         jadi tidak ada halaman yang dimuat atas nama agen di luar daftar. */
      const gerbang = gerbangIsiKonten(url, kebijakan());
      if (!gerbang.ok) return `(browser_open ditolak: ${pesanTolakGerbang(gerbang.alasan)})`;
      /*
       * The Agents window's browser comes FIRST when it is the only pane open.
       *
       * That window is a separate WebView with its own browser in the right
       * column, and the agent could not reach it: every `browser_open` landed in
       * the main window's terminal panel, so asking for a page from the Agents
       * window put it in a place the reader was not looking at while the browser
       * in front of them stayed blank. The pane there is created by its own
       * component (only it knows the rectangle), so the request travels through
       * `mintaPaneAgents` and the component loads it.
       */
      const pAg = paneAgents();
      const adaTerminal = !!tabBrowser();
      /*
       * Jendela `#agents` punya kolom kanan sendiri; permintaan buka link HARUS
       * mendarat di sana, terpisah dari pane browser main window.
       *
       * Dua keadaan, dan yang kedua dulu tidak tertangani: pane browser-nya sudah
       * dipublikasikan (cukup minta navigasi), atau kolom kanan sedang menampilkan
       * Start/File/Terminal sehingga TIDAK ADA pane untuk dimintai apa pun. Dulu
       * kasus kedua jatuh ke jalur pane terminal - yang di jendela ini tidak
       * punya pane browser - lalu berakhir "browser pane not found" setelah tool
       * sempat melapor "pane opened". Sekarang permintaannya diletakkan di
       * `mintaBukaDiAgents` dan komponen kolom kanan yang membuat view-nya.
       */
      if (diJendelaAgen()) {
        if (pAg && pAg.url && samaUrl(pAg.url, url)) {
          return `URL ${url} is already open in the Agents window's browser (${pAg.id}), and the page is readable.`;
        }
        const idPane = pAg?.id ?? ID_PANE_AGENTS;
        if (pAg) {
          if (!mintaPaneAgents(idPane, url)) {
            return (
              `Could not reach the Agents window's browser (${idPane}): it is not refreshing its state. ` +
              'Ask the user to bring the Agents window forward, then retry with the same URL.'
            );
          }
        } else {
          mintaBukaDiAgents(url);
        }
        const siapAg = await tungguHalamanAgents(url, idPane);
        return siapAg
          ? `Browser pane ${idPane} (Agents window) navigated to ${url} (page loaded, ready to read).`
          : (
              `Asked the Agents window's browser (${idPane}) to load ${url}, but it did not confirm the page ` +
              'within 15s. Keep using THIS pane id - do not open another pane. The window may be hidden or the ' +
              'page may be slow; retry browser_read on the same pane.'
            );
      }
      if (pAg && !adaTerminal) {
        if (pAg.url && samaUrl(pAg.url, url)) {
          return `URL ${url} is already open in the Agents window's browser (${pAg.id}), and the page is readable.`;
        }
        if (!mintaPaneAgents(pAg.id, url)) {
          return (
            `Could not reach the Agents window's browser (${pAg.id}): it is not refreshing its state. ` +
            'Ask the user to bring the Agents window forward, then retry with the same URL.'
          );
        }
        const siapAg = await tungguHalamanAgents(url, pAg.id);
        return siapAg
          ? `Browser pane ${pAg.id} (Agents window) navigated to ${url} (page loaded, ready to read).`
          : (
              `Asked the Agents window's browser (${pAg.id}) to load ${url}, but it did not confirm the page ` +
              'within 15s. Keep using THIS pane id - do not open another pane. The window may be hidden or the ' +
              'page may be slow; retry browser_read on the same pane.'
            );
      }
      /*
       * The Browser is ONE editor tab. There is no per-URL pane any more, so
       * the three rules the old pane code was built around still apply, just
       * to a single tab:
       *
       *  1. Same URL already showing -> do NOT navigate. Re-navigating would
       *     reload a page the reader is in the middle of, and on a form or a
       *     SPA it throws their state away for no reason.
       *  2. Different URL -> retarget the tab through `bukaViewAi('browser',
       *     { url })`, which writes `tab.url`. Writing the store alone is not
       *     enough: the child webview holds the old page, so `pakaiUlangPane`
       *     navigates it and only then records the address.
       *  3. Never create a second webview while the first has not answered.
       *     One tab means one id, so a slow page is reported honestly instead
       *     of being papered over with a duplicate.
       */
      const ada = tabBrowser();
      if (ada && ada.url && samaUrl(ada.url, url)) {
        /* Already on this page: the only open question is whether the webview
           is alive (the tab may be behind another one). */
        pastikanTampil(ID_TAB_BROWSER);
        const hidup = await pastikanHalaman(ID_TAB_BROWSER, url);
        return hidup
          ? `URL ${url} is already open in the Browser tab, and the page is readable.`
          : `URL ${url} is already open in the Browser tab, but its webview is not answering yet (${galatEvalTerakhir ?? 'penyebab tidak diketahui'}) - the tab is probably not rendered on screen, so browser_read cannot see the page.`;
      }
      if (ada) {
        /* The tab exists with another page: navigate it rather than opening a
           second one. Two attempts, then report honestly - the id stays the
           same either way, so a retry lands on the same tab. */
        if (await pakaiUlangPane(ID_TAB_BROWSER, url)) {
          return `Browser tab reused: navigated to ${url} (page loaded, ready to read).`;
        }
        await new Promise((r) => setTimeout(r, 800));
        if (await pakaiUlangPane(ID_TAB_BROWSER, url)) {
          return `Browser tab reused: navigated to ${url} (page loaded, ready to read).`;
        }
        if (tabBrowser()) {
          return (
            `The Browser tab is open, but its webview did not start answering within 15s ` +
            `(${galatEvalTerakhir ?? 'penyebab tidak diketahui'}). Do NOT try to open a second browser - ` +
            'there is only one. Bring the Browser tab to the front, then retry browser_read.'
          );
        }
      }
      /*
       * No tab yet: create it. `bukaViewAi` both creates the tab and makes it
       * active, which is what gives its stage a rect - a tab that is not
       * active renders no webview at all.
       */
      useStore.getState().bukaViewAi('browser', { url });
      pastikanTampil(ID_TAB_BROWSER);
      const siap = await pastikanHalaman(ID_TAB_BROWSER, url);
      if (siap) useStore.getState().setTabUrl(ID_TAB_BROWSER, url);
      return siap
        ? `Browser tab opened with URL: ${url} (page loaded, ready to read).`
        : (
            `Browser tab opened with URL: ${url}, but the page did not finish loading within 15s ` +
            `(${galatEvalTerakhir ?? 'penyebab tidak diketahui'}). Keep using the Browser tab - do not open ` +
            'another one. Make sure the tab is visible on screen, then retry browser_read; web_fetch is only ' +
            'for a static copy.'
          );
    },
  },

  {
    spec: {
      name: 'browser_read',
      description: 'Read the text and links from a browser pane that is currently open.',
      parameters: {
        type: 'object',
        properties: {
          pane_id: { type: 'string', description: 'ID of a specific browser pane (optional).' },
        },
      },
    },
    run: async (a) => {
      const id = idBrowserEfektif(a.pane_id ? String(a.pane_id) : undefined);
      if (!id) throw new Error('No browser pane is currently open. Open one first with browser_open.');
      const konten = await bacaHalaman(id, kebijakan());
      return potong(konten);
    },
  },

  {
    spec: {
      name: 'browser_click',
      description: 'Click an element on the active browser page using a CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to click.' },
        },
        required: ['selector'],
      },
    },
    run: async (a) => {
      const sel = wajib(a, 'selector');
      const id = idBrowserEfektif();
      if (!id) throw new Error('No browser pane is active.');
      /*
       * Klik dijalankan DI DALAM halaman (browser_pane_eval), bukan lewat
       * iframe: pane browser adalah child webview, jadi `iframe.contentDocument`
       * tidak ada untuknya dan jalur lama hanya mengembalikan kalimat "click
       * simulated" tanpa mengklik apa pun - keberhasilan palsu.
       */
      const skrip =
        '(function(){var el=document.querySelector(' +
        JSON.stringify(sel) +
        ');if(!el)return "tidak ada elemen: " + ' +
        JSON.stringify(sel) +
        ';el.click();return "diklik: " + ' +
        JSON.stringify(sel) +
        ';})()';
      const pesan = await evalPane<string>(id, skrip);
      if (pesan === null) throw new Error(`Element not found for selector: "${sel}"`);
      return String(pesan);
    },
  },

  {
    spec: {
      name: 'browser_type',
      description: 'Type text into a form input in the browser pane.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the input or textarea element.' },
          text: { type: 'string', description: 'The text to type.' },
        },
        required: ['selector', 'text'],
      },
    },
    run: async (a) => {
      const sel = wajib(a, 'selector');
      const teks = wajib(a, 'text');
      const id = idBrowserEfektif();
      if (!id) throw new Error('No browser pane is active.');
      /* Sama seperti browser_click: pengisian kolom harus terjadi di dalam
       * halaman, bukan di iframe yang tidak ada. */
      const selJ = JSON.stringify(sel);
      const teksJ = JSON.stringify(teks);
      const skrip =
        '(function(){var el=document.querySelector(' + selJ + ');' +
        'if(!el)return "tidak ada kolom: " + ' + selJ + ';' +
        'el.focus();el.value=' + teksJ + ';' +
        'el.dispatchEvent(new Event("input",{bubbles:true}));' +
        'el.dispatchEvent(new Event("change",{bubbles:true}));' +
        'return "diisi " + ' + selJ + ' + " dengan " + ' + teksJ + ';})()';
      const pesan = await evalPane<string>(id, skrip);
      if (pesan === null) throw new Error(`Input element not found: "${sel}"`);
      return String(pesan);
    },
  },


  {
    spec: {
      name: 'browser_list',
      description: 'List the Browser tab (Zephyr\'s in-app browser) and any browser open in the Agents window, with URL and title.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const browserPanes: Array<{ id: string; url?: string; title?: string; window?: string }> = [];
      const tab = tabBrowser();
      if (tab) {
        /*
         * The tab is listed from what the WEBVIEW reports, not from the store:
         * the reader can navigate inside the page, and a stored address that
         * went stale would send the agent to the wrong page.
         */
        let judul = '';
        try {
          judul = (await evalPane<string>(ID_TAB_BROWSER, 'document.title')) ?? '';
        } catch {
          judul = '';
        }
        browserPanes.push({ id: ID_TAB_BROWSER, url: tab.url, title: judul || undefined });
      }
      /* The Agents window's browser is published separately (another WebView),
         so it has to be added here or the tool reports "none open" while a
         browser is plainly on screen. */
      for (const p of daftarPaneAgents()) {
        browserPanes.push({ id: p.id, url: p.url || undefined, title: p.title || undefined, window: 'agents' });
      }
      if (!browserPanes.length) return 'No browser is currently open.';
      return JSON.stringify(browserPanes, null, 2);
    },
  },

  {
    spec: {
      name: 'browser_close',
      description: 'Close the Browser tab, or a browser open in the Agents window.',
      parameters: {
        type: 'object',
        properties: {
          pane_id: { type: 'string', description: 'ID of the browser to close.' },
        },
      },
    },
    run: async (a) => {
      const id = idBrowserEfektif(a.pane_id ? String(a.pane_id) : undefined);
      if (!id) return 'No browser found to close.';
      /*
       * An Agents-window pane is owned by its component, not by the terminal
       * store. Asking it to blank the pane is how it gets torn down — the
       * component then closes the child webview and unpublishes the entry.
       *
       * The request needs a reader, and only the Agents window has one, so this
       * only works from there. The registry writes `minta: ''` and then removes
       * the entry; `lupakanPaneAgents` removes it outright. So after the write,
       * wait until the pane is really gone before answering — the old code
       * answered "closed successfully" the moment the flag was written, which
       * also reported the wrong thing when nobody could read it.
       */
      if (idAgents(id)) {
        if (!diJendelaAgents()) {
          return `Browser pane ${id} belongs to the Agents window; close it there (its A- button).`;
        }
        if (!mintaPaneAgents(id, '')) return `Could not reach the Agents window's browser (${id}).`;
        return (await tungguTutupAgents(id))
          ? `Browser pane ${id} (Agents window) closed successfully.`
          : `Browser pane ${id} (Agents window) was asked to close but is still open.`;
      }
      /*
       * The Browser is an editor tab, so closing it means closing the TAB: the
       * component's unmount is what closes the child webview, and leaving the
       * tab behind would be a browser the agent can no longer reach.
       */
      const tab = tabBrowser();
      if (!tab) return 'No browser found to close.';
      useStore.getState().requestCloseTab(tab.id);
      return 'Browser tab closed successfully.';
    },
  },

  {
    spec: {
      name: 'browser_download_url',
      description: 'Download a file from a URL straight into the local workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the file to download.' },
          destination_path: { type: 'string', description: 'Relative path inside the workspace to save the file to.' },
        },
        required: ['url', 'destination_path'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      const dest = wajib(a, 'destination_path');
      const kb = kebijakan();
      /* Dua pagar sebelum satu byte pun bergerak: host harus diizinkan, dan
         tujuan tulis harus lolos pagar tulis agen (`periksaTulis`, sama dengan
         jalur tulis lain) - unduhan tidak boleh menjadi cara menulis ke berkas
         yang dilindungi. */
      const gerbang = gerbangIsiKonten(url, kb);
      if (!gerbang.ok) return `(download ditolak: ${pesanTolakGerbang(gerbang.alasan)})`;
      const izinTulis = periksaTulis(dest);
      if (!izinTulis.ok) return `(download ditolak: ${izinTulis.alasan})`;
      /* Batas byte keras: 2 MiB bawaan, 8 MiB maksimum. Yang diminta dari
         jaringan dibatasi dulu, lalu hasil nyatanya diperiksa lagi - supaya
         server yang mengabaikan batas tetap tidak bisa menulis berkas raksasa. */
      const konten = await cmd.webFetch(url, batasByteBerlaku(kb.batasByte));
      const ukuran = ukuranByte(konten);
      const cekUkuran = batasiByte(ukuran, kb.batasByte);
      if (!cekUkuran.ok) return `(download ditolak: ${cekUkuran.alasan})`;
      /* A file this turn creates, written through `cmd.fsWrite` rather than the
         builtins' `tulis()` helper — so the checkpoint has to be told here too,
         or the download is invisible to "put back what this turn changed".
         Fail-open like the builtins' write path: the snapshot is bookkeeping,
         and a dead dev server must not fail a finished download. */
      await (await import('../checkpoint')).catat(dest).catch(() => undefined);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      /* A download is a new file on disk like any other, so the tree has to
         hear about it. Same reason as the builtins' write path: relying on
         the watcher left the file missing from Explorer until a refresh. */
      try {
        const { useExplorer } = await import('../explorerStore');
        const dir = dest.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');
        await useExplorer.getState().refreshDir(dir || dest);
      } catch {
        /* Redrawing the tree must not fail the download. */
      }
      return `File from ${url} downloaded successfully to ${dest} (${ukuran} bytes).`;
    },
  },
];
