import { execFileSync } from "child_process";
import { realpathSync, statSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";

process.on("uncaughtException", () => process.exit(0));

// Per-machine marker recording that the install notice has been shown once.
// Lives in the user's cache dir so it spans every project and every spec on
// this machine — once installed, the CLI is on PATH for all of them anyway.
function installNoticeMarkerPath() {
  const cacheHome = process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache");
  return path.join(cacheHome, "allium", "cli-install-notice-shown");
}

// Fallback marker in the workspace root, used when the per-machine cache dir
// isn't writable. Scoped to one workspace rather than the whole machine, but
// it still stops the notice from re-firing on every edit.
function projectNoticeMarkerPath(projectRoot) {
  return path.join(projectRoot, ".allium-cli-notice-shown");
}

function markerExists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function persistMarker(p) {
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, "Allium CLI install notice shown.\n");
    return true;
  } catch {
    return false;
  }
}

function installCommandFor(platform) {
  if (platform === "darwin") {
    return "brew tap juxt/allium && brew install allium   (or: cargo install allium-cli)";
  }
  if (platform === "win32") {
    return "cargo install allium-cli";
  }
  return "cargo install allium-cli   (or, with Homebrew: brew tap juxt/allium && brew install allium)";
}

// On the first .allium edit where the CLI is absent, surface a one-time notice
// instructing the model to offer to install it. Returns the notice text if it
// should be emitted, or null if the user has already been notified.
function installNoticeOnce(projectRoot) {
  const cacheMarker = installNoticeMarkerPath();
  const projectMarker = projectNoticeMarkerPath(projectRoot);

  // If either marker is already present, the user has been notified before.
  if (markerExists(cacheMarker) || markerExists(projectMarker)) return null;

  // Persist the per-machine marker first; if its cache dir isn't writable, fall
  // back to a marker in the workspace root. Knowing which (if any) succeeded
  // lets the notice tell the user, honestly, whether it will recur.
  let savedTo = null;
  if (persistMarker(cacheMarker)) savedTo = "cache";
  else if (persistMarker(projectMarker)) savedTo = "project";

  const command = installCommandFor(process.platform);
  const lines = [
    "Notice from ECA hook `allium.check-spec`:",
    "",
    "Allium CLI not found on PATH — this spec is NOT being formally checked.",
    "",
    "The CLI (`allium check` / `allium analyse`) adds structural verification the",
    "language model can't do reliably alone: tracing data flow across rules, proving",
    "every entity lifecycle can reach a terminal state, and spotting dead ends. With",
    "it installed, every .allium edit is checked and the results feed back into the",
    "conversation, producing more correct and complete specs.",
    "",
    "ACTION: Offer to install it for the user now. If they agree, first check the",
    "relevant package manager exists, then run the command below.",
    "",
    `  Suggested command for this machine (platform: ${process.platform}):`,
    `    ${command}`,
    "  More detail: https://github.com/juxt/allium-tools — make sure the `allium`",
    "  binary ends up on your PATH after installing.",
  ];

  if (savedTo === "cache") {
    lines.push(
      "",
      "This notice fires only once per machine, so do not raise it again afterwards.",
    );
  } else if (savedTo === "project") {
    lines.push(
      "",
      "NOTE: the per-machine marker couldn't be written, so this has been recorded",
      `in the workspace instead (${projectMarker}). The notice won't fire again for`,
      "this workspace; let the user know they may want to add that file to .gitignore.",
    );
  } else {
    // Neither marker could be saved, so the hook can't remember it has notified
    // the user. Be upfront about that and hand off to manual install.
    lines.push(
      "",
      "NOTE: the notice marker could NOT be saved — neither the per-machine cache",
      `nor the workspace root (${projectRoot}) is writable — so this would otherwise`,
      "reappear on every .allium edit. Tell the user this directly, share the manual",
      "install steps above, and ask them to confirm they're happy to install the CLI",
      "themselves. Once they confirm, continue with their task without blocking, and",
      "treat the missing CLI as an acknowledged limitation rather than re-raising it",
      "each edit until the `allium` binary is on PATH.",
    );
  }

  return lines.join("\n");
}

let data = "";
for await (const chunk of process.stdin) {
  data += chunk;
}

let input;
try {
  input = JSON.parse(data);
} catch {
  process.exit(0);
}

// ECA sends { tool_input: { path } } for write_file and edit_file.
const filePath = input.tool_input?.path;

if (typeof filePath !== "string" || path.extname(filePath) !== ".allium") {
  process.exit(0);
}

let resolved;
try {
  resolved = realpathSync(filePath);
  if (!statSync(resolved).isFile()) process.exit(0);
} catch {
  process.exit(0);
}

function workspaceRoots(payload) {
  const payloadRoots = Array.isArray(payload.workspaces) ? payload.workspaces : [];
  const roots = payloadRoots.filter((root) => typeof root === "string" && root.length > 0);
  return roots.length > 0 ? roots : [process.cwd()];
}

// Returns the workspace root containing the file, or null if it's outside all.
function containingWorkspace(file, roots) {
  const resolvedRoots = [];
  for (const root of roots) {
    try {
      resolvedRoots.push(realpathSync(root));
    } catch {
      // Skip unresolvable workspace roots.
    }
  }

  return (
    resolvedRoots.find((root) => file === root || file.startsWith(root + path.sep)) ?? null
  );
}

const projectRoot = containingWorkspace(resolved, workspaceRoots(input));
if (!projectRoot) {
  process.exit(0);
}

try {
  execFileSync("allium", ["check", resolved], {
    encoding: "utf-8",
    stdio: "pipe",
  });
} catch (e) {
  if (e.code === "ENOENT") {
    // The allium binary isn't installed. Show the install notice once (per
    // machine, or per workspace if the cache dir isn't writable) as
    // additional context for the model.
    const notice = installNoticeOnce(projectRoot);
    if (notice) {
      process.stdout.write(JSON.stringify({ additionalContext: notice }));
    }
    process.exit(0);
  }

  const diagnostics = (e.stderr || "") + (e.stdout || "");
  if (diagnostics) {
    const additionalContext = [
      "Automatic Allium validation from ECA hook `allium.check-spec` after editing this `.allium` file.",
      "",
      `The Allium CLI reported diagnostics for ${resolved}:`,
      "",
      diagnostics,
    ].join("\n");

    process.stdout.write(JSON.stringify({ additionalContext }));
  }
  process.exit(0);
}
