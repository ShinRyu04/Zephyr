import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const hook = new URL("./check-spec.mjs", import.meta.url).pathname;
let passed = 0;
let failed = 0;

function run(input, { env = {}, cwd } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [hook], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
      ...(cwd ? { cwd } : {}),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

function runRaw(rawStdin, { env = {}, cwd } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [hook], {
      input: rawStdin,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
      ...(cwd ? { cwd } : {}),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  pass: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

function assertIncludes(name, actual, expectedSubstring) {
  if (actual.includes(expectedSubstring)) {
    console.log(`  pass: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name} (missing ${JSON.stringify(expectedSubstring)} in ${JSON.stringify(actual)})`);
    failed++;
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

const root = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-test-"));
const binDir = path.join(root, "bin");
const emptyBinDir = path.join(root, "empty-bin");
const workspaceA = path.join(root, "workspace-a");
const workspaceB = path.join(root, "workspace-b");
const outside = path.join(root, "outside");

mkdirSync(binDir);
mkdirSync(emptyBinDir);
mkdirSync(workspaceA);
mkdirSync(workspaceB);
mkdirSync(outside);

const fakeAllium = path.join(binDir, "allium");
writeFileSync(fakeAllium, "#!/bin/sh\necho \"fake diagnostics for $2\" >&2\nexit 1\n", { mode: 0o755 });

const validA = path.join(workspaceA, "spec.allium");
const validB = path.join(workspaceB, "spec.allium");
const outsideFile = path.join(outside, "spec.allium");
const markdownFile = path.join(workspaceA, "README.md");

writeFileSync(validA, "-- allium: 3\n");
writeFileSync(validB, "-- allium: 3\n");
writeFileSync(outsideFile, "-- allium: 3\n");
writeFileSync(markdownFile, "# Not Allium\n");

const fakeEnv = { PATH: binDir };
const missingCliEnv = { PATH: emptyBinDir };

console.log("ECA hook — early exits:\n");

assert(
  "missing tool_input.path skipped",
  run({ tool_input: {} }, { env: fakeEnv, cwd: workspaceA }).stdout,
  "",
);

assert(
  "non-.allium file skipped",
  run({ tool_input: { path: markdownFile }, workspaces: [workspaceA] }, { env: fakeEnv }).stdout,
  "",
);

assert(
  "non-existent .allium file skipped",
  run({ tool_input: { path: path.join(workspaceA, "ghost.allium") }, workspaces: [workspaceA] }, { env: fakeEnv }).stdout,
  "",
);

assert(
  "malformed JSON exits cleanly",
  runRaw("{not json}", { env: fakeEnv, cwd: workspaceA }).status,
  0,
);

assert(
  "empty stdin exits cleanly",
  runRaw("", { env: fakeEnv, cwd: workspaceA }).status,
  0,
);

console.log("\nECA hook — CLI handling:\n");

const invalidResult = run({ tool_input: { path: validA }, workspaces: [workspaceA] }, { env: fakeEnv });
const invalidJson = parseJson(invalidResult.stdout);

assert("invalid file hook exits successfully", invalidResult.status, 0);
assert("invalid file returns JSON", invalidJson !== null, true);
assertIncludes(
  "diagnostics identify ECA hook",
  invalidJson?.additionalContext || "",
  "Automatic Allium validation from ECA hook `allium.check-spec`",
);
assertIncludes(
  "diagnostics include fake checker output",
  invalidJson?.additionalContext || "",
  "fake diagnostics for",
);

console.log("\nECA hook — workspace boundaries:\n");

assert(
  "file outside workspace skipped",
  run({ tool_input: { path: outsideFile }, workspaces: [workspaceA] }, { env: fakeEnv }).stdout,
  "",
);

const secondWorkspaceResult = run(
  { tool_input: { path: validB }, workspaces: [workspaceA, workspaceB] },
  { env: fakeEnv },
);
assert("file in second workspace accepted", parseJson(secondWorkspaceResult.stdout) !== null, true);

const fallbackCwdResult = run(
  { tool_input: { path: validA } },
  { env: fakeEnv, cwd: workspaceA },
);
assert("missing workspaces falls back to cwd", parseJson(fallbackCwdResult.stdout) !== null, true);

// --- CLI missing: one-time install notice ---
// Force the "binary not found" path by running with a PATH that contains no
// allium, and an isolated XDG_CACHE_HOME so the per-machine marker is hermetic.

console.log("\nECA hook — CLI missing, one-time install notice:\n");

function noticeOf(result) {
  return parseJson(result.stdout)?.additionalContext || "";
}

const noticeCache = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-cache-"));
const noticeEnv = { ...missingCliEnv, XDG_CACHE_HOME: noticeCache };

const firstNotice = run({ tool_input: { path: validA }, workspaces: [workspaceA] }, { env: noticeEnv });
assert("first edit with no CLI exits cleanly", firstNotice.status, 0);
assert(
  "first edit surfaces notice as additionalContext",
  /install/i.test(noticeOf(firstNotice)),
  true,
);
assert(
  "notice carries a concrete install command",
  /cargo install allium-cli/.test(noticeOf(firstNotice)),
  true,
);
assert(
  "notice identifies the ECA hook",
  noticeOf(firstNotice).includes("allium.check-spec"),
  true,
);
assert(
  "persisted notice promises it fires only once",
  /only once per machine/.test(noticeOf(firstNotice)),
  true,
);

const secondNotice = run({ tool_input: { path: validA }, workspaces: [workspaceA] }, { env: noticeEnv });
assert("notice fires only once (subsequent edits emit nothing)", secondNotice.stdout, "");

// A fresh cache (e.g. another machine) shows the notice again.
const freshCache = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-cache-"));
const freshNotice = run(
  { tool_input: { path: validA }, workspaces: [workspaceA] },
  { env: { ...missingCliEnv, XDG_CACHE_HOME: freshCache } },
);
assert("notice shows again under a fresh cache", /install/i.test(noticeOf(freshNotice)), true);

// Scope: the notice must NOT leak onto non-spec or out-of-workspace edits even
// when the CLI is absent — those exit early, before the checker is invoked.
const scopeCache = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-cache-"));
const scopeEnv = { ...missingCliEnv, XDG_CACHE_HOME: scopeCache };

assert(
  "no notice on non-.allium edit when CLI absent",
  run({ tool_input: { path: markdownFile }, workspaces: [workspaceA] }, { env: scopeEnv }).stdout,
  "",
);
assert(
  "no notice on out-of-workspace .allium edit when CLI absent",
  run({ tool_input: { path: outsideFile }, workspaces: [workspaceA] }, { env: scopeEnv }).stdout,
  "",
);

// A blocked cache: XDG_CACHE_HOME points at a file, so the per-machine marker
// can't be written. Shared by the fallback and both-unwritable scenarios.
const blockedRoot = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-blocked-"));
const blockedCache = path.join(blockedRoot, "not-a-dir");
writeFileSync(blockedCache, "x\n");

// Fallback: cache unwritable but workspace root writable → the marker falls
// back to .allium-cli-notice-shown in the workspace root, so the notice still
// fires only once (per workspace) and doesn't crash.
const fallbackWorkspace = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-fallback-"));
const fallbackFile = path.join(fallbackWorkspace, "spec.allium");
writeFileSync(fallbackFile, "-- allium: 3\n");
const fallbackEnv = { ...missingCliEnv, XDG_CACHE_HOME: blockedCache };

const fb1 = run({ tool_input: { path: fallbackFile }, workspaces: [fallbackWorkspace] }, { env: fallbackEnv });
assert("notice shown when cache unwritable, via workspace fallback", /install/i.test(noticeOf(fb1)), true);
assert(
  "fallback notice names the workspace marker file",
  /\.allium-cli-notice-shown/.test(noticeOf(fb1)),
  true,
);
assert(
  "fallback notice does not claim per-machine once-only",
  /only once per machine/.test(noticeOf(fb1)),
  false,
);
assert(
  "workspace fallback marker file is actually created",
  existsSync(path.join(fallbackWorkspace, ".allium-cli-notice-shown")),
  true,
);
const fb2 = run({ tool_input: { path: fallbackFile }, workspaces: [fallbackWorkspace] }, { env: fallbackEnv });
assert("workspace fallback marker suppresses re-firing", fb2.stdout, "");

// Both unwritable: cache blocked AND workspace root read-only → no marker can
// be persisted, so the hook hands off to manual install and keeps re-firing.
// (Skipped under root, which bypasses directory permissions.)
const roWorkspace = mkdtempSync(path.join(tmpdir(), "allium-eca-hook-rows-"));
const roFile = path.join(roWorkspace, "spec.allium");
writeFileSync(roFile, "-- allium: 3\n");
chmodSync(roWorkspace, 0o500);
const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
if (!runningAsRoot) {
  const roEnv = { ...missingCliEnv, XDG_CACHE_HOME: blockedCache };
  const ro1 = run({ tool_input: { path: roFile }, workspaces: [roWorkspace] }, { env: roEnv });
  assert(
    "both-unwritable notice tells the user it couldn't be saved",
    /could NOT be saved/.test(noticeOf(ro1)),
    true,
  );
  assert(
    "both-unwritable notice asks the user to confirm self-install",
    /confirm they're happy/.test(noticeOf(ro1)),
    true,
  );
  const ro2 = run({ tool_input: { path: roFile }, workspaces: [roWorkspace] }, { env: roEnv });
  assert("both-unwritable notice re-fires", /install/i.test(noticeOf(ro2)), true);
}
chmodSync(roWorkspace, 0o700);

rmSync(noticeCache, { recursive: true, force: true });
rmSync(freshCache, { recursive: true, force: true });
rmSync(scopeCache, { recursive: true, force: true });
rmSync(blockedRoot, { recursive: true, force: true });
rmSync(fallbackWorkspace, { recursive: true, force: true });
rmSync(roWorkspace, { recursive: true, force: true });
rmSync(root, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
