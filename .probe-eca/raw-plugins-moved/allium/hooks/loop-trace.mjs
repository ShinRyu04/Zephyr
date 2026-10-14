// Records real per-subagent-call timing into the Allium loop's trace.
//
// Registered twice in hooks.json, matched to ECA's subagent tool:
//   preToolCall  → node loop-trace.mjs pre    (stamp the call's start)
//   postToolCall → node loop-trace.mjs post   (write duration on return)
//
// Timing has to be captured outside the model — a subagent call isn't a shell
// call the model can wrap in `date`, and the model can't read its own latency.
// A hook fires on the tool events, so it can. It writes one line per call to
// .allium-loop/timings.jsonl; the loop folds those durations into its trace and
// report (driving-the-loop §13). The model's trajectory + routing telemetry is
// the cross-harness baseline; this hook is the deterministic timing layer.
//
// It only records while a loop is active (a .allium-loop/ dir exists), never
// blocks a call (always exits 0), and swallows its own errors.

import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "fs";
import path from "path";

process.on("uncaughtException", () => process.exit(0));

const event = process.argv[2]; // "pre" | "post"
if (event !== "pre" && event !== "post") process.exit(0);

let data = "";
for await (const chunk of process.stdin) data += chunk;

let input;
try {
  input = JSON.parse(data);
} catch {
  process.exit(0);
}

// The subagent's name is the useful label ("weed", "distill"). ECA sends
// { tool_input: { agent, task } } for eca__spawn_agent; fall back to the tool
// name if the agent field is missing.
const toolInput = input.tool_input ?? {};
const agent = toolInput.agent ?? input.tool_name ?? input.tool ?? "subagent";

// A correlation id pairs a pre with its post. If the harness doesn't provide
// one, fall back to FIFO, which is correct for the sequential phase calls the
// loop makes (a documented limitation under parallel calls).
const corrId = input.tool_call_id ?? input.toolCallId ?? toolInput.id ?? null;

// Resolve the workspace root the same way the check-spec hook does: ECA sends
// the workspace roots in the payload's `workspaces` array.
const payloadRoots = Array.isArray(input.workspaces) ? input.workspaces : [];
const roots = payloadRoots.filter((r) => typeof r === "string" && r.length > 0);
if (roots.length === 0) roots.push(process.cwd());

let projectRoot = null;
for (const r of roots) {
  try {
    const resolved = realpathSync(r);
    // Prefer the first root that has an active loop; else first resolvable.
    if (existsSync(path.join(resolved, ".allium-loop"))) {
      projectRoot = resolved;
      break;
    }
    if (!projectRoot) projectRoot = resolved;
  } catch {
    // try the next root
  }
}
if (!projectRoot) process.exit(0);

// Only trace while a loop is running; otherwise this is an unrelated subagent.
const loopDir = path.join(projectRoot, ".allium-loop");
if (!existsSync(loopDir)) process.exit(0);
try {
  const stat = lstatSync(loopDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) process.exit(0);
} catch {
  process.exit(0);
}

const pendingPath = path.join(loopDir, ".timing-pending.json");
const timingsPath = path.join(loopDir, "timings.jsonl");
const now = Date.now();

function readPending() {
  try {
    const stat = lstatSync(pendingPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return { byId: {}, fifo: [] };
    const p = JSON.parse(readFileSync(pendingPath, "utf-8"));
    return { byId: p.byId ?? {}, fifo: Array.isArray(p.fifo) ? p.fifo : [] };
  } catch {
    return { byId: {}, fifo: [] };
  }
}
function writeWithoutFollowingSymlinks(filePath, data, append = false) {
  let fd;
  try {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const mode = append ? constants.O_APPEND : constants.O_TRUNC;
    fd = openSync(filePath, constants.O_WRONLY | constants.O_CREAT | mode | noFollow, 0o600);
    writeFileSync(fd, data);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // best-effort
      }
    }
  }
}
function writePending(p) {
  writeWithoutFollowingSymlinks(pendingPath, JSON.stringify(p));
}

if (event === "pre") {
  const p = readPending();
  if (corrId) p.byId[corrId] = { start: now, agent };
  else p.fifo.push({ start: now, agent });
  writePending(p);
  process.exit(0);
}

// event === "post"
const p = readPending();
let rec = null;
if (corrId && p.byId[corrId]) {
  rec = p.byId[corrId];
  delete p.byId[corrId];
} else if (p.fifo.length > 0) {
  rec = p.fifo.shift();
}
writePending(p);

if (rec) {
  const line =
    JSON.stringify({
      ts: new Date(now).toISOString(),
      agent: rec.agent,
      duration_ms: now - rec.start,
    }) + "\n";
  writeWithoutFollowingSymlinks(timingsPath, line, true);
}
process.exit(0);
