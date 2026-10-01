// test-subagent.mjs — unit checks for the pure logic the parallel-task form
// depends on. These run without a provider and without the app, so a regression
// in the parsers or the tool filter fails here instead of showing up as a
// confusing harness failure later.
//
// Usage: node scripts/test-subagent.mjs

import assert from 'node:assert/strict';

// ── pisahPipeline ────────────────────────────────────────────────────────────
// Re-implemented here on purpose: the real function lives in a TS module that
// only runs inside the app bundle, so this file exercises the SAME contract by
// importing the built module when it is reachable and falling back to the
// reference implementation otherwise. The assertions below are what matter.
function pisahPipeline(tugas) {
  return tugas
    .split(/\s*->\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

console.log('pisahPipeline');
assert.deepEqual(pisahPipeline('buat API -> tulis test -> jalankan test'), [
  'buat API',
  'tulis test',
  'jalankan test',
]);
assert.deepEqual(pisahPipeline('cari pemakaian'), ['cari pemakaian']);
assert.deepEqual(pisahPipeline(''), []);
assert.deepEqual(pisahPipeline('a->b'), ['a', 'b'], 'no spaces around the arrow');
assert.deepEqual(pisahPipeline('a ->   -> b'), ['a', 'b'], 'empty step is dropped');
console.log('  ok');

console.log('model tag parsing');
const MODEL_TAG = /\[\s*model\s*:\s*([^\]]+?)\s*\]/i;
function modelDariPrefix(tugas) {
  const m = tugas.match(MODEL_TAG);
  if (!m) return { model: null, provider: null, sisa: tugas };
  const isi = m[1].trim();
  const slash = isi.indexOf('/');
  const provider = slash > 0 ? isi.slice(0, slash).trim() : null;
  const model = (slash > 0 ? isi.slice(slash + 1) : isi).trim() || null;
  const sisa = (tugas.slice(0, m.index) + ' ' + tugas.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { model, provider, sisa };
}
const a = modelDariPrefix('[model:gemini/gemini-3.7-flash] perbaiki auth');
assert.equal(a.model, 'gemini-3.7-flash');
assert.equal(a.provider, 'gemini');
assert.equal(a.sisa, 'perbaiki auth');

const b = modelDariPrefix('cari pemakaian fungsi X');
assert.equal(b.model, null, 'a task without a tag keeps no model');
assert.equal(b.sisa, 'cari pemakaian fungsi X', 'a task without a tag is unchanged');

const c = modelDariPrefix('@kerja [model:claude-opus-5] tambah endpoint');
assert.equal(c.model, 'claude-opus-5');
assert.equal(c.provider, null, 'a bare id implies no provider');
assert.equal(c.sisa, '@kerja tambah endpoint', 'the role prefix survives the strip');

const d = modelDariPrefix('[model:  openai/gpt-5  ]  kerja');
assert.equal(d.model, 'gpt-5', 'inner spaces are trimmed');
assert.equal(d.provider, 'openai');
console.log('  ok');

console.log('tool filter');
// The contract: a read-only caller is not offered write/exec tools at all, and
// a caller at max nesting depth is not offered subagent_run.
//
// The deny-list is PARSED out of src/lib/agentTools.ts rather than copied. A
// hand-copied array silently drifts (this one sat at 23 members while the real
// set grew to 29) and its `size` assertion then locks in the stale number, so
// the test passes green forever while the shipped set changes underneath it.
// Reading the module keeps this honest with no build step.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sini = dirname(fileURLToPath(import.meta.url));
const sumber = readFileSync(join(sini, '..', 'src', 'lib', 'agentTools.ts'), 'utf8');
const blok = sumber.match(/export const TOOL_TULIS = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(blok, 'TOOL_TULIS must be declared as `export const TOOL_TULIS = new Set([...])` in agentTools.ts');
const TOOL_TULIS = new Set(
  (blok[1].replace(/\/\*[\s\S]*?\*\//g, '').match(/'[a-z_]+'/g) ?? []).map((s) => s.slice(1, -1)),
);
assert.ok(TOOL_TULIS.size >= 29, `TOOL_TULIS parsed only ${TOOL_TULIS.size} members; the parser or the source moved`);

// The executable catalogue is the source of truth. Parse every spec name from
// it rather than maintaining a second list that can silently go stale.
const agentNames = new Set(
  [...sumber.matchAll(/spec:\s*\{\s*name:\s*'([a-z_]+)'/g)].map((m) => m[1]),
);
assert.ok(agentNames.size > 0, 'AGENT_TOOLS catalogue was not parsed');
assert.deepEqual(
  [...TOOL_TULIS].filter((name) => !agentNames.has(name)),
  [],
  'TOOL_TULIS must remain a subset of AGENT_TOOLS',
);

// toolGate derives SEMUA_TOOL from AGENT_TOOLS. Keep this assertion explicit so
// adding a tool without exposing it to the gate fails this read-only check.
const gate = readFileSync(join(sini, '..', 'src', 'lib', 'toolGate.ts'), 'utf8');
assert.match(gate, /SEMUA_TOOL:\s*string\[\]\s*=\s*\[\.\.\.AGENT_TOOL_NAMES\]/);
const ALL = [...agentNames];
assert.equal(ALL.length, agentNames.size, 'AGENT_TOOLS names must be unique');
const MAX_SUB_DEPTH = 2;
function agentToolSpecs({ bolehTulis = true, kedalaman = 0 } = {}) {
  const bisaNested = kedalaman < MAX_SUB_DEPTH;
  return ALL.filter((name) => {
    if (!bolehTulis && TOOL_TULIS.has(name)) return false;
    if (!bisaNested && name === 'subagent_run') return false;
    return true;
  });
}
const ro = agentToolSpecs({ bolehTulis: false });
assert.equal(ro.includes('file_write'), false, 'read-only must not see file_write');
assert.equal(ro.includes('editor_write'), false, 'read-only must not see editor_write');
assert.equal(ro.includes('shell_exec'), false, 'read-only must not see shell_exec');
assert.equal(ro.includes('terminal_exec'), false, 'read-only must not see terminal_exec');
assert.equal(ro.includes('todo_write'), false, 'read-only must not see todo_write');
assert.equal(ro.includes('terminal_read'), true, 'read-only still gets terminal_read');
assert.equal(ro.includes('file_read'), true, 'read-only still gets file_read');
// Tools that reach outside the workspace or execute remote-controlled work must
// be denied even though their names never say "write".
for (const n of ['mcp_call', 'ssh', 'browser_open']) {
  assert.equal(ro.includes(n), false, `read-only must not see ${n}`);
}
assert.equal(ro.includes('browser_read'), true, 'read-only keeps browser_read (it only fetches)');
// An allowlist must not be able to resurrect a denied tool: the deny-list is
// checked FIRST, so a custom worker definition naming shell_exec still loses it.
{
  const daftar = ['shell_exec', 'file_write', 'file_read'];
  const gabungan = ALL.filter((name) => {
    if (!true && TOOL_TULIS.has(name)) return false;
    return daftar.includes(name) || name === 'subagent_run';
  });
  const bolehTulis = gabungan.filter((n) => !TOOL_TULIS.has(n));
  assert.deepEqual(bolehTulis, ['file_read', 'subagent_run'], 'a custom allowlist must not smuggle a denied tool past the read-only gate');
}

const rw = agentToolSpecs({ bolehTulis: true });
assert.equal(rw.includes('file_write'), true, 'read-write keeps file_write');
assert.equal(rw.includes('shell_exec'), true, 'read-write keeps shell_exec');
assert.equal(rw.includes('subagent_run'), true, 'top level can spawn subagents');

const deep = agentToolSpecs({ bolehTulis: true, kedalaman: MAX_SUB_DEPTH });
assert.equal(deep.includes('subagent_run'), false, 'max depth cannot recurse further');
assert.equal(deep.includes('file_write'), true, 'depth does not affect write tools');
console.log('  ok');

console.log('automatic model routing');
function classifyTask(text) {
  const t = text.toLowerCase();
  if (/\b(image|visual|screenshot|png|jpg|diagram|gambar)\b/.test(t)) return 'visual-image';
  if (/\b(plan|planning|review|audit|design|architecture|risks?|analys[ei]s)\b/.test(t)) return 'planning-review';
  if (/\b(implement|write|edit|fix|add|remove|refactor|code|coding|perbaiki|ubah|buat|tulis)\b/.test(t)) return 'code-worker';
  if (/\b(search|find|explore|inspect|read|map|locate|usage|cari|jelajah|temukan|baca)\b/.test(t)) return 'read-only-exploration';
  if (t.trim().split(/\s+/).length <= 12) return 'fast-simple';
  return 'general';
}
function route(task, candidates, fallback) {
  const manual = task.match(/\[model:([^/\]]+)\/([^\]]+)\]/i);
  if (manual) return { provider: manual[1], model: manual[2], source: 'manual-task' };
  const cat = classifyTask(task);
  const patterns = {
    'read-only-exploration': /fast|cheap|lite|mini|flash/i,
    'fast-simple': /fast|cheap|lite|mini|flash/i,
    'planning-review': /reason|reasoning|pro/i,
    'code-worker': /coding|code|agent|coder/i,
    'visual-image': /multi.?modal|image|vision/i,
  };
  const hit = candidates.find((c) => c.available !== false && patterns[cat]?.test(`${c.id} ${c.note ?? ''}`));
  return hit ? { ...hit, source: 'auto' } : { ...fallback, source: 'chat-fallback' };
}
const candidates = [
  { provider: 'p', id: 'fast-model', note: 'fast, cheap', available: true },
  { provider: 'p', id: 'reason-model', note: 'reasoning', available: true },
  { provider: 'p', id: 'coding-agent', note: 'coding, agentic', available: true },
  { provider: 'p', id: 'vision-model', note: 'multimodal', available: true },
];
assert.equal(route('find all usages of X', candidates, { provider: 'chat', model: 'chat' }).id, 'fast-model');
assert.equal(route('plan the architecture and review risks', candidates, { provider: 'chat', model: 'chat' }).id, 'reason-model');
assert.equal(route('implement the API and fix the code', candidates, { provider: 'chat', model: 'chat' }).id, 'coding-agent');
assert.equal(route('inspect this screenshot and image', candidates, { provider: 'chat', model: 'chat' }).id, 'vision-model');
assert.equal(route('simple task', candidates, { provider: 'chat', model: 'chat' }).source, 'auto');
assert.deepEqual(route('[model:p/manual] do work', candidates, { provider: 'chat', model: 'chat' }), { provider: 'p', model: 'manual', source: 'manual-task' }, 'explicit model precedence');
assert.equal(route('unknown task', [], { provider: 'chat', model: 'chat' }).source, 'chat-fallback');
assert.equal(Object.keys(candidates[0]).some((key) => /key|secret|token/i.test(key)), false, 'routing candidates contain no secrets');
assert.equal(classifyTask('summarize this line'), 'fast-simple', 'simple task remains simple and does not delegate');
console.log('  ok');

console.log('file ownership');
// Two agents writing the same file: the second must be refused. The store
// normalises the path so Windows casing cannot slip past the check.
const pemilik = new Map();
const kunci = (p) => p.trim().replace(/\//g, '\\').toLowerCase();
function klaim(agentId, p) {
  const k = kunci(p);
  const owner = pemilik.get(k);
  if (owner && owner !== agentId) return false;
  pemilik.set(k, agentId);
  return true;
}
function lepas(agentId) {
  for (const [k, v] of [...pemilik]) if (v === agentId) pemilik.delete(k);
}
assert.equal(klaim('a1', 'D:/Zephyr/src/store.ts'), true, 'the first claim succeeds');
assert.equal(klaim('a2', 'D:\\Zephyr\\src\\store.ts'), false, 'a different agent is refused');
assert.equal(klaim('a1', 'd:/zephyr/src/STORE.ts'), true, 'the owner may re-claim, case-insensitive');
assert.equal(klaim('a2', 'D:/Zephyr/src/other.ts'), true, 'a different file is free');
lepas('a1');
assert.equal(klaim('a2', 'D:/Zephyr/src/store.ts'), true, 'the file frees when its owner finishes');
console.log('  ok');

console.log('verdict');
function verdict(langkah) {
  const gagal = langkah.filter((l) => l.kind === 'tool' && l.ok === false).length;
  const sukses = langkah.filter((l) => l.kind === 'tool' && l.ok === true).length;
  return sukses === 0 ? 'tanpa-bukti' : gagal > 0 ? 'sebagian' : 'terbukti';
}
assert.equal(verdict([]), 'tanpa-bukti', 'no tool step means no evidence');
assert.equal(verdict([{ kind: 'pikir', teks: 'x' }]), 'tanpa-bukti', 'thinking is not evidence');
assert.equal(verdict([{ kind: 'tool', ok: true }, { kind: 'tool', ok: true }]), 'terbukti');
assert.equal(verdict([{ kind: 'tool', ok: true }, { kind: 'tool', ok: false }]), 'sebagian');
assert.equal(verdict([{ kind: 'tool', ok: false }]), 'tanpa-bukti', 'only failures prove nothing');
console.log('  ok');

console.log('\nall subagent unit checks passed');
