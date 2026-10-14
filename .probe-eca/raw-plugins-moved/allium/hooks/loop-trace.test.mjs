import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, symlinkSync, writeFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";

const hook = new URL("./loop-trace.mjs", import.meta.url).pathname;
let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  pass: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

// Run the hook once (one event) with a synthetic ECA payload.
function runHook(event, input) {
  try {
    execFileSync("node", [hook, event], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // the hook always exits 0; ignore
  }
}

function newProject({ withLoopDir }) {
  const dir = mkdtempSync(path.join(tmpdir(), "allium-timing-"));
  if (withLoopDir) mkdirSync(path.join(dir, ".allium-loop"));
  return dir;
}
function timings(dir) {
  const p = path.join(dir, ".allium-loop", "timings.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

console.log("\n── loop-trace hook ──\n");

// 1. pre + post with a correlation id → one timing line, right agent, numeric duration.
{
  const dir = newProject({ withLoopDir: true });
  const payload = { tool_call_id: "abc", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] };
  runHook("pre", payload);
  runHook("post", payload);
  const t = timings(dir);
  assert("records one timing for a paired pre/post", t.length === 1);
  assert("labels the timing with the agent name", t[0]?.agent === "weed");
  assert("duration is a non-negative number", typeof t[0]?.duration_ms === "number" && t[0].duration_ms >= 0);
  rmSync(dir, { recursive: true, force: true });
}

// 2. No .allium-loop dir → no-op, nothing written.
{
  const dir = newProject({ withLoopDir: false });
  const payload = { tool_call_id: "x", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] };
  runHook("pre", payload);
  runHook("post", payload);
  assert("does nothing when no loop is active", !existsSync(path.join(dir, ".allium-loop", "timings.jsonl")));
  rmSync(dir, { recursive: true, force: true });
}

// 3. FIFO fallback when there is no correlation id: two calls pair in order.
{
  const dir = newProject({ withLoopDir: true });
  runHook("pre", { tool_name: "eca__spawn_agent", tool_input: { agent: "distill" }, workspaces: [dir] });
  runHook("pre", { tool_name: "eca__spawn_agent", tool_input: { agent: "propagate" }, workspaces: [dir] });
  runHook("post", { tool_name: "eca__spawn_agent", tool_input: {}, workspaces: [dir] });
  runHook("post", { tool_name: "eca__spawn_agent", tool_input: {}, workspaces: [dir] });
  const t = timings(dir);
  assert("pairs two unkeyed calls in FIFO order", t.length === 2 && t[0].agent === "distill" && t[1].agent === "propagate");
  rmSync(dir, { recursive: true, force: true });
}

// 4. A post with no matching pre writes nothing and does not crash.
{
  const dir = newProject({ withLoopDir: true });
  runHook("post", { tool_call_id: "orphan", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] });
  assert("ignores an unpaired post", timings(dir).length === 0);
  rmSync(dir, { recursive: true, force: true });
}

// 5. Malformed stdin is swallowed (no crash, no output).
{
  const dir = newProject({ withLoopDir: true });
  try {
    execFileSync("node", [hook, "pre"], { input: "not json", encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    assert("survives malformed input", true);
  } catch {
    assert("survives malformed input", false);
  }
  rmSync(dir, { recursive: true, force: true });
}

// 6. Picks the workspace root that has an active loop when several are sent.
{
  const idle = newProject({ withLoopDir: false });
  const active = newProject({ withLoopDir: true });
  const payload = { tool_call_id: "multi", tool_name: "eca__spawn_agent", tool_input: { agent: "tend" }, workspaces: [idle, active] };
  runHook("pre", payload);
  runHook("post", payload);
  assert("routes the timing to the workspace with the loop", timings(active).length === 1);
  rmSync(idle, { recursive: true, force: true });
  rmSync(active, { recursive: true, force: true });
}

// 7. A repository-controlled .allium-loop symlink must not redirect writes.
{
  const dir = newProject({ withLoopDir: false });
  const outside = mkdtempSync(path.join(tmpdir(), "allium-timing-outside-"));
  symlinkSync(outside, path.join(dir, ".allium-loop"));
  const payload = { tool_call_id: "linked-dir", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] };
  runHook("pre", payload);
  assert("refuses a symlinked loop directory", !existsSync(path.join(outside, ".timing-pending.json")));
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

// 8. A symlinked pending-state file must not be read or overwritten.
{
  const dir = newProject({ withLoopDir: true });
  const victim = path.join(dir, "victim-pending.txt");
  writeFileSync(victim, "unchanged");
  symlinkSync(victim, path.join(dir, ".allium-loop", ".timing-pending.json"));
  runHook("pre", { tool_call_id: "linked-pending", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] });
  assert("refuses a symlinked pending-state file", readFileSync(victim, "utf-8") === "unchanged");
  rmSync(dir, { recursive: true, force: true });
}

// 9. A symlinked timing log must not receive appended data.
{
  const dir = newProject({ withLoopDir: true });
  const payload = { tool_call_id: "linked-log", tool_name: "eca__spawn_agent", tool_input: { agent: "weed" }, workspaces: [dir] };
  runHook("pre", payload);
  const victim = path.join(dir, "victim-timings.txt");
  writeFileSync(victim, "unchanged");
  symlinkSync(victim, path.join(dir, ".allium-loop", "timings.jsonl"));
  runHook("post", payload);
  assert("refuses a symlinked timing log", readFileSync(victim, "utf-8") === "unchanged");
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
