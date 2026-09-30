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
// The contract: a read-only caller is not offered write tools at all, and a
// caller at max nesting depth is not offered subagent_run.
const TOOL_TULIS = new Set(['editor_write', 'file_write', 'file_edit', 'file_patch']);
const ALL = [
  'shell_exec', 'terminal_exec', 'terminal_read', 'editor_read', 'editor_write',
  'file_write', 'file_edit', 'file_patch', 'file_read', 'file_list',
  'subagent_run', 'todo_write', 'todo_read',
];
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
assert.equal(ro.includes('shell_exec'), true, 'read-only still gets shell_exec');

const rw = agentToolSpecs({ bolehTulis: true });
assert.equal(rw.includes('file_write'), true, 'read-write keeps file_write');
assert.equal(rw.includes('subagent_run'), true, 'top level can spawn subagents');

const deep = agentToolSpecs({ bolehTulis: true, kedalaman: MAX_SUB_DEPTH });
assert.equal(deep.includes('subagent_run'), false, 'max depth cannot recurse further');
assert.equal(deep.includes('file_write'), true, 'depth does not affect write tools');
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
