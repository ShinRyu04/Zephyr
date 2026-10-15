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

/** Cari pane browser yang ada di terminalStore. */
function paneBrowserId(idAtauUrl?: string): string | null {
  const st = useTerminal.getState();
  const semua: { id: string; url: string | undefined }[] = [];
  for (const t of st.terminalTabs) {
    for (const p of t.panes) {
      if (p.kind === 'browser') semua.push({ id: p.id, url: p.url });
    }
  }
  if (!semua.length) return null;
  if (idAtauUrl) {
    const cocok =
      semua.find((p) => p.id === idAtauUrl) ??
      semua.find((p) => p.url && p.url.includes(idAtauUrl));
    return cocok ? cocok.id : null;
  }
  /*
   * Tanpa argumen, pane yang dituju adalah pane AKTIF - bukan pane browser
   * pertama yang ditemukan. Pane pertama sering pane lama yang sudah ditinggal:
   * `browser_open` membuat pane baru dan menjadikannya aktif, lalu `browser_read`
   * yang tanpa argumen membaca pane lama itu dan melaporkan isinya, sehingga
   * halaman yang baru dibuka tampak "kosong".
   */
  const tabAktif = st.terminalTabs.find((t) => t.id === st.activeTabId);
  const paneAktif = tabAktif?.panes.find((p) => p.id === tabAktif.activePaneId && p.kind === 'browser');
  return paneAktif ? paneAktif.id : semua[semua.length - 1].id;
}

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
      'The user must turn it on (Chat Settings > Konten web, settings key izinIsiWeb). Do not retry and do not switch tools: they share this gate.'
    );
  }
  if (alasan.startsWith('host-luar-allowlist:')) {
    const host = alasan.slice('host-luar-allowlist:'.length);
    return (
      alasan +
      ` - host ${host} is not in the web-content allowlist (settings key allowlistWeb; edited in Chat Settings > Konten web). ` +
      'Tell the user the exact host and ask whether to add it. Do NOT retry and do NOT try another web tool - ' +
      'web_fetch, browser_read and download use this same gate and fail the same way. ' +
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
  useTerminal.getState().setPaneUrl(paneId, url);
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
  const tabs = useTerminal.getState().terminalTabs;
  for (const t of tabs) {
    for (const p of t.panes) {
      if (p.id === paneId && p.url) {
        try {
          return await cmd.webFetch(p.url, 15000);
        } catch (e) {
          return `(gagal membaca halaman: jalur DOM tidak tersedia - ${sebab} - dan fetch statis gagal: ${pesanGalat(e)})`;
        }
      }
    }
  }
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
        'Open a URL in the app built-in browser pane so the user can see it and the agent can inspect it. ' +
        'By default this REUSES the existing browser pane (the pane navigates to the new URL) so browsing several pages does not litter the terminal with panes; pass new_pane=true only when the user asks to compare two pages side by side.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to open.' },
          new_pane: {
            type: 'boolean',
            description: 'Open an extra pane for this URL instead of navigating the existing browser pane (default false).',
          },
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
      const t = useTerminal.getState();
      /*
       * Pane browser yang sudah membawa URL INI dipakai ulang; selain itu
       * dibuat pane baru.
       *
       * Dulu di sini `setPaneUrl(existing, url)` dipanggil pada pane browser
       * PERTAMA yang ditemukan, apa pun isinya. Itu salah karena dua alasan:
       *
       *  1. URL hanya tersimpan di state. Child webview sudah dibuat dengan
       *     URL lama, dan `setPaneUrl` tidak menyuruhnya bernavigasi - jadi
       *     store menjawab `github.com/...` sementara layarnya tetap
       *     menampilkan halaman sebelumnya.
       *  2. Pengguna yang sedang membaca satu halaman kehilangan halamannya
       *     tanpa diminta begitu agen membuka tautan lain.
       *
       * Jadi kesamaan URL-lah yang menentukan, bukan keberadaan pane browser.
       * `setPaneUrl` tetap dipakai HANYA saat tidak ada yang berubah - yaitu
       * ketika URL-nya sudah sama dan tidak ada yang perlu dinavigasi.
       */
      const sameUrl = t
        .allPanes()
        .find((p) => p.kind === 'browser' && p.url === url);
      if (sameUrl) {
        /* Pane-nya sudah ada: yang belum pasti adalah webview-nya hidup. */
        pastikanTampil(sameUrl.id);
        const siap = await pastikanHalaman(sameUrl.id, url);
        return siap
          ? `URL ${url} is already open in browser pane (${sameUrl.id}), and the page is readable.`
          : `URL ${url} is already open in browser pane (${sameUrl.id}), but its webview is not active yet (${galatEvalTerakhir ?? 'tidak diketahui'}) - the pane is probably not rendered on screen, so browser_read cannot see the page.`;
      }
      /*
       * Pakai ulang pane browser yang SUDAH ada - kecuali pemanggil minta pane
       * terpisah.
       *
       * Sebelum ini setiap URL dapat pane baru, jadi agen yang menelusuri lima
       * halaman meninggalkan lima pane: kena batas pane, dan pengguna harus
       * menutupinya satu per satu. Pemakaian ulang dilakukan dengan MENUTUP lalu
       * membuka (bukan `setPaneUrl`) karena child webview hidup di proses
       * WebView2 dengan URL lama - mengubah state saja membuat pane yang
       * mengklaim halaman baru sementara isinya masih halaman lama.
       */
      const mintaBaru = a.new_pane === true;
      const paneLama = mintaBaru ? null : paneBrowserId();
      if (paneLama) {
        /*
         * Pane yang sudah ada DIPAKAI ULANG: webview-nya dinavigasi ke URL baru.
         *
         * Dulu kegagalan di sini langsung MENUTUP pane lama lalu membuat pane
         * baru. Itu sumber keluhan "tiap buka, pane baru terus": id pane berubah,
         * panel berkedip, dan riwayat back/forward hilang hanya karena webview
         * belum sempat hidup (panel belum dirender saat aplikasi baru dibuka).
         * Sekarang pane lama DIPERTAHANKAN: dicoba sekali lagi, dan kalau tetap
         * belum hidup, agen diberi tahu apa adanya - id pane tetap sama, jadi
         * percobaan berikutnya memakai pane yang sama.
         */
        if (await pakaiUlangPane(paneLama, url)) {
          return `Browser pane ${paneLama} reused: navigated to ${url} (page loaded, ready to read).`;
        }
        await new Promise((r) => setTimeout(r, 800));
        if (await pakaiUlangPane(paneLama, url)) {
          return `Browser pane ${paneLama} reused: navigated to ${url} (page loaded, ready to read).`;
        }
        const masihAda = useTerminal.getState().allPanes().some((p) => p.id === paneLama);
        if (masihAda) {
          /*
           * Pane-nya ADA, webview-nya yang belum menjawab. Jangan buat pane
           * kedua: itu melipatgandakan masalah (dua pane, id berbeda, satu di
           * antaranya buta). Beri tahu agen supaya menunggu panel tampil lalu
           * mencoba lagi dengan pane yang sama.
           */
          return (
            `Browser pane ${paneLama} is still the active pane, but its webview did not start answering ` +
            `within 15s (${galatEvalTerakhir ?? 'penyebab tidak diketahui'}). Do NOT open another pane - ` +
            'keep using this pane id. Make sure the terminal/browser panel is visible on screen, then retry ' +
            'by retrying browser_open with the same URL on the same pane.'
          );
        }
      }
      const paneId = await t.addPane('browser', { url });
      if (!paneId) {
        /*
         * addPane menolak ketika batas pane tercapai, dan pelaporannya ada di
         * `toast` - bukan sebagai lemparan. Mengembalikan pesan sukses di sini
         * akan membuat agen mengira halamannya terbuka lalu menebak-nebak
         * kenapa `browser_read` tidak menemukan apa pun.
         */
        return (
          `Cannot open a new browser pane: ${useTerminal.getState().toast ?? 'pane limit reached'}. ` +
          'Close a pane first, or raise the limit in Settings.'
        );
      }
      /*
       * Tampilkan pane-nya, lalu TUNGGU sampai webview-nya menjawab. Pesan
       * sukses di sini berarti "halamannya sudah bisa dibaca", bukan sekadar
       * "objek pane sudah dibuat" - bedanya pernah menipu agen: ia membuka
       * halaman, langsung membacanya, mendapat teks kosong, lalu menyimpulkan
       * halaman itu memang tidak berisi apa-apa.
       */
      pastikanTampil(paneId);
      const siap = await pastikanHalaman(paneId, url);
      if (siap) useTerminal.getState().setPaneUrl(paneId, url);
      return siap
        ? `Browser pane ${paneId} opened with URL: ${url} (page loaded, ready to read).`
        : (
            `Browser pane ${paneId} opened with URL: ${url}, but the page did not finish loading within 15s ` +
            `(${galatEvalTerakhir ?? 'penyebab tidak diketahui'}). Keep THIS pane id - do not open another pane. ` +
            'Ask the user to show the terminal/browser panel if it is hidden, then retry with browser_read or ' +
            'browser_read on the same pane; web_fetch is only for a static copy.'
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
      const id = paneBrowserId(a.pane_id ? String(a.pane_id) : undefined);
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
      const id = paneBrowserId();
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
      const id = paneBrowserId();
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
      description: 'List every browser pane that is currently open, with its URL and title.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const tabs = useTerminal.getState().terminalTabs;
      const browserPanes: Array<{ id: string; url?: string; title?: string }> = [];
      for (const t of tabs) {
        for (const p of t.panes) {
          if (p.kind === 'browser') {
            browserPanes.push({ id: p.id, url: p.url, title: p.title });
          }
        }
      }
      if (!browserPanes.length) return 'No browser pane is currently open.';
      return JSON.stringify(browserPanes, null, 2);
    },
  },

  {
    spec: {
      name: 'browser_close',
      description: 'Close a specific browser pane, or the browser pane that is currently active.',
      parameters: {
        type: 'object',
        properties: {
          pane_id: { type: 'string', description: 'ID of the browser pane to close.' },
        },
      },
    },
    run: async (a) => {
      const id = paneBrowserId(a.pane_id ? String(a.pane_id) : undefined);
      if (!id) return 'No browser pane found to close.';
      await useTerminal.getState().closePane(id);
      return `Browser pane ${id} closed successfully.`;
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
         or the download is invisible to "put back what this turn changed". */
      await (await import('../checkpoint')).catat(dest);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      return `File from ${url} downloaded successfully to ${dest} (${ukuran} bytes).`;
    },
  },
];
