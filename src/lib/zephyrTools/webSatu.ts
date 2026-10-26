/**
 * `web` — search and fetch, one tool.
 *
 * `web_search` and `web_fetch` were two entries. They are the two halves of one
 * job - find a page, then read it - and they share the same permission gate
 * (`izinIsiWeb`). OpenCode splits them, and so did Zephyr; the reason to merge is
 * the same as for `browser`: two names for one surface means two rows to choose
 * between and two near-misses in `tool_search`.
 *
 * Dispatching to the existing tools rather than reimplementing them - the same
 * reason as `browser.ts`: their bodies hold the gate checks, and lifting those
 * out by text is how they would drift.
 */
import type { AgentTool } from '../agentTools';
import { TOOL_WEB } from './web';

const AKSI = ['search', 'fetch'] as const;
export type WebAksi = (typeof AKSI)[number];

const PETA: Record<WebAksi, string> = {
  search: 'web_search',
  fetch: 'web_fetch',
};

/** The two tools this replaces. */
export const TOOL_WEB_LAMA: readonly string[] = Object.values(PETA);

export const TOOL_WEB_SATU: AgentTool = {
  spec: {
    name: 'web',
    description:
      'Ambil informasi dari internet. ' +
      'aksi: search (cari lewat mesin bawaan Zephyr, hasilnya tautan + judul - bukan kutipan; lanjutkan dengan fetch), fetch (ambil isi satu URL sebagai teks). ' +
      'query wajib untuk search; url wajib untuk fetch. ' +
      'Dua-duanya melewati pagar yang SAMA: izin isi web (nyala secara bawaan) dan allowlistWeb (kosong = semua host boleh). Hasil "host-luar-allowlist:<host>" BUKAN error yang bisa diulang - jangan coba ulang, sebutkan hostnya ke user. ' +
      'Untuk membuka halaman di pane yang terlihat, pakai tool browser (aksi open).',
    parameters: {
      type: 'object',
      properties: {
        aksi: { type: 'string', enum: [...AKSI], description: 'Cari atau ambil.' },
        query: { type: 'string', description: 'Untuk search: kata kunci.' },
        url: { type: 'string', description: 'Untuk fetch: URL yang diambil.' },
        maxChars: { type: ['number', 'string'], description: 'Untuk fetch: batas panjang teks.' },
      },
      required: ['aksi'],
    },
  },
  run: async (a) => {
    const aksi = String(a.aksi ?? '').trim() as WebAksi;
    if (!AKSI.includes(aksi)) {
      throw new Error(`ERROR: aksi "${a.aksi}" tidak dikenal. Pilihan: ${AKSI.join(', ')}.`);
    }
    const args: Record<string, unknown> = {};
    if (a.query !== undefined) args.query = a.query;
    if (a.url !== undefined) args.url = a.url;
    if (a.maxChars !== undefined) args.maxChars = a.maxChars;

    const nama = PETA[aksi];
    const tool = TOOL_WEB.find((t) => t.spec.name === nama);
    if (!tool) throw new Error(`ERROR: aksi "${aksi}" butuh tool "${nama}" yang tidak ada di build ini.`);
    return tool.run(args);
  },
};
