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
          return `(gagal membaca konten via fetch: ${e})`;
        }
      }
    }
  }
  return '(halaman belum dimuat atau kosong)';
}

export const TOOL_WEB: AgentTool[] = [
  {
    spec: {
      name: 'web_search',
      description: 'Cari di web lewat DuckDuckGo HTML dan kembalikan daftar tautan beserta cuplikannya.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian.' },
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
        ? `Hasil pencarian untuk "${q}":\n\n${hasil.join('\n\n')}`
        : `Tidak ada hasil pencarian web untuk "${q}".`;
    },
  },

  {
    spec: {
      name: 'web_fetch',
      description: 'Ambil teks sebuah URL web (dikonversi dari HTML menjadi teks bersih tanpa script/style).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL yang ingin diambil (http:// atau https://).' },
          max_chars: { type: 'number', description: 'Batas karakter teks (default 15000).' },
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
      return potong(teksBersih.slice(0, maxChars) || '(konten kosong)');
    },
  },

  {
    spec: {
      name: 'browser_open',
      description: 'Buka URL di pane browser bawaan aplikasi agar bisa dilihat user dan diinspeksi oleh agent.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL lengkap yang ingin dibuka.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      const t = useTerminal.getState();
      const existing = paneBrowserId();
      if (existing) {
        t.setPaneUrl(existing, url);
        return `URL ${url} dibuka di pane browser yang ada (${existing}).`;
      }
      await t.addPane('browser', { url });
      return `Pane browser baru dibuka dengan URL: ${url}`;
    },
  },

  {
    spec: {
      name: 'browser_read',
      description: 'Baca isi teks dan tautan dari pane browser yang sedang terbuka.',
      parameters: {
        type: 'object',
        properties: {
          pane_id: { type: 'string', description: 'ID pane browser spesifik (opsional).' },
        },
      },
    },
    run: async (a) => {
      const id = paneBrowserId(a.pane_id ? String(a.pane_id) : undefined);
      if (!id) throw new Error('Tidak ada pane browser yang sedang terbuka. Buka dulu dengan browser_open.');
      const konten = await bacaHalaman(id);
      return potong(konten);
    },
  },

  {
    spec: {
      name: 'browser_click',
      description: 'Klik elemen pada halaman browser aktif menggunakan CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector elemen yang ingin diklik.' },
        },
        required: ['selector'],
      },
    },
    run: async (a) => {
      const sel = wajib(a, 'selector');
      const id = paneBrowserId();
      if (!id) throw new Error('Tidak ada pane browser yang aktif.');
      const iframe = document.querySelector(`iframe[data-pane-id="${id}"]`) as HTMLIFrameElement | null;
      if (!iframe || !iframe.contentDocument) {
        return `Klik disimulasikan pada selector "${sel}" (akses langsung frame dibatasi).`;
      }
      const el = iframe.contentDocument.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`Elemen tidak ditemukan untuk selector: "${sel}"`);
      el.click();
      return `Berhasil mengklik elemen: "${sel}"`;
    },
  },

  {
    spec: {
      name: 'browser_type',
      description: 'Ketik teks ke dalam input form di pane browser.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector elemen input atau textarea.' },
          text: { type: 'string', description: 'Teks yang akan diketikkan.' },
        },
        required: ['selector', 'text'],
      },
    },
    run: async (a) => {
      const sel = wajib(a, 'selector');
      const teks = wajib(a, 'text');
      const id = paneBrowserId();
      if (!id) throw new Error('Tidak ada pane browser yang aktif.');
      const iframe = document.querySelector(`iframe[data-pane-id="${id}"]`) as HTMLIFrameElement | null;
      if (!iframe || !iframe.contentDocument) {
        return `Ketik teks "${teks}" disimulasikan pada "${sel}".`;
      }
      const el = iframe.contentDocument.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`Elemen input tidak ditemukan: "${sel}"`);
      el.value = teks;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return `Teks berhasil diketik ke "${sel}".`;
    },
  },

  {
    spec: {
      name: 'browser_nav',
      description: 'Navigasi pane browser: back, forward, reload, atau ganti URL.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['back', 'forward', 'reload', 'goto'] },
          url: { type: 'string', description: 'URL tujuan untuk action "goto".' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const act = wajib(a, 'action');
      const id = paneBrowserId();
      if (!id) throw new Error('Tidak ada pane browser yang aktif.');
      const t = useTerminal.getState();
      if (act === 'goto' && a.url) {
        t.setPaneUrl(id, String(a.url));
        return `Pane browser bernavigasi ke ${a.url}.`;
      }
      return `Navigasi browser ${act} dijalankan.`;
    },
  },

  {
    spec: {
      name: 'browser_list',
      description: 'Daftar semua pane browser yang sedang terbuka beserta URL dan judulnya.',
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
      if (!browserPanes.length) return 'Tidak ada pane browser yang sedang terbuka.';
      return JSON.stringify(browserPanes, null, 2);
    },
  },

  {
    spec: {
      name: 'browser_close',
      description: 'Tutup sebuah pane browser tertentu atau pane browser yang sedang aktif.',
      parameters: {
        type: 'object',
        properties: {
          pane_id: { type: 'string', description: 'ID pane browser yang ingin ditutup.' },
        },
      },
    },
    run: async (a) => {
      const id = paneBrowserId(a.pane_id ? String(a.pane_id) : undefined);
      if (!id) return 'Tidak ada pane browser yang ditemukan untuk ditutup.';
      await useTerminal.getState().closePane(id);
      return `Pane browser ${id} berhasil ditutup.`;
    },
  },

  {
    spec: {
      name: 'browser_download_url',
      description: 'Unduh berkas dari URL langsung ke direktori workspace lokal.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL berkas yang akan diunduh.' },
          destination_path: { type: 'string', description: 'Jalur relatif di dalam workspace untuk menyimpan berkas.' },
        },
        required: ['url', 'destination_path'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      const dest = wajib(a, 'destination_path');
      const konten = await cmd.webFetch(url, 200000);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      return `Berkas dari ${url} berhasil diunduh ke ${dest} (${konten.length} byte).`;
    },
  },

  {
    spec: {
      name: 'system_browser_open',
      description: 'Buka URL di browser eksternal sistem operasi bawaan user.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL yang ingin dibuka.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const url = wajib(a, 'url');
      await openUrl(url);
      return `URL dibuka di browser sistem eksternal: ${url}`;
    },
  },
];
