// Static release regression checks. These deliberately inspect source rather than
// importing the application, so they run in a clean checkout without a build.
// Usage: node scripts/test-release-static.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

// Remove comments without treating comment markers inside quoted strings as
// comments. This keeps the catalogue parser insensitive to explanatory code
// comments and to URLs/text containing // or /* */.
function withoutComments(source) {
  let out = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
    } else if (ch === '/' && next === '/') {
      out += '  ';
      i += 1;
      while (i + 1 < source.length && source[i + 1] !== '\n') i += 1;
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < source.length) {
        out += '  ';
        i += 1;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function versionFromJson(file) {
  const value = JSON.parse(read(file));
  return value.version;
}

console.log('release static checks');
const toolsRaw = read('src/lib/agentTools.ts');
const tools = withoutComments(toolsRaw);
const catalogueStart = tools.indexOf('export const AGENT_TOOLS');
const tulisStart = tools.indexOf('export const TOOL_TULIS');
assert.ok(catalogueStart >= 0 && tulisStart > catalogueStart, 'AGENT_TOOLS and TOOL_TULIS declarations must exist');
const catalogue = tools.slice(catalogueStart, tulisStart);
const agentNames = [...catalogue.matchAll(/\bname\s*:\s*(['"])([a-z_]+)\1/g)].map((m) => m[2]);
assert.ok(agentNames.length > 0, 'AGENT_TOOLS catalogue was not parsed');
assert.equal(new Set(agentNames).size, agentNames.length, 'AGENT_TOOLS names must be unique');

const tulisMatch = tools.slice(tulisStart).match(/new Set\(\s*\[([\s\S]*?)\]\s*\)/);
assert.ok(tulisMatch, 'TOOL_TULIS set contents were not parsed');
const tulisNames = [...tulisMatch[1].matchAll(/(['"])([a-z_]+)\1/g)].map((m) => m[2]);
const TOOL_TULIS = new Set(tulisNames);
assert.ok(TOOL_TULIS.size > 0, 'TOOL_TULIS catalogue was not parsed');
assert.deepEqual(
  [...TOOL_TULIS].filter((name) => !agentNames.includes(name)),
  [],
  'TOOL_TULIS must remain a subset of AGENT_TOOLS',
);

const gate = withoutComments(read('src/lib/toolGate.ts'));
assert.match(gate, /const\s+AGENT_TOOL_NAMES\s*=\s*AGENT_TOOLS\.map\s*\(\s*\(?\s*tool\s*\)?\s*=>\s*tool\.spec\.name/);
assert.match(gate, /export const SEMUA_TOOL\s*:\s*string\[\]\s*=\s*\[\.\.\.AGENT_TOOL_NAMES\]/);
for (const name of agentNames) {
  assert.match(gate, /AGENT_TOOL_NAMES|SEMUA_TOOL/, `AGENT_TOOLS name ${name} is not sourced by toolGate`);
}
console.log(`  tools: ${agentNames.length} catalogue, ${TOOL_TULIS.size} write tools`);

assert.ok(agentNames.includes('task_complete'), 'task_complete must be advertised');
assert.equal(TOOL_TULIS.has('task_complete'), false, 'task_complete must not be a write tool');
assert.ok(agentNames.includes('browser_download_url'), 'browser_download_url must be advertised');
for (const falseTool of ['browser_screenshot', 'browser_upload']) {
  assert.equal(agentNames.includes(falseTool), false, `${falseTool} must not be advertised without an implementation`);
}

const ai = withoutComments(read('src/lib/aiStore.ts'));
assert.match(ai, /const\s+firstBrowser\s*=\s*res\.toolCalls\.findIndex\(browserOpen\)/, 'navigation calls must identify one first browser call');
assert.match(ai, /callsToDispatch\s*=\s*\[res\.toolCalls\[firstBrowser\]\]/, 'navigation-only dispatch must be limited to one browser call');
assert.match(ai, /if\s*\(taskComplete\s*\|\|\s*navigationOpened\)\s*break/, 'navigation-only work must stop after success');
assert.match(ai, /activeAgentAttempt|retiredAgentAttempts/, 'AI attempt identity guard symbols are missing');
assert.match(ai, /attemptId\s*=\s*nextId\(\s*[`'\"]attempt-/, 'AI request attempt ids are missing');
assert.match(ai, /agentWatchdogDisarm\(\)[\s\S]*?agentStepResolve\s*=\s*null/, 'AI request cleanup path is missing');
assert.match(ai, /if\s*\(attempt\s*&&\s*c\.id\s*!==\s*attempt\)\s*return/, 'stale AI attempt guard is missing');
console.log('  navigation and AI lifecycle guards: ok');

const expected = '1.1.13';
const versions = {
  'package.json': versionFromJson('package.json'),
  'package-lock.json': versionFromJson('package-lock.json'),
  'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  'src-tauri/tauri.conf.json': versionFromJson('src-tauri/tauri.conf.json'),
};
for (const [file, version] of Object.entries(versions)) assert.equal(version, expected, `${file} must be version ${expected}`);
console.log('  version sources: 1.1.13');

const latestVersion = versionFromJson('latest.json');
if (latestVersion !== expected) {
  console.warn(`  STALE latest.json: ${latestVersion} (release sources are ${expected})`);
} else {
  console.log('  latest.json: current');
}

console.log('all release static checks passed');
