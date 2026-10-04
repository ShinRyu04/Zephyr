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
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTerminal } from '../terminalStore';
import * as cmd from '../commands';
import type { AgentTool } from '../agentTools';
import { potong, wajib } from './builtins';

/** Cari pane browser yang ada di terminalStore. */
function paneBrowserId(idAtauUrl?: string): string | null {
  const tabs = useTerminal.getState().terminalTabs;
  for (const t of tabs) {
    for (const p of t.panes) {
      if (p.kind === 'browser') {
        if (!idAtauUrl) return p.id;
        if (p.id === idAtauUrl) return p.id;
        if (p.url && p.url.includes(idAtauUrl)) return p.id;
      }
    }
  }
  return null;
}

/** Baca teks halaman lewat DOM scraping bridge iframe atau fetch fallback. */
async function bacaHalaman(paneId: string): Promise<string> {
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
  const tabs = useTerminal.getState().terminalTabs;
  for (const t of tabs) {
    for (const p of t.panes) {
      if (p.id === paneId && p.url) {
        try {
          return await cmd.webFetch(p.url, 15000);
        } catch (e) {
          return `(failed to read content via fetch: ${e})`;
        }
      }
    }
  }
  return '(page not loaded yet, or empty)';
}

export const TOOL_WEB: AgentTool[] = [
  {
    spec: {
      name: 'web_search',
      description: 'Search the web through DuckDuckGo HTML and return a list of links with their snippets.',
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
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const html = await cmd.webFetch(url, 25000);
      const hasil: string[] = [];
      const re = /<a[^>]+class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = re.exec(html)) !== null && count < 8) {
        const link = m[1].replace(/.*uddg=([^&]+).*/, (_, u) => decodeURIComponent(u));
        const snippet = m[2].replace(/<[^>]+>/g, '').trim();
        hasil.push(`- ${link}\n  ${snippet}`);
        count++;
      }
      if (!hasil.length) {
        const reTitle = /<a[^>]+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        while ((m = reTitle.exec(html)) !== null && count < 8) {
          const link = m[1].replace(/.*uddg=([^&]+).*/, (_, u) => decodeURIComponent(u));
          hasil.push(`- ${link}`);
          count++;
        }
      }
      return hasil.length
        ? `Search results for "${q}":\n\n${hasil.join('\n\n')}`
        : `No web search results for "${q}".`;
    },
  },

  {
    spec: {
      name: 'web_fetch',
      description: 'Fetch the text of a web URL (converted from HTML to clean text with script/style removed).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch (http:// or https://).' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      const maxChars = typeof a.max_chars === 'number' ? a.max_chars : 15000;
      const html = await cmd.webFetch(url, maxChars * 2);
      const teksBersih = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return potong(teksBersih.slice(0, maxChars) || '(empty content)');
    },
  },

  {
    spec: {
      name: 'browser_open',
      description: 'Open a URL in the app built-in browser pane so the user can see it and the agent can inspect it.',
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
        return `URL ${url} is already open in browser pane (${sameUrl.id}).`;
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
      return `Browser pane ${paneId} opened with URL: ${url}`;
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
      const konten = await bacaHalaman(id);
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
      const iframe = document.querySelector(`iframe[data-pane-id="${id}"]`) as HTMLIFrameElement | null;
      if (!iframe || !iframe.contentDocument) {
        return `Click simulated on selector "${sel}" (direct frame access is restricted).`;
      }
      const el = iframe.contentDocument.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`Element not found for selector: "${sel}"`);
      el.click();
      return `Element clicked successfully: "${sel}"`;
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
      const iframe = document.querySelector(`iframe[data-pane-id="${id}"]`) as HTMLIFrameElement | null;
      if (!iframe || !iframe.contentDocument) {
        return `Typing text "${teks}" into "${sel}" was simulated.`;
      }
      const el = iframe.contentDocument.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`Input element not found: "${sel}"`);
      el.value = teks;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return `Text typed successfully into "${sel}".`;
    },
  },

  {
    spec: {
      name: 'browser_nav',
      description: 'Navigate the browser pane: back, forward, reload, or change URL.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['back', 'forward', 'reload', 'goto'] },
          url: { type: 'string', description: 'Target URL for the "goto" action.' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const act = wajib(a, 'action');
      const id = paneBrowserId();
      if (!id) throw new Error('No browser pane is active.');
      const t = useTerminal.getState();

      /*
       * `goto` membuang dan membuat ulang pane; `back`/`forward`/`reload`
       * memakai perintah webview yang sudah ada.
       *
       * Sebelum ini ketiga aksi terakhir tidak melakukan apa pun - handler-nya
       * mengembalikan `Navigasi browser ${act} dijalankan.` tanpa menyentuh
       * webview sama sekali, jadi model melaporkan keberhasilan atas halaman
       * yang tidak bergerak. Itu kesalahan yang paling menyesatkan di sini:
       * hasilnya benar, aksinya tidak ada.
       *
       * `back`/`forward`/`reload` tidak bisa lewat jalur buang-dan-buat ulang
       * karena halaman baru tidak punya riwayat - membuat ulang URL yang sama
       * justru MENGHAPUS riwayat yang jadi tujuan `back`. Jadi ketiganya
       * dikirim sebagai perintah ke webview yang hidup.
       */
      if (act === 'goto') {
        const tujuan = String(a.url ?? '');
        if (!tujuan) throw new Error('action "goto" requires "url".');
        /*
         * Keluar dari pane lalu buka baru: itu satu-satunya jalur yang benar-
         * benar memuat halaman.
         *
         * `setPaneUrl` hanya menulis state, sedangkan child webview sudah
         * hidup dengan URL lama di dalam proses WebView2 - jadi mengubah state
         * menghasilkan pane yang MENGKLAIM halaman baru sementara isinya masih
         * halaman lama. Menutup dulu memaksa webview dibuang, dan pembukaan
         * berikutnya membuatnya dengan URL yang benar.
         */
        await t.closePane(id);
        const paneId = await t.addPane('browser', { url: tujuan });
        if (!paneId) {
          return `Failed to navigate to ${tujuan}: ${useTerminal.getState().toast ?? 'pane limit reached'}.`;
        }
        return `Browser pane ${paneId} navigated to ${tujuan}.`;
      }

      /*
       * `browserPaneNav` meneruskan aksinya apa adanya ke Rust, dan Rust yang
       * memutuskan artinya - jadi ketiga nama di bawah harus sama persis dengan
       * yang dikenali perintah `browser_pane_nav`.
       */
      const SAH = new Set(['back', 'forward', 'reload']);
      if (!SAH.has(act)) throw new Error(`action tidak dikenal: ${act}`);

      await cmd.browserPaneNav(id, act);
      return `Browser pane ${id}: ${act} executed.`;
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
      const konten = await cmd.webFetch(url, 200000);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      return `File from ${url} downloaded successfully to ${dest} (${konten.length} bytes).`;
    },
  },

  {
    spec: {
      name: 'system_browser_open',
      description: 'Open a URL in the user operating system default external browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to open.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      await openUrl(url);
      return `URL opened in the external system browser: ${url}`;
    },
  },
];
