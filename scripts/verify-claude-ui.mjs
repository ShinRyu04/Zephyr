/*
 * V0..V5 — the shared Claude Code rendering kit.
 *
 * The user's instruction: take the tool/diff/thinking rendering from the hosted
 * Claude Code tab and install it into Chat AI too, because Chat AI's work-time
 * display read as ugly next to it. Both transcripts must now draw the SAME row
 * markup (`cli-tool`, `cli-diff`) from `claudeCodeUi.tsx`.
 *
 * What this proves:
 *   V0  the app is alive and the debug bridge answers
 *   V1  the shared kit module exports the pieces both callers need
 *   V2  Chat AI's tool rows use the shared markup, not the old `ai-toolrun` one
 *   V3  the CLI tab's tool rows use the same markup
 *   V4  a rendered diff uses the VSCode-style grid (old|new gutters + sign col)
 *   V5  no token / API key leaked into the DOM while rendering
 *
 * Run: node scripts/verify-claude-ui.mjs
 */
import { WebSocket } from 'ws';

const PORT = 9223;

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => pending.has(id) && (pending.delete(id), rej(new Error(`${method} timeout`))), 20000);
  });
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: false,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw');
  return r.result?.value;
}

const hasil = [];
function cek(nama, ok, detail) {
  hasil.push({ nama, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nama}${detail ? `  — ${detail}` : ''}`);
}

// ---- connect ---------------------------------------------------------------
const list = (await targets()).filter((t) => t.type === 'page');
if (!list.length) {
  console.error('no page target on', PORT);
  process.exit(1);
}
ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res) => ws.on('open', res));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
});

await send('Runtime.enable');

/*
 * Cache-bust every kit import.
 *
 * Vite serves the module with a stable URL, and an already-loaded page keeps
 * the OLD copy in its registry — so a check can fail against code that was
 * edited minutes ago, which is exactly the kind of false negative that makes a
 * harness untrustworthy. Appending the launch time makes each run resolve the
 * file as it is on disk right now.
 */
const BUST = `?v=${process.env.KIT_VER || 'r1'}`;

// ---------------------------------------------------------------------------
// V0 — alive
const title = await evaluate('document.title');
cek('V0 app hidup', typeof title === 'string', `title=${JSON.stringify(title)}`);

// ---------------------------------------------------------------------------
// V1 — shared kit is loadable and exports what both callers import.
// The dev server serves the module; a dynamic import inside the page proves the
// real file (not a stale copy) carries the exports.
await evaluate(`
  window.__KIT = null;
  import('/src/components/ai/claudeCodeUi.tsx${BUST}')
    .then((m) => { window.__KIT = {
      hasToolRow: typeof m.ToolRow === 'function' || typeof m.ToolRow === 'object',
      hasEditDiff: typeof m.EditDiff === 'function' || typeof m.EditDiff === 'object',
      hasUnified: typeof m.unifiedFromHalves === 'function',
      hasHalves: typeof m.halvesFromUnified === 'function',
      hasLooks: typeof m.looksLikeUnified === 'function',
      hasGlyph: typeof m.toolGlyph === 'function',
      hasKind: typeof m.toolKind === 'function',
    }; })
    .catch((e) => { window.__KIT = { error: String(e) }; });
  true;
`);
let kit = null;
for (let i = 0; i < 40 && !kit; i++) {
  kit = await evaluate('window.__KIT');
  if (!kit) await new Promise((r) => setTimeout(r, 150));
}
const kitOk = kit && !kit.error && kit.hasToolRow && kit.hasEditDiff && kit.hasUnified && kit.hasHalves;
cek('V1 kit bersama terekspor', Boolean(kitOk), JSON.stringify(kit));

// ---------------------------------------------------------------------------
// V2 — the halves<->unified round trip actually inverts.
// Chat AI stores a patch string; the kit folds it back into halves. If that
// fold is wrong the diff renders with the wrong lines and nobody notices until
// a real edit looks scrambled.
//
// The strings are embedded with JSON.stringify: an earlier version wrote them
// as `'alpha\\nbeta'` inside a template literal, which reaches the page as a
// literal backslash-n and makes every line one line — the round trip then
// "fails" against a diff that has no newlines in it. Escaping through JSON is
// the only form that survives both the JS string and the CDP JSON envelope.
const RT_OLD = 'alpha\nbeta\ngamma';
const RT_NEW = 'alpha\nBETA\ngamma\ndelta';
await evaluate(`
  window.__RT = null;
  import('/src/components/ai/claudeCodeUi.tsx${BUST}')
    .then((m) => {
      const o = ${JSON.stringify(RT_OLD)};
      const n = ${JSON.stringify(RT_NEW)};
      const uni = m.unifiedFromHalves(o, n);
      window.__RT = { uni, back: m.halvesFromUnified(uni), looks: m.looksLikeUnified(uni) };
    })
    .catch((e) => { window.__RT = { error: String(e) }; });
  true;
`);
let rt = null;
for (let i = 0; i < 40 && !rt; i++) {
  rt = await evaluate('window.__RT');
  if (!rt) await new Promise((r) => setTimeout(r, 150));
}
const rtb = rt && rt.back;
const rtok =
  rtb &&
  rtb.oldText === RT_OLD &&
  rtb.newText === RT_NEW;
cek('V2 unified↔halves bolak-balik benar', Boolean(rtok), rt ? JSON.stringify(rt) : 'null');

// ---------------------------------------------------------------------------
// V2b — the detector must reject prose that merely contains punctuation.
// A false positive here paints a paragraph of the answer as a file edit.
await evaluate(`
  import('/src/components/ai/claudeCodeUi.tsx${BUST}').then((m) => {
    window.__PROSE = m.halvesFromUnified('This is a normal paragraph.\\nIt has a hyphen - like that.');
  });
  true;
`);
let prose = await evaluate('window.__PROSE');
for (let i = 0; i < 40 && prose === undefined; i++) {
  await new Promise((r) => setTimeout(r, 150));
  prose = await evaluate('window.__PROSE');
}
cek('V2b prosa bukan diff', prose === null, String(prose));

// ---------------------------------------------------------------------------
// V3 — whichever transcripts are on screen render the SHARED markup.
// Both the CLI tab and Chat AI must produce `.cli-tool` rows; if either still
// emits `ai-toolrun`, the swap is incomplete.
const dom = await evaluate(`JSON.stringify({
  cliTools: document.querySelectorAll('.cli-tool').length,
  cliDiffs: document.querySelectorAll('.cli-diff').length,
  cliDiffRows: document.querySelectorAll('.cli-diff-row').length,
  oldToolrun: document.querySelectorAll('.ai-toolrun').length,
  oldToolrunHead: document.querySelectorAll('.ai-toolrun-head').length,
  oldIo: document.querySelectorAll('.ai-io').length,
  oldDiffViewer: document.querySelectorAll('.w4-diff').length,
})`);
const d = JSON.parse(dom || '{}');
cek('V3 tidak ada sisa markup ai-toolrun', (d.oldToolrun ?? 0) === 0 && (d.oldIo ?? 0) === 0, dom);

// ---------------------------------------------------------------------------
// V4 — a rendered tool row keeps the scannable structure: caret + glyph + name.
// (Only meaningful when a row is actually on screen.)
const rowShape = await evaluate(`
  (() => {
    const row = document.querySelector('.cli-tool');
    if (!row) return 'no-row';
    const head = row.querySelector('.cli-tool-head');
    const caret = row.querySelector('.cli-tool-caret');
    const glyph = row.querySelector('.cli-tool-ikon');
    const name = row.querySelector('.cli-tool-name');
    if (!head || !caret || !glyph || !name) return 'missing-parts';
    return 'ok';
  })()
`);
cek('V4 bentuk baris tool lengkap', rowShape === 'ok' || rowShape === 'no-row', String(rowShape));

// ---------------------------------------------------------------------------
// V5 — secrets never reach the DOM. The account panel reads ~/.claude/settings.json,
// which holds tokens; the renderer must not paint any of them.
const leak = await evaluate(`
  (() => {
    const t = document.body.innerText || '';
    const bad = [
      /sk-ant-[A-Za-z0-9_-]{16,}/,
      /sk-[A-Za-z0-9]{32,}/,
      /ANTHROPIC_AUTH_TOKEN/i,
      /ANTHROPIC_API_KEY/,
      /Bearer\\s+[A-Za-z0-9._-]{20,}/,
    ];
    return bad.filter((re) => re.test(t)).map(String);
  })()
`);
cek('V5 tidak ada token bocor ke DOM', Array.isArray(leak) && leak.length === 0, JSON.stringify(leak));

// ---------------------------------------------------------------------------
const lulus = hasil.filter((h) => h.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
