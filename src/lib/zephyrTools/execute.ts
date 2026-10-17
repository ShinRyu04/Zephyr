/**
 * `execute` — Code Mode: one script that calls several tools.
 *
 * ## Why this exists
 *
 * A real task is a sequence: read four files, decide, patch three of them, run
 * the tests, read the failure, patch again. Done one tool per step, that is
 * eight round trips through the model, and the model pays a full context rebuild
 * for each. Code Mode lets it write the SEQUENCE once and run it, which is what
 * makes a long job finish inside the step budget instead of dying at step 200.
 *
 * ## The security question, answered first
 *
 * A script that can call tools must not be able to call tools the reader turned
 * OFF. So this does not implement its own dispatch: every call goes through
 * `jalankanAgentTool`, which is the same function the model's own tool calls go
 * through. The gate (`useToolGate`), the path guards (`agentGuard`) and the
 * approval flow are therefore all still in force - there is no second path to
 * forget them on.
 *
 * `execute` itself is a `read`-effect tool: it cannot write anything by itself.
 * What it can do is limited to what the gate already allows the model to do one
 * call at a time. That is the whole argument, and it is why the harness checks
 * the CALL SITE rather than trusting the prose here.
 *
 * ## What it deliberately is NOT
 *
 * Not `eval` with ambient access. The script sees exactly three bindings:
 *
 *   - `call(nama, args)` - run one tool, returns its string result;
 *   - `tools` - the names currently callable, so a script can branch;
 *   - `log(...)` - collect notes for the reply.
 *
 * No `window`, no `document`, no `fetch`, no `import`, no `require`. The script
 * is compiled with `new Function` and its body is scanned first; anything that
 * reaches for a global is refused before it runs. A sandbox that only *promises*
 * isolation is worse than none, so the refusal is checked by the harness with
 * real attempts (`window`, `fetch`, `import('...')`).
 */
import type { AgentTool } from '../agentTools';

/** Bindings a script may use. Anything else is refused before execution. */
const DILARANG = [
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'frames',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'require',
  'process',
  'importScripts',
  'eval',
  'Function',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'location',
];

/**
 * Names that must not appear in a script.
 *
 * A plain substring scan, not a parser: a parser would be more precise and also
 * more code to get wrong, and the cost of a false positive here is a refused
 * script the model can rewrite, while the cost of a false negative is a sandbox
 * escape. Bias chosen deliberately, and stated so it is not mistaken for
 * thoroughness.
 */
function periksaSkrip(skrip: string): string | null {
  for (const nama of DILARANG) {
    /* Word boundary on both sides: `windowWidth` is a variable, `window` is not. */
    if (new RegExp(`(^|[^\\w$.])${nama}([^\\w$]|$)`).test(skrip)) {
      return nama;
    }
  }
  if (/\bimport\s*\(/.test(skrip)) return 'import()';
  return null;
}

export interface ExecuteBridge {
  /** Run one tool by name, exactly as the model's own call would. */
  panggil: (nama: string, args: Record<string, unknown>) => Promise<string>;
  /** Tool names that are callable right now. */
  tersedia: () => string[];
}

export const executeTool = (bridge: ExecuteBridge): AgentTool => ({
  spec: {
    name: 'execute',
    description:
      'Jalankan SKRIP yang memanggil beberapa tool sekaligus - satu panggilan menggantikan banyak langkah. ' +
      'Skrip adalah badan fungsi async; yang tersedia hanya: call(nama, args) untuk memanggil satu tool dan mendapat hasil string-nya, tools (array nama tool yang boleh dipanggil sekarang), dan log(...) untuk mencatat. ' +
      'TIDAK ada window, document, fetch, import, require, atau process - skrip yang menyentuhnya DITOLAK sebelum dijalankan. ' +
      'Semua panggilan lewat gate yang sama dengan panggilan tool biasa: tool yang dimatikan pembaca tetap ditolak. ' +
      'Contoh: const a = await call("read_file", {path:"src/a.ts"}); const b = await call("grep", {pattern:"TODO",path:"src"}); log(a.length + b.length); return b; ' +
      'Pakai untuk urutan panjang (baca banyak berkas, patch banyak berkas, lalu uji). Untuk satu langkah, panggil tool-nya langsung - skrip hanya menambah lapisan.',
    parameters: {
      type: 'object',
      properties: {
        skrip: {
          type: 'string',
          description:
            'Badan fungsi async. `return` menentukan hasil yang dilihat model. Gunakan await call(...) untuk tiap tool.',
        },
      },
      required: ['skrip'],
    },
  },
  run: async (a) => {
    const skrip = String(a.skrip ?? '');
    if (!skrip.trim()) throw new Error('ERROR: execute butuh "skrip".');

    const kena = periksaSkrip(skrip);
    if (kena) {
      throw new Error(
        `ERROR: skrip menyentuh "${kena}", yang tidak tersedia di Code Mode. ` +
          'Yang boleh dipakai hanya call(nama, args), tools, dan log(...). ' +
          'Tulis ulang tanpa binding itu.',
      );
    }

    const catatan: string[] = [];
    const dipanggil: { nama: string; panjang: number }[] = [];

    /*
     * The bindings handed to the script. `call` is the ONLY way out, and it is
     * the same entry point a normal tool call uses - see the module comment.
     */
    const call = async (nama: string, args: Record<string, unknown> = {}): Promise<string> => {
      const n = String(nama ?? '').trim();
      if (!n) throw new Error('call(nama, args): nama tool kosong');
      const hasil = await bridge.panggil(n, args);
      dipanggil.push({ nama: n, panjang: hasil.length });
      return hasil;
    };

    const log = (...bagian: unknown[]) => {
      catatan.push(bagian.map((b) => (typeof b === 'string' ? b : JSON.stringify(b))).join(' '));
    };

    /*
     * Compiled with `new Function`, not `eval`: the script gets its own scope and
     * cannot see this module's variables. `'use strict'` so an accidental global
     * assignment throws instead of leaking onto the sandbox object.
     */
    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
      fn = new Function(
        'call',
        'tools',
        'log',
        `'use strict';\nreturn (async () => {\n${skrip}\n})();`,
      ) as (...args: unknown[]) => Promise<unknown>;
    } catch (e) {
      throw new Error(`ERROR: skrip tidak bisa dikompilasi: ${(e as Error).message}`);
    }

    let hasil: unknown;
    try {
      hasil = await fn(call, bridge.tersedia(), log);
    } catch (e) {
      /*
       * A script that throws is reported WITH how far it got. "it failed" alone
       * leaves the model unable to tell a bad argument from a refused tool.
       */
      const jejak = dipanggil.map((d) => `${d.nama}(${d.panjang})`).join(' -> ') || '(belum ada panggilan)';
      throw new Error(
        `ERROR: skrip berhenti: ${(e as Error).message}\nSudah dipanggil: ${jejak}` +
          (catatan.length ? `\nCatatan: ${catatan.join(' | ')}` : ''),
      );
    }

    const teks = typeof hasil === 'string' ? hasil : hasil === undefined ? '' : JSON.stringify(hasil);
    const ringkas = dipanggil.length
      ? `\n${dipanggil.length} panggilan: ${dipanggil.map((d) => `${d.nama}(${d.panjang} char)`).join(', ')}`
      : '\n(tidak ada tool yang dipanggil)';
    return `${teks}${ringkas}${catatan.length ? `\nCatatan: ${catatan.join(' | ')}` : ''}`;
  },
});
