/**
 * `browser` — one tool, seven browser actions.
 *
 * ## Why
 *
 * The catalogue carried `browser_open`, `browser_read`, `browser_click`,
 * `browser_type`, `browser_list`, `browser_close` and `browser_download_url` as
 * seven entries. They act on the same pane, pass through the same gate
 * (`gerbangIsiKonten`), and differ only in which action is performed - so seven
 * names meant seven rows to choose between for one decision, and `tool_search`
 * returning five near-misses for "open this page".
 *
 * ## How, and why not by rewriting `web.ts`
 *
 * This dispatches to the EXISTING seven tools rather than reimplementing them.
 * Rewriting the bodies was tried first and abandoned: lifting `run` out of each
 * object literal by text is brittle - the bodies contain nested braces, template
 * literals with `${}`, and comments with braces in them, so a line-based
 * extractor cut three of the seven functions short and produced a file that did
 * not compile.
 *
 * Dispatching keeps every gate check, refusal message and `kebijakan()` call
 * exactly where it is. The seven definitions stay in `TOOL_WEB`; they are simply
 * no longer offered to the model under seven names.
 */
import type { AgentTool } from '../agentTools';
import { TOOL_WEB } from './web';

const AKSI = ['open', 'read', 'click', 'type', 'list', 'close', 'download'] as const;
export type BrowserAksi = (typeof AKSI)[number];

/** Which old tool implements which action. */
const PETA: Record<BrowserAksi, string> = {
  open: 'browser_open',
  read: 'browser_read',
  click: 'browser_click',
  type: 'browser_type',
  list: 'browser_list',
  close: 'browser_close',
  download: 'browser_download_url',
};

/** The seven tools this replaces - exported so the registry can exclude them. */
export const TOOL_BROWSER_LAMA: readonly string[] = Object.values(PETA);

export const TOOL_BROWSER: AgentTool = {
  spec: {
    name: 'browser',
    description:
      'Kendalikan pane browser Zephyr - SATU tool untuk semua aksi. ' +
      'aksi: open (buka URL di pane), read (baca teks halaman yang terbuka), click (klik elemen lewat CSS selector), type (isi field), list (daftar pane), close (tutup pane), download (unduh URL ke berkas). ' +
      'url wajib untuk open/download; selector wajib untuk click/type; text wajib untuk type; paneId opsional (bawaan: pane aktif). ' +
      'SEMUA aksi melewati pagar yang sama: izin isi web harus nyala dan host harus terdaftar di allowlistWeb. Hasil "host-luar-allowlist:<host>" BUKAN error yang bisa diulang - jangan coba ulang, jangan pindah ke tool web lain (pagarnya sama), sebutkan hostnya ke user.',
    parameters: {
      type: 'object',
      properties: {
        aksi: { type: 'string', enum: [...AKSI], description: 'Aksi yang dijalankan pada pane browser.' },
        url: { type: 'string', description: 'Untuk open/download: URL tujuan.' },
        paneId: { type: 'string', description: 'Pane yang dituju. Kosong = pane aktif.' },
        selector: { type: 'string', description: 'Untuk click/type: CSS selector elemen.' },
        text: { type: 'string', description: 'Untuk type: teks yang diketik.' },
        simpanKe: { type: 'string', description: 'Untuk download: jalur berkas tujuan.' },
      },
      required: ['aksi'],
    },
  },
  run: async (a) => {
    const aksi = String(a.aksi ?? '').trim() as BrowserAksi;
    if (!AKSI.includes(aksi)) {
      throw new Error(`ERROR: aksi "${a.aksi}" tidak dikenal. Pilihan: ${AKSI.join(', ')}.`);
    }

    /*
     * Translate the unified argument shape back into the per-tool shape the old
     * tools expect. `pane_id` (snake) for the ones that use it, `paneId` for the
     * others - the seven were written at different times and this adapter is
     * where that difference is absorbed rather than changed.
     */
    const args: Record<string, unknown> = {};
    if (a.url !== undefined) args.url = a.url;
    if (a.selector !== undefined) args.selector = a.selector;
    if (a.text !== undefined) args.text = a.text;
    if (a.simpanKe !== undefined) args.simpanKe = a.simpanKe;
    if (a.paneId !== undefined) {
      args.paneId = a.paneId;
      args.pane_id = a.paneId;
    }

    const nama = PETA[aksi];
    const tool = TOOL_WEB.find((t) => t.spec.name === nama);
    if (!tool) {
      /* The registry and this map disagree - say so instead of pretending. */
      throw new Error(`ERROR: aksi "${aksi}" butuh tool "${nama}" yang tidak ada di build ini.`);
    }
    return tool.run(args);
  },
};
