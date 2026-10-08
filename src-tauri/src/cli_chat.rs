//! Native-UI hosting for external coding CLIs (Cara B).
//!
//! Unlike `cli_agents` (one-shot capture) and the PTY TUI host, this runs the
//! CLI in its HEADLESS / streaming mode and relays its output as events, so the
//! frontend can paint it in Zephyr's own chat bubbles instead of a terminal.
//! Login is still the CLI's own job — the same credentials a terminal run uses.
//!
//! v1 supports two CLIs:
//!   * claude: `claude -p <prompt> --output-format stream-json --verbose`
//!             (newline-delimited JSON; we extract assistant text deltas)
//!   * codex:  `codex exec <prompt>` (plain text on stdout)

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::errors::{ZResult, ZephyrError};

/// Running sessions, keyed by the frontend request id, so a cancel can kill the
/// right child.
fn running() -> &'static Mutex<HashMap<String, tokio::process::Child>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, tokio::process::Child>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit("cli-chat-chunk", payload);
}

/// Which CLI, and how to drive it headlessly.
struct Headless {
    bin: &'static str,
    /// Does stdout speak newline-delimited JSON (claude) or plain text (codex)?
    json_lines: bool,
}

fn recipe(agent_id: &str) -> Option<Headless> {
    match agent_id {
        "claude" => Some(Headless {
            bin: "claude",
            json_lines: true,
        }),
        "codex" => Some(Headless {
            bin: "codex",
            // Codex stays on plain-text relay for now (rich --json events are
            // parsed by codex_events_from_line and will be switched on later).
            json_lines: false,
        }),
        _ => None,
    }
}

/// Build the argv (minus the binary) for a prompt, folding in the model and the
/// permission mode the user picked in the composer. Both are optional: an empty
/// / "default" selection means "let the CLI use its own default", so no flag is
/// added and the CLI behaves exactly as it would from a plain terminal.
fn build_args(
    agent_id: &str,
    prompt: &str,
    model: Option<&str>,
    mode: Option<&str>,
    resume: Option<&str>,
) -> Vec<String> {
    let model = model.filter(|m| !m.is_empty() && *m != "default");
    let mode = mode.filter(|m| !m.is_empty() && *m != "default");
    let resume = resume.filter(|m| !m.is_empty());
    match agent_id {
        "claude" => {
            let mut v = vec![
                "-p".to_string(),
                prompt.to_string(),
                "--output-format".into(),
                "stream-json".into(),
                "--verbose".into(),
            ];
            /*
             * Continue an existing CLI conversation.
             *
             * Verified against the real binary: a session that was told "remember
             * the name Zephyr" answers "Zephyr." when a later `-p` run passes
             * `--resume <session-id>`. That makes Zephyr able to pick up a session
             * started in a terminal — the context the user built up outside this
             * app is not stranded there.
             *
             * Placed before the model/mode flags only for readability; the CLI
             * does not care about order.
             */
            if let Some(r) = resume {
                v.push("--resume".into());
                v.push(r.into());
            }
            if let Some(m) = model {
                v.push("--model".into());
                v.push(m.into());
            }
            if let Some(m) = mode {
                v.push("--permission-mode".into());
                v.push(m.into());
            }
            v
        }
        "codex" => {
            // Codex stays on plain-text relay for now; the rich `--json` event
            // stream (parsed by codex_events_from_line) is switched on later.
            let mut v = vec!["exec".to_string()];
            if let Some(m) = model {
                v.push("--model".into());
                v.push(m.into());
            }
            v.push(prompt.to_string());
            v
        }
        _ => vec![prompt.to_string()],
    }
}

/// Pull assistant text out of one Claude stream-json line. Returns None for the
/// lines that carry no printable delta (system/init/result bookkeeping).
///
/// Kept for the unit tests and as the narrow "answer only" path; the rich
/// relaying now goes through `claude_events_from_line`, which also surfaces
/// thinking, tool calls and tool results.
fn claude_text_from_line(line: &str) -> Option<String> {
    let v: Value = serde_json::from_str(line).ok()?;
    // Claude Code stream-json: {"type":"assistant","message":{"content":[{"type":"text","text":"…"}]}}
    let t = v.get("type")?.as_str()?;
    if t != "assistant" {
        return None;
    }
    let content = v.get("message")?.get("content")?.as_array()?;
    let mut out = String::new();
    for block in content {
        if block.get("type").and_then(|x| x.as_str()) == Some("text") {
            if let Some(s) = block.get("text").and_then(|x| x.as_str()) {
                out.push_str(s);
            }
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// One structured event ready to emit (the `event` field of a `cli-chat-chunk`
/// payload). See the frozen contract in the frontend: thinking / text / tool /
/// error. `tool` carries the full lifecycle (running -> ok/fail) keyed by
/// `callId` so the UI can upsert one row instead of drawing two.
fn tool_event(obj: Value) -> Value {
    json!({ "kind": "tool", "tool": obj })
}

/// Turn ONE Claude `stream-json` line into zero or more structured events.
///
/// The real stream interleaves, in `assistant.message.content[]`:
///   - {"type":"text","text":…}            -> answer delta
///   - {"type":"thinking","thinking":…}    -> reasoning delta
///   - {"type":"tool_use","id","name","input":{…}} -> a tool starting
/// and in `user.message.content[]`:
///   - {"type":"tool_result","tool_use_id":…,"content":<str|array>} -> a result
/// System/init/result bookkeeping lines carry nothing printable and yield [].
fn claude_events_from_line(line: &str) -> Vec<Value> {
    claude_events_from_line_skip(line, &mut std::collections::HashSet::new())
}

/// As `claude_events_from_line`, but tracking which tool calls were folded into
/// a `todo` event so their results can be skipped.
///
/// The parser is per-line because the stream is, and a tool's `tool_use` and its
/// `tool_result` arrive as two separate lines. That means it cannot decide on
/// its own whether a result belongs to a call it already turned into a
/// checklist — so the set of such call ids is threaded in by the caller, which
/// does see every line.
///
/// Without this, every TodoWrite produced a second, nameless tool row carrying
/// "Todos have been modified successfully": the checklist appeared AND a piece of
/// machinery appeared next to it, which is exactly the raw-text noise the todo
/// event was meant to remove.
fn claude_events_from_line_skip(
    line: &str,
    todo_calls: &mut std::collections::HashSet<String>,
) -> Vec<Value> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    match v.get("type").and_then(|x| x.as_str()) {
        Some("assistant") => {
            let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) else {
                return out;
            };
            for block in content {
                match block.get("type").and_then(|x| x.as_str()) {
                    Some("text") => {
                        if let Some(s) = block.get("text").and_then(|x| x.as_str()) {
                            if !s.is_empty() {
                                out.push(json!({ "kind": "text", "text": s }));
                            }
                        }
                    }
                    Some("thinking") => {
                        // The reasoning body lives under "thinking"; some builds
                        // also mirror it under "text", so accept either.
                        let s = block
                            .get("thinking")
                            .and_then(|x| x.as_str())
                            .or_else(|| block.get("text").and_then(|x| x.as_str()))
                            .unwrap_or("");
                        if !s.is_empty() {
                            out.push(json!({ "kind": "thinking", "text": s }));
                        }
                    }
                    Some("tool_use") => {
                        let call_id = block.get("id").and_then(|x| x.as_str()).unwrap_or("");
                        let name = block.get("name").and_then(|x| x.as_str()).unwrap_or("tool");
                        let input = block.get("input").cloned().unwrap_or(Value::Null);
                        /*
                         * A todo write is a PLAN, not an action.
                         *
                         * TodoWrite / TaskCreate / TaskUpdate carry the agent's
                         * task list, and rendering them as ordinary tool rows
                         * buries the plan inside a collapsed row of JSON — the
                         * reader sees "TodoWrite" and has to click to discover
                         * what is about to happen. They are lifted out into a
                         * `todo` event instead, which the panel paints as a
                         * checklist. The tool row is not emitted at all: the
                         * checklist IS the representation of that call.
                         */
                        if let Some(todos) = claude_todo_snapshot(name, &input) {
                            todo_calls.insert(call_id.to_string());
                            out.push(json!({ "kind": "todo", "items": todos }));
                            continue;
                        }
                        // For file-editing tools, surface the before/after halves
                        // so the UI draws a real green/red diff (like VSCode's
                        // Claude Code) instead of raw JSON. The halves come
                        // straight from the CLI's own tool input.
                        let (diff_old, diff_new) = claude_edit_halves(name, &input);
                        let mut tool = json!({
                            "callId": call_id,
                            "name": name,
                            "title": claude_tool_title(name, &input),
                            "input": pretty_input(&input),
                            "status": "running",
                        });
                        if diff_old.is_some() || diff_new.is_some() {
                            tool["diffOld"] = json!(diff_old.unwrap_or_default());
                            tool["diffNew"] = json!(diff_new.unwrap_or_default());
                            if let Some(p) = input.get("file_path").and_then(|x| x.as_str()) {
                                tool["path"] = json!(p);
                            }
                        }
                        out.push(tool_event(tool));
                    }
                    _ => {}
                }
            }
        }
        Some("user") => {
            let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) else {
                return out;
            };
            for block in content {
                if block.get("type").and_then(|x| x.as_str()) == Some("tool_result") {
                    let call_id = block.get("tool_use_id").and_then(|x| x.as_str()).unwrap_or("");
                    /* The result of a call already shown as a checklist carries no
                       information the checklist does not - "Todos have been
                       modified successfully" is the tool acknowledging itself. */
                    if todo_calls.contains(call_id) {
                        continue;
                    }
                    let is_err = block.get("is_error").and_then(|x| x.as_bool()).unwrap_or(false);
                    out.push(tool_event(json!({
                        "callId": call_id,
                        "name": "",
                        "status": if is_err { "fail" } else { "ok" },
                        "output": tool_result_text(block.get("content")),
                    })));
                }
            }
        }
        Some("system") => {
            /*
             * The init line names the session.
             *
             * Relaying it is what makes `--resume` usable from the UI: without
             * the id, the panel has no handle on the conversation the CLI just
             * created, and the next prompt starts a fresh one - losing the
             * context every tab in this app exists to preserve. Emitted as its
             * own event rather than folded into a message, because it belongs to
             * the SESSION, not to any reply.
             */
            if v.get("subtype").and_then(|x| x.as_str()) == Some("init") {
                if let Some(sid) = v.get("session_id").and_then(|x| x.as_str()) {
                    if !sid.is_empty() {
                        out.push(json!({ "kind": "session", "sessionId": sid }));
                    }
                }
            }
        }
        Some("result") => {
            /*
             * The closing line carries the run's token counts and cost.
             *
             * It was discarded entirely, which is why the context meter showed
             * 0% no matter how large the conversation grew: the only frame that
             * reports the numbers was the one frame nothing read. Verified
             * against the real binary — the `result` line carries `usage` with
             * `input_tokens`/`output_tokens` and a `total_cost_usd`.
             *
             * Cache reads and writes are folded into `input` rather than
             * reported separately: they are a cheaper RATE for the same tokens,
             * and the meter measures how full the window is, not what it cost.
             */
            let u = v.get("usage").cloned().unwrap_or(Value::Null);
            let n = |k: &str| u.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
            let input = n("input_tokens")
                + n("cache_read_input_tokens")
                + n("cache_creation_input_tokens");
            let output = n("output_tokens");
            /* A run that reports neither is not a usage report; emitting zeros
               would read as "this turn was free". */
            if input > 0 || output > 0 {
                out.push(json!({
                    "kind": "usage",
                    "input": input,
                    "output": output,
                    "cost": v.get("total_cost_usd").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    "turns": v.get("num_turns").and_then(|x| x.as_u64()).unwrap_or(0),
                }));
            }
        }
        _ => {}
    }
    out
}

/// A readable, one-line target for a Claude tool call: the command for Bash, the
/// file path for Read/Write/Edit, the pattern for Grep/Glob, else "".
fn claude_tool_title(name: &str, input: &Value) -> String {
    let get = |k: &str| input.get(k).and_then(|x| x.as_str()).unwrap_or("");
    match name {
        "Bash" | "PowerShell" => get("command").to_string(),
        "Read" | "Write" | "Edit" | "NotebookEdit" => get("file_path").to_string(),
        "Grep" => get("pattern").to_string(),
        "Glob" => get("pattern").to_string(),
        "WebFetch" => get("url").to_string(),
        "WebSearch" => get("query").to_string(),
        "Task" => get("description").to_string(),
        _ => String::new(),
    }
}

/// The before/after text halves for a Claude file-editing tool, so the UI can
/// render a real diff. Returns `(old, new)`:
///   * Edit         -> (old_string, new_string)
///   * Write        -> ("", content)            — a new/overwritten file
///   * MultiEdit    -> (joined olds, joined news) across every edit
///   * NotebookEdit -> ("", new_source)
/// Any other tool yields `(None, None)` and is shown as a plain tool row.
/// Read a todo list out of a task-tracking tool call, if that is what this is.
///
/// Two shapes reach here and both must be understood, because which one a
/// session uses depends on the CLI's own defaults rather than on anything
/// Zephyr controls:
///
///   * `TodoWrite` carries the WHOLE list every time, each item a
///     `{content, status, activeForm}`. Sending the complete list is what makes
///     this one call sufficient — the panel can replace its state outright.
///   * `TaskCreate` / `TaskUpdate` are the newer per-task tools: one call adds
///     or changes a single task by `taskId`. They cannot be turned into a
///     snapshot from one call, so they are reported as a partial update and the
///     caller merges.
///
/// Returns `None` for any other tool, so the ordinary tool-row path is
/// untouched.
fn claude_todo_snapshot(name: &str, input: &Value) -> Option<Vec<Value>> {
    /// `activeForm` is the present-continuous label ("Running tests") shown
    /// while the step is in progress; `content` is the imperative one ("Run
    /// tests") shown otherwise. Either may be missing.
    fn item(content: Option<&str>, active: Option<&str>, status: &str, id: Option<&str>) -> Value {
        json!({
            "content": content.unwrap_or(""),
            "activeForm": active.unwrap_or(""),
            "status": status,
            "id": id.unwrap_or(""),
        })
    }

    match name {
        "TodoWrite" => {
            let arr = input.get("todos").and_then(|x| x.as_array())?;
            let items = arr
                .iter()
                .map(|t| {
                    item(
                        t.get("content").and_then(|x| x.as_str()),
                        t.get("activeForm").and_then(|x| x.as_str()),
                        t.get("status").and_then(|x| x.as_str()).unwrap_or("pending"),
                        t.get("id").and_then(|x| x.as_str()),
                    )
                })
                .collect();
            Some(items)
        }
        "TaskCreate" => {
            let subject = input
                .get("subject")
                .or_else(|| input.get("content"))
                .and_then(|x| x.as_str())?;
            let active = input.get("activeForm").and_then(|x| x.as_str());
            let id = input.get("taskId").and_then(|x| x.as_str());
            Some(vec![item(Some(subject), active, "pending", id)])
        }
        "TaskUpdate" => {
            /* The id field is not reliably spelled: the SDK docs note that
               Claude Code repairs `id`/`task_id` to `taskId` before execution
               but that the repair is NOT reflected in the stream we read. So
               all three spellings are accepted. */
            let id = input
                .get("taskId")
                .or_else(|| input.get("id"))
                .or_else(|| input.get("task_id"))
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let status = input.get("status").and_then(|x| x.as_str()).unwrap_or("");
            let active = input.get("activeForm").and_then(|x| x.as_str());
            let subject = input.get("subject").and_then(|x| x.as_str());
            /* `deleted` removes the task; passing it through lets the panel
               drop the row rather than render a task with no state. */
            Some(vec![item(subject, active, status, Some(id))])
        }
        _ => None,
    }
}

fn claude_edit_halves(name: &str, input: &Value) -> (Option<String>, Option<String>) {
    let s = |k: &str| input.get(k).and_then(|x| x.as_str()).map(|x| x.to_string());
    match name {
        "Edit" => (s("old_string"), s("new_string")),
        "Write" => (Some(String::new()), s("content").or(Some(String::new()))),
        "NotebookEdit" => (Some(String::new()), s("new_source")),
        "MultiEdit" => {
            let Some(edits) = input.get("edits").and_then(|x| x.as_array()) else {
                return (None, None);
            };
            let mut old = String::new();
            let mut new = String::new();
            for e in edits {
                if let Some(o) = e.get("old_string").and_then(|x| x.as_str()) {
                    if !old.is_empty() {
                        old.push('\n');
                    }
                    old.push_str(o);
                }
                if let Some(n) = e.get("new_string").and_then(|x| x.as_str()) {
                    if !new.is_empty() {
                        new.push('\n');
                    }
                    new.push_str(n);
                }
            }
            (Some(old), Some(new))
        }
        _ => (None, None),
    }
}

/// Pretty-print a tool input object to compact JSON for the expandable body.
/// A plain string input is returned as-is; null yields "".
fn pretty_input(input: &Value) -> String {
    match input {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    }
}

/// Flatten a `tool_result.content`, which Claude sends either as a plain string
/// or as an array of `{type:"text",text:…}` blocks.
fn tool_result_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => {
            let mut out = String::new();
            for b in arr {
                if let Some(s) = b.get("text").and_then(|x| x.as_str()) {
                    out.push_str(s);
                }
            }
            out
        }
        _ => String::new(),
    }
}

/// Turn ONE Codex `exec --json` line into zero or more structured events.
///
/// Codex emits `item.started` / `item.completed` wrappers around an `item`
/// whose `type` is the real shape:
///   - command_execution : a shell call (command / aggregated_output / exit_code / status)
///   - reasoning          : thinking text
///   - agent_message      : the final answer text
///   - file_change        : an edit (path + diff)
///   - error              : a non-fatal error item
fn codex_events_from_line(line: &str) -> Vec<Value> {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    let phase = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
    let started = phase == "item.started";
    let completed = phase == "item.completed";
    if !started && !completed {
        return Vec::new();
    }
    let Some(item) = v.get("item") else {
        return Vec::new();
    };
    let item_id = item.get("id").and_then(|x| x.as_str()).unwrap_or("");
    let itype = item.get("type").and_then(|x| x.as_str()).unwrap_or("");
    let mut out = Vec::new();
    match itype {
        "command_execution" => {
            let command = item.get("command").and_then(|x| x.as_str()).unwrap_or("");
            let status = if started {
                "running"
            } else {
                match item.get("status").and_then(|x| x.as_str()) {
                    Some("failed") => "fail",
                    _ => "ok",
                }
            };
            let exit = item.get("exit_code").cloned().unwrap_or(Value::Null);
            out.push(tool_event(json!({
                "callId": item_id,
                "name": "command_execution",
                "title": command,
                "input": command,
                "status": status,
                "output": item.get("aggregated_output").and_then(|x| x.as_str()).unwrap_or(""),
                "exitCode": exit,
            })));
        }
        "file_change" => {
            // Codex reports a file edit; surface it as a tool with diff halves so
            // the UI can draw the same diff view as the chat panel.
            let path = item
                .get("path")
                .or_else(|| item.get("file"))
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let status = if started { "running" } else { "ok" };
            out.push(tool_event(json!({
                "callId": item_id,
                "name": "file_change",
                "title": path,
                "path": path,
                "status": status,
                "diffOld": item.get("old").and_then(|x| x.as_str()).unwrap_or(""),
                "diffNew": item.get("new").and_then(|x| x.as_str()).unwrap_or(""),
                "output": item.get("diff").and_then(|x| x.as_str()).unwrap_or(""),
            })));
        }
        "reasoning" if completed => {
            if let Some(s) = item.get("text").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    out.push(json!({ "kind": "thinking", "text": s }));
                }
            }
        }
        "agent_message" if completed => {
            if let Some(s) = item.get("text").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    out.push(json!({ "kind": "text", "text": s }));
                }
            }
        }
        "error" if completed => {
            if let Some(s) = item.get("message").and_then(|x| x.as_str()) {
                out.push(json!({ "kind": "error", "text": s }));
            }
        }
        _ => {}
    }
    out
}

fn resolve_bin(bin: &str) -> ZResult<std::path::PathBuf> {
    which::which(bin).map_err(|_| {
        ZephyrError::NotFound(format!("{bin} is not on PATH — install the CLI first"))
    })
}

#[tauri::command]
pub async fn cli_chat(
    app: AppHandle,
    id: String,
    agent_id: String,
    prompt: String,
    cwd: Option<String>,
    model: Option<String>,
    mode: Option<String>,
    resume: Option<String>,
) -> ZResult<()> {
    if prompt.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("empty prompt".into()));
    }
    let rec = recipe(&agent_id)
        .ok_or_else(|| ZephyrError::InvalidInput(format!("CLI not supported here: {agent_id}")))?;

    let bin = resolve_bin(rec.bin)?;
    let args = build_args(&agent_id, &prompt, model.as_deref(), mode.as_deref(), resume.as_deref());

    let mut command = crate::proc::tokio_cmd(&bin);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    /*
     * Ask the CLI for its task-tracking tools.
     *
     * Claude Code exposes TodoWrite / TaskCreate / TaskUpdate / TaskList by
     * default only on its older models (Claude 3.x, Opus 4 through 4.7, Sonnet
     * 4 through 4.6). On anything newer — including the Opus 4.8 this machine
     * runs — the tools are absent unless the session opts in, and a session
     * that does not opt in emits no todo tool calls at all: the agent works
     * multi-step jobs with no visible plan, which is exactly the gap the todo
     * panel exists to fill.
     *
     * Verified directly: with this variable unset a three-file task produced
     * zero TodoWrite calls; with it set, the same task produced four. Codex is
     * unaffected — the flag is only added for the Claude agent.
     */
    if agent_id == "claude" {
        command.env("CLAUDE_CODE_ENABLE_TODO_TOOLS", "1");
    }
    if let Some(dir) = cwd.as_deref().filter(|d| !d.is_empty()) {
        if std::path::Path::new(dir).is_dir() {
            command.current_dir(dir);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|e| ZephyrError::InvalidInput(format!("spawning {} failed: {e}", rec.bin)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::InvalidInput("no stdout handle".into()))?;
    let stderr = child.stderr.take();

    // Register for cancellation.
    running().lock().unwrap().insert(id.clone(), child);

    // Drain stderr in the background so a chatty CLI cannot deadlock on a full
    // pipe; surface it only if the run produced nothing useful.
    if let Some(err) = stderr {
        let app_err = app.clone();
        let id_err = id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(err).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if !line.trim().is_empty() {
                    emit(&app_err, json!({ "id": id_err, "stderr": line }));
                }
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    /*
     * Call ids already folded into a `todo` event, so their `tool_result` lines
     * can be dropped instead of appearing as a nameless second row. Lives here
     * because the reader sees every line; the per-line parser cannot know it.
     */
    let mut todo_calls: std::collections::HashSet<String> = std::collections::HashSet::new();
    while let Ok(Some(line)) = reader.next_line().await {
        if !running().lock().unwrap().contains_key(&id) {
            // Cancelled: stop relaying.
            break;
        }
        if rec.json_lines {
            // Relay the FULL structured stream (thinking / text / tool calls /
            // tool results / errors), not just answer text. Each agent speaks a
            // different newline-JSON dialect; both map onto the one event shape
            // the frontend upserts by callId.
            let events = match agent_id.as_str() {
                "claude" => claude_events_from_line_skip(&line, &mut todo_calls),
                "codex" => codex_events_from_line(&line),
                _ => Vec::new(),
            };
            for ev in events {
                emit(&app, json!({ "id": id, "event": ev }));
            }
        } else if !line.is_empty() {
            emit(&app, json!({ "id": id, "text": format!("{line}\n") }));
        }
    }

    // Reap the child and report the outcome.
    let cancelled = {
        let mut map = running().lock().unwrap();
        map.remove(&id).is_none()
    };
    emit(&app, json!({ "id": id, "done": true, "cancelled": cancelled }));
    Ok(())
}

#[tauri::command]
pub fn cli_chat_cancel(id: String) -> ZResult<()> {
    if let Some(mut child) = running().lock().unwrap().remove(&id) {
        let _ = child.start_kill();
    }
    Ok(())
}

/// One selectable model for a hosted CLI's picker.
#[derive(serde::Serialize)]
pub struct CliModel {
    /// The value passed to `--model`.
    pub id: String,
    /// Bold line in the picker.
    pub label: String,
    /// Dim subtitle under it.
    pub sub: String,
}

/// Turn a raw model id (`claude-opus-4-8`) into a friendly name ("Opus 4.8").
///
/// The CLI config stores full ids; the picker wants the human form the desktop
/// app shows. Strips the `claude-` prefix, title-cases the family word and
/// joins the version digits with a dot, so `claude-opus-4-8` → "Opus 4.8" and
/// `claude-sonnet-5` → "Sonnet 5". Unknown shapes fall back to the raw id.
fn pretty_model(id: &str) -> String {
    let core = id.strip_prefix("claude-").unwrap_or(id);
    let mut parts = core.split('-');
    let Some(family) = parts.next() else {
        return id.to_string();
    };
    let mut fam = family.chars();
    let family_tc = match fam.next() {
        Some(c) => c.to_uppercase().collect::<String>() + fam.as_str(),
        None => family.to_string(),
    };
    let ver: Vec<&str> = parts.collect();
    if ver.is_empty() {
        family_tc
    } else {
        format!("{family_tc} {}", ver.join("."))
    }
}

/// The user's home directory, via the same env vars the rest of the app uses
/// (`USERPROFILE` on Windows, `HOME` elsewhere). No external crate needed.
pub(crate) fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

/// Read `~/.claude/settings.json` and pull the model id configured for an alias
/// (`opus` → `ANTHROPIC_DEFAULT_OPUS_MODEL`), so the picker can show the real
/// name the account resolves that alias to.
fn claude_env_model(alias: &str) -> Option<String> {
    let home = home_dir()?;
    let raw = std::fs::read_to_string(home.join(".claude").join("settings.json")).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    let env = v.get("env")?;
    let key = format!("ANTHROPIC_DEFAULT_{}_MODEL", alias.to_uppercase());
    env.get(&key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

/// The alias the CLI treats as the current default (`settings.json` → `model`).
fn claude_default_alias() -> Option<String> {
    let home = home_dir()?;
    let raw = std::fs::read_to_string(home.join(".claude").join("settings.json")).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    v.get("model").and_then(|x| x.as_str()).map(|s| s.to_string())
}

/// The models a hosted CLI offers, as the account that is logged in would see
/// them.
///
/// For Claude there is no "list models" subcommand, but `--model` accepts the
/// aliases `fable / opus / sonnet / haiku`, and `~/.claude/settings.json` maps
/// each alias to the concrete id the account resolves it to
/// (`ANTHROPIC_DEFAULT_OPUS_MODEL` = `claude-opus-4-8`). We surface the alias as
/// the id passed to the CLI AND the resolved real name ("Opus 4.8") as the
/// subtitle, so the picker is truly in sync with the CLI instead of showing
/// bare alias words. The alias the config marks as default is noted so the UI
/// can show which one is live.
///
/// The frontend treats this as the live source and falls back to its static
/// catalogue only when the agent is unknown.
#[tauri::command]
pub fn cli_models(agent_id: String) -> ZResult<Vec<CliModel>> {
    let m = |id: &str, label: &str, sub: &str| CliModel {
        id: id.into(),
        label: label.into(),
        sub: sub.into(),
    };
    let list = match agent_id.as_str() {
        "claude" => {
            let def_alias = claude_default_alias();
            // For each alias, resolve the concrete id the account configured and
            // show its friendly name as the subtitle; the subtitle notes which
            // alias is the configured default.
            let row = |alias: &str, fallback_sub: &str| {
                let real = claude_env_model(alias);
                let is_def = def_alias.as_deref() == Some(alias);
                let label = match &real {
                    Some(id) => pretty_model(id),
                    None => {
                        // Title-case the alias when the config does not name a model.
                        let mut c = alias.chars();
                        c.next()
                            .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
                            .unwrap_or_else(|| alias.to_string())
                    }
                };
                let sub = match (&real, is_def) {
                    (Some(id), true) => format!("{id} · current default"),
                    (Some(id), false) => id.clone(),
                    (None, true) => format!("{fallback_sub} · current default"),
                    (None, false) => fallback_sub.to_string(),
                };
                CliModel {
                    id: alias.into(),
                    label,
                    sub,
                }
            };
            vec![
                m("default", "Default (recommended)", "Use the default model for your account"),
                row("opus", "Most capable — hardest, longest-running tasks"),
                row("sonnet", "Balanced speed and capability"),
                row("haiku", "Fastest, for lighter tasks"),
                row("fable", "Most capable for the longest tasks"),
            ]
        }
        "codex" => vec![
            m("default", "Default (recommended)", "Use the configured default"),
            m("gpt-5-codex", "GPT-5 Codex", "Codex-tuned, best for coding"),
            m("gpt-5", "GPT-5", "General purpose"),
            m("o4-mini", "o4-mini", "Fast and economical"),
        ],
        other => {
            return Err(ZephyrError::InvalidInput(format!(
                "CLI not supported here: {other}"
            )))
        }
    };
    Ok(list)
}

/// What Codex's own config resolves to for the logged-in setup.
///
/// There is no local file that lists every model an account can reach — that
/// catalogue lives server-side — but two local sources ARE truthful:
///   * `~/.codex/config.toml` records the default model + reasoning effort.
///   * `~/.codex/sessions/**/rollout-*.jsonl` records the model/effort actually
///     used on every past turn, so the models the account really reaches show
///     up there even when they are not in config.
/// We read both so the picker reflects the logged-in CLI instead of guessing.
#[derive(serde::Serialize, Default)]
pub struct CodexConfig {
    /// `model = "…"` — the id the CLI runs by default.
    pub model: Option<String>,
    /// `model_reasoning_effort = "…"` — minimal/low/medium/high.
    pub reasoning_effort: Option<String>,
    /// `model_provider = "…"` — e.g. "modelrouter", shown as context.
    pub provider: Option<String>,
    /// Models seen in past sessions, most-recent-and-frequent first. These are
    /// the ids the account has genuinely used (`gpt-6-astra`, `gpt-5.5`, …).
    pub recent_models: Vec<CodexSeenModel>,
}

/// One model id observed in the session history, with how often it appeared.
#[derive(serde::Serialize)]
pub struct CodexSeenModel {
    pub id: String,
    /// Number of sessions whose latest turn used this model.
    pub count: u32,
}

/// Pull a top-level string key out of a TOML document WITHOUT a toml crate.
///
/// Only the top-of-file scalar keys are needed (`model`, `model_provider`,
/// `model_reasoning_effort`), and those always appear before the first
/// `[table]` header in Codex's generated config. We therefore scan line by
/// line, stop at the first `[` section header, and match `key = "value"` —
/// quotes stripped, comments and whitespace ignored. This deliberately does not
/// try to be a full TOML parser; it reads three well-known scalars and nothing
/// else.
fn toml_top_string(doc: &str, key: &str) -> Option<String> {
    for raw in doc.lines() {
        let line = raw.trim();
        if line.starts_with('[') {
            break; // entered a [table]; top-level scalars are done
        }
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        if k.trim() != key {
            continue;
        }
        // Strip an inline comment, then surrounding quotes/whitespace.
        let val = v.split('#').next().unwrap_or("").trim();
        let val = val.trim_matches(|c| c == '"' || c == '\'').trim();
        if val.is_empty() {
            return None;
        }
        return Some(val.to_string());
    }
    None
}

/// Pull the LAST `"model":"…"` value out of one rollout `.jsonl` file.
///
/// Codex writes the model used on every turn into a `turn_context` record
/// (`…,"model":"gpt-5.5",…`). The last occurrence is the model the session
/// ended on — the one the account most recently chose. We scan for the literal
/// `"model":"` substring rather than JSON-parsing each line, because a session
/// file holds the full transcript (base instructions, every message) and can be
/// megabytes; a substring sweep stays cheap and the key shape is stable.
fn last_model_in_file(path: &std::path::Path) -> Option<String> {
    let doc = std::fs::read_to_string(path).ok()?;
    let needle = "\"model\":\"";
    let mut found: Option<String> = None;
    let mut from = 0usize;
    while let Some(rel) = doc[from..].find(needle) {
        let start = from + rel + needle.len();
        if let Some(end_rel) = doc[start..].find('"') {
            let val = &doc[start..start + end_rel];
            if !val.is_empty() {
                found = Some(val.to_string());
            }
            from = start + end_rel + 1;
        } else {
            break;
        }
    }
    found
}

/// Collect every `.jsonl` under a directory, recursively, newest path last.
///
/// Session files are stored under `sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl`,
/// so the lexical path order IS chronological — sorting the paths gives
/// oldest→newest without reading timestamps.
fn collect_jsonl(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

/// The models the account has actually used, read from the session history.
///
/// Returns them ordered by frequency (most-used first); ties keep the most
/// recent. These ids are real — they are exactly what `--model` was set to on
/// past runs — so the picker can offer the account's genuine models even though
/// the full server-side catalogue is never written to disk. Capped so a huge
/// history cannot stall the picker.
fn recent_session_models(home: &std::path::Path) -> Vec<CodexSeenModel> {
    let mut files = Vec::new();
    collect_jsonl(&home.join(".codex").join("sessions"), &mut files);
    collect_jsonl(&home.join(".codex").join("archived_sessions"), &mut files);
    files.sort();
    // Scan newest first and stop after a sane number of files.
    files.reverse();
    files.truncate(400);

    // Count by id, remembering first-seen order (newest-first) for tie-breaks.
    let mut counts: HashMap<String, u32> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    for f in &files {
        if let Some(id) = last_model_in_file(f) {
            if !counts.contains_key(&id) {
                order.push(id.clone());
            }
            *counts.entry(id).or_insert(0) += 1;
        }
    }

    let mut seen: Vec<CodexSeenModel> = order
        .into_iter()
        .map(|id| {
            let count = counts.get(&id).copied().unwrap_or(0);
            CodexSeenModel { id, count }
        })
        .collect();
    // Most-used first; `order` was newest-first so a stable sort keeps the more
    // recent model ahead on ties.
    seen.sort_by(|a, b| b.count.cmp(&a.count));
    seen.truncate(12);
    seen
}

/// Read `~/.codex/config.toml` and report the model / effort / provider the CLI
/// is actually configured with, plus the models seen in past sessions, so the
/// Codex picker is in sync with a real terminal run instead of showing invented
/// defaults.
#[tauri::command]
pub fn codex_config() -> ZResult<CodexConfig> {
    let Some(home) = home_dir() else {
        return Ok(CodexConfig::default());
    };
    let recent_models = recent_session_models(&home);
    let path = home.join(".codex").join("config.toml");
    let Ok(doc) = std::fs::read_to_string(&path) else {
        // No config yet (fresh install, or never run) — not an error; still
        // return whatever the session history revealed.
        return Ok(CodexConfig {
            recent_models,
            ..Default::default()
        });
    };
    Ok(CodexConfig {
        model: toml_top_string(&doc, "model"),
        reasoning_effort: toml_top_string(&doc, "model_reasoning_effort"),
        provider: toml_top_string(&doc, "model_provider"),
        recent_models,
    })
}

// ===========================================================================
// Account & settings snapshot for the hosted Claude Code slash popups.
//
// The slash palette's Settings/Context actions (Permissions, Status, Sandbox,
// Memory, Instructions, Slash commands, Output style, Manage plugins, MCP
// servers, Hooks, Account & Usage) each need to SHOW what the logged-in CLI is
// actually configured with — not invented defaults. All of it lives on disk
// under `~/.claude/` and the project folder, which the CLI itself reads, so we
// read the very same files and relay a REDACTED, structured snapshot.
//
// SECURITY: `settings.json` holds the account's API token / auth token. Those
// are NEVER returned — only the presence of auth and the base-URL host are
// surfaced, matching AGENTS.md §7 ("never display/write API keys").
// ===========================================================================

/// Read + parse a JSON file into a Value, or None when absent/unreadable.
fn read_json(path: &std::path::Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// A short, non-sensitive fingerprint of a long id (first 8 chars + "…"), so the
/// UI can show "logged in as f1c0c57b…" without leaking the whole id.
fn short_id(id: &str) -> String {
    if id.len() <= 10 {
        id.to_string()
    } else {
        format!("{}…", &id[..8])
    }
}

/// The host part of a URL (scheme + authority), dropping path/query, so a base
/// URL can be shown as context without exposing anything embedded after it.
fn url_host(u: &str) -> String {
    if let Some(rest) = u.split_once("://") {
        let host = rest.1.split(['/', '?']).next().unwrap_or("");
        format!("{}://{}", rest.0, host)
    } else {
        u.split(['/', '?']).next().unwrap_or("").to_string()
    }
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeKV {
    pub key: String,
    pub value: String,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeFile {
    pub label: String,
    pub path: String,
    pub bytes: u64,
    /// First ~2 KB of the file so the popup can preview it without loading a
    /// huge document into the UI.
    pub preview: String,
    pub scope: String,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudePlugin {
    pub name: String,
    pub marketplace: String,
    pub version: String,
    pub scope: String,
    pub enabled: bool,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeMcp {
    pub name: String,
    pub scope: String,
    /// "stdio" / "sse" / "http" — the transport kind, no secrets.
    pub kind: String,
    /// The command (stdio) or URL host (sse/http), redacted of query strings.
    pub target: String,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeHook {
    pub event: String,
    pub matcher: String,
    pub command: String,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeUsage {
    pub project: String,
    pub cost_usd: f64,
    pub duration_ms: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub lines_added: u64,
    pub lines_removed: u64,
    pub session_id: String,
    /// Per-model token/cost breakdown, pretty for the table.
    pub by_model: Vec<ClaudeModelUsage>,
}

#[derive(serde::Serialize, Default)]
pub struct ClaudeModelUsage {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

/// Everything the slash popups show, read live from the CLI's own config.
#[derive(serde::Serialize, Default)]
pub struct ClaudeInfo {
    // --- Account ---
    pub account_id: String,
    pub install_method: String,
    pub num_startups: u64,
    pub logged_in: bool,
    /// How the CLI authenticates: "subscription", "api-key", or "custom base URL".
    pub auth_kind: String,
    // --- Status ---
    pub version: String,
    pub model: String,
    pub theme: String,
    pub base_url: String,
    pub max_context_tokens: String,
    pub cwd: String,
    pub trusted: bool,
    // --- Permissions / Sandbox ---
    pub permission_mode: String,
    pub permission_allow: Vec<String>,
    pub permission_deny: Vec<String>,
    pub permission_ask: Vec<String>,
    pub skip_dangerous: bool,
    // --- Memory / Instructions ---
    pub memory_files: Vec<ClaudeFile>,
    // --- Slash commands ---
    pub slash_commands: Vec<ClaudeFile>,
    // --- Output styles ---
    pub output_style: String,
    pub output_styles: Vec<ClaudeFile>,
    // --- Plugins ---
    pub plugins: Vec<ClaudePlugin>,
    // --- MCP servers ---
    pub mcp_servers: Vec<ClaudeMcp>,
    // --- Hooks ---
    pub hooks: Vec<ClaudeHook>,
    // --- Usage ---
    pub usage: Vec<ClaudeUsage>,
    // --- Env (non-secret keys only) ---
    pub env: Vec<ClaudeKV>,
}

/// A file's label/path/bytes/preview, scanning a directory for a given ext.
fn file_entry(path: &std::path::Path, label: &str, scope: &str) -> Option<ClaudeFile> {
    let meta = std::fs::metadata(path).ok()?;
    let raw = std::fs::read_to_string(path).unwrap_or_default();
    let preview: String = raw.chars().take(2000).collect();
    Some(ClaudeFile {
        label: label.to_string(),
        path: path.to_string_lossy().to_string(),
        bytes: meta.len(),
        preview,
        scope: scope.to_string(),
    })
}

/// Collect `*.md` command files in a directory as slash-command entries. The
/// command name is `/<stem>` the way Claude Code registers them.
fn scan_commands(dir: &std::path::Path, scope: &str, out: &mut Vec<ClaudeFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) == Some("md") {
            let stem = p.file_stem().and_then(|x| x.to_str()).unwrap_or("");
            if let Some(mut f) = file_entry(&p, &format!("/{stem}"), scope) {
                f.bytes = e.metadata().map(|m| m.len()).unwrap_or(f.bytes);
                out.push(f);
            }
        }
    }
}

/// Flatten a settings `permissions.allow/deny/ask` array of strings.
fn perm_list(perms: Option<&Value>, key: &str) -> Vec<String> {
    perms
        .and_then(|p| p.get(key))
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// The one read-only command behind every Claude slash popup.
#[tauri::command]
pub fn claude_account_info(cwd: Option<String>) -> ZResult<ClaudeInfo> {
    let mut info = ClaudeInfo::default();
    let Some(home) = home_dir() else {
        return Ok(info);
    };
    let dir = home.join(".claude");

    // --- settings.json: model / theme / permissions / plugins / hooks / env ---
    let settings = read_json(&dir.join("settings.json")).unwrap_or(Value::Null);
    info.model = settings
        .get("model")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    info.theme = settings
        .get("theme")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    info.output_style = settings
        .get("outputStyle")
        .and_then(|x| x.as_str())
        .unwrap_or("default")
        .to_string();
    info.skip_dangerous = settings
        .get("skipDangerousModePermissionPrompt")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);

    let perms = settings.get("permissions");
    info.permission_mode = perms
        .and_then(|p| p.get("defaultMode"))
        .and_then(|x| x.as_str())
        .unwrap_or("default")
        .to_string();
    info.permission_allow = perm_list(perms, "allow");
    info.permission_deny = perm_list(perms, "deny");
    info.permission_ask = perm_list(perms, "ask");

    // env: surface only the non-secret keys. API keys / tokens are dropped.
    if let Some(env) = settings.get("env").and_then(|x| x.as_object()) {
        for (k, v) in env {
            let ku = k.to_uppercase();
            let is_secret = ku.contains("TOKEN") || ku.contains("KEY") || ku.contains("SECRET");
            if ku.contains("BASE_URL") {
                if let Some(u) = v.as_str() {
                    info.base_url = url_host(u);
                }
                continue;
            }
            if ku.contains("MAX_CONTEXT_TOKENS") {
                info.max_context_tokens = v.as_str().unwrap_or("").to_string();
            }
            if is_secret {
                continue;
            }
            info.env.push(ClaudeKV {
                key: k.clone(),
                value: v.as_str().unwrap_or("").to_string(),
            });
        }
    }

    // Auth kind: a custom base URL means a proxy/custom provider; otherwise an
    // api key / subscription. We never read the token itself, only whether one
    // of the auth keys is present.
    let has_token = settings
        .get("env")
        .and_then(|x| x.as_object())
        .map(|env| {
            env.keys().any(|k| {
                let ku = k.to_uppercase();
                ku.contains("AUTH_TOKEN") || ku.contains("API_KEY")
            })
        })
        .unwrap_or(false);
    info.auth_kind = if !info.base_url.is_empty() && !info.base_url.contains("anthropic.com") {
        "custom base URL".to_string()
    } else if has_token {
        "api key".to_string()
    } else {
        "subscription".to_string()
    };
    info.logged_in = has_token || info.auth_kind == "subscription";

    // --- enabled plugins from settings + installed_plugins.json for versions ---
    let enabled: std::collections::HashSet<String> = settings
        .get("enabledPlugins")
        .and_then(|x| x.as_object())
        .map(|o| {
            o.iter()
                .filter(|(_, v)| v.as_bool().unwrap_or(false))
                .map(|(k, _)| k.clone())
                .collect()
        })
        .unwrap_or_default();
    if let Some(installed) = read_json(&dir.join("plugins").join("installed_plugins.json")) {
        if let Some(map) = installed.get("plugins").and_then(|x| x.as_object()) {
            for (full, arr) in map {
                let (name, market) = full.split_once('@').unwrap_or((full.as_str(), ""));
                let first = arr.as_array().and_then(|a| a.first());
                let version = first
                    .and_then(|f| f.get("version"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let scope = first
                    .and_then(|f| f.get("scope"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("user")
                    .to_string();
                info.plugins.push(ClaudePlugin {
                    name: name.to_string(),
                    marketplace: market.to_string(),
                    version,
                    scope,
                    enabled: enabled.contains(full),
                });
            }
        }
    }
    // Plugins enabled but with no install record still show (as enabled).
    for full in &enabled {
        let (name, market) = full.split_once('@').unwrap_or((full.as_str(), ""));
        if !info.plugins.iter().any(|p| p.name == name && p.marketplace == market) {
            info.plugins.push(ClaudePlugin {
                name: name.to_string(),
                marketplace: market.to_string(),
                version: String::new(),
                scope: "user".to_string(),
                enabled: true,
            });
        }
    }

    // --- hooks from settings.json ---
    if let Some(hooks) = settings.get("hooks").and_then(|x| x.as_object()) {
        for (event, groups) in hooks {
            if let Some(arr) = groups.as_array() {
                for g in arr {
                    let matcher = g
                        .get("matcher")
                        .and_then(|x| x.as_str())
                        .unwrap_or("*")
                        .to_string();
                    if let Some(cmds) = g.get("hooks").and_then(|x| x.as_array()) {
                        for c in cmds {
                            let command = c
                                .get("command")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            info.hooks.push(ClaudeHook {
                                event: event.clone(),
                                matcher: matcher.clone(),
                                command,
                            });
                        }
                    }
                }
            }
        }
    }

    // --- memory / instructions files (user + project CLAUDE.md, AGENTS.md) ---
    for (p, label, scope) in [
        (dir.join("CLAUDE.md"), "User memory (~/.claude/CLAUDE.md)", "user"),
    ] {
        if let Some(f) = file_entry(&p, label, scope) {
            info.memory_files.push(f);
        }
    }
    let proj_dir = cwd
        .as_deref()
        .filter(|c| !c.is_empty())
        .map(std::path::PathBuf::from);
    if let Some(ref proj) = proj_dir {
        info.cwd = proj.to_string_lossy().to_string();
        for (name, label) in [
            ("CLAUDE.md", "Project memory (CLAUDE.md)"),
            ("CLAUDE.local.md", "Project memory (CLAUDE.local.md)"),
            ("AGENTS.md", "Project instructions (AGENTS.md)"),
        ] {
            if let Some(f) = file_entry(&proj.join(name), label, "project") {
                info.memory_files.push(f);
            }
        }
        // project slash commands + mcp from .mcp.json
        scan_commands(&proj.join(".claude").join("commands"), "project", &mut info.slash_commands);
        if let Some(mcpj) = read_json(&proj.join(".mcp.json")) {
            collect_mcp(mcpj.get("mcpServers"), "project (.mcp.json)", &mut info.mcp_servers);
        }
    }

    // --- user slash commands + output styles ---
    scan_commands(&dir.join("commands"), "user", &mut info.slash_commands);
    if let Ok(entries) = std::fs::read_dir(dir.join("output-styles")) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("md") {
                let stem = p.file_stem().and_then(|x| x.to_str()).unwrap_or("");
                if let Some(f) = file_entry(&p, stem, "user") {
                    info.output_styles.push(f);
                }
            }
        }
    }

    // --- account + per-project usage from ~/.claude.json ---
    if let Some(root) = read_json(&home.join(".claude.json")) {
        info.account_id = root
            .get("userID")
            .and_then(|x| x.as_str())
            .map(short_id)
            .unwrap_or_default();
        info.install_method = root
            .get("installMethod")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        info.num_startups = root.get("numStartups").and_then(|x| x.as_u64()).unwrap_or(0);
        if let Some(acc) = root.get("oauthAccount").and_then(|x| x.as_object()) {
            // An oauth account means a logged-in subscription; surface the email
            // only (no tokens live here).
            if let Some(email) = acc.get("emailAddress").and_then(|x| x.as_str()) {
                info.account_id = email.to_string();
                info.auth_kind = "subscription".to_string();
                info.logged_in = true;
            }
        }
        // user-scope mcp servers
        collect_mcp(root.get("mcpServers"), "user", &mut info.mcp_servers);

        if let Some(projects) = root.get("projects").and_then(|x| x.as_object()) {
            // Match the active cwd first (case-insensitively, both slash styles),
            // then include any project that has recorded usage.
            let want = proj_dir
                .as_ref()
                .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase());
            for (pkey, pv) in projects {
                let norm = pkey.replace('\\', "/").to_lowercase();
                let cost = pv.get("lastCost").and_then(|x| x.as_f64()).unwrap_or(0.0);
                let is_active = want.as_deref() == Some(norm.as_str());
                if !is_active && cost == 0.0 {
                    continue;
                }
                collect_mcp(pv.get("mcpServers"), "project", &mut info.mcp_servers);
                if is_active {
                    info.trusted = pv
                        .get("hasTrustDialogAccepted")
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false);
                }
                let mut by_model = Vec::new();
                if let Some(mu) = pv.get("lastModelUsage").and_then(|x| x.as_object()) {
                    for (model, u) in mu {
                        by_model.push(ClaudeModelUsage {
                            model: pretty_model(model),
                            input_tokens: u.get("inputTokens").and_then(|x| x.as_u64()).unwrap_or(0),
                            output_tokens: u.get("outputTokens").and_then(|x| x.as_u64()).unwrap_or(0),
                            cost_usd: u.get("costUSD").and_then(|x| x.as_f64()).unwrap_or(0.0),
                        });
                    }
                }
                info.usage.push(ClaudeUsage {
                    project: pkey.clone(),
                    cost_usd: cost,
                    duration_ms: pv.get("lastDuration").and_then(|x| x.as_f64()).unwrap_or(0.0),
                    input_tokens: pv.get("lastTotalInputTokens").and_then(|x| x.as_u64()).unwrap_or(0),
                    output_tokens: pv.get("lastTotalOutputTokens").and_then(|x| x.as_u64()).unwrap_or(0),
                    lines_added: pv.get("lastLinesAdded").and_then(|x| x.as_u64()).unwrap_or(0),
                    lines_removed: pv.get("lastLinesRemoved").and_then(|x| x.as_u64()).unwrap_or(0),
                    session_id: pv.get("lastSessionId").and_then(|x| x.as_str()).map(short_id).unwrap_or_default(),
                    by_model,
                });
            }
            // Active project first, then by cost descending.
            info.usage.sort_by(|a, b| {
                b.cost_usd.partial_cmp(&a.cost_usd).unwrap_or(std::cmp::Ordering::Equal)
            });
        }
    }

    // --- version from the CLI binary ---
    info.version = claude_cli_version().unwrap_or_default();

    Ok(info)
}

/// Parse an `mcpServers` object into redacted entries (command or URL host,
/// never headers/tokens).
fn collect_mcp(servers: Option<&Value>, scope: &str, out: &mut Vec<ClaudeMcp>) {
    let Some(map) = servers.and_then(|x| x.as_object()) else {
        return;
    };
    for (name, cfg) in map {
        if out.iter().any(|m| m.name == *name) {
            continue; // first scope seen wins
        }
        let kind = cfg
            .get("type")
            .and_then(|x| x.as_str())
            .unwrap_or_else(|| if cfg.get("url").is_some() { "http" } else { "stdio" })
            .to_string();
        let target = if let Some(u) = cfg.get("url").and_then(|x| x.as_str()) {
            url_host(u)
        } else {
            let cmd = cfg.get("command").and_then(|x| x.as_str()).unwrap_or("");
            let args = cfg
                .get("args")
                .and_then(|x| x.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            format!("{cmd} {args}").trim().to_string()
        };
        out.push(ClaudeMcp {
            name: name.clone(),
            scope: scope.to_string(),
            kind,
            target,
        });
    }
}

/// `claude --version` → the version string, run quickly and non-fatally.
fn claude_cli_version() -> Option<String> {
    let bin = which::which("claude").ok()?;
    let out = std::process::Command::new(bin).arg("--version").output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    Some(s.trim().to_string()).filter(|x| !x.is_empty())
}

// ===========================================================================
// Writing back into the CLI's own config, so the slash popups are not just a
// read-only mirror but actually EDIT what `claude` uses next run (真の sync).
// Every write targets the same files the CLI reads; nothing Zephyr-only.
// Secrets are never touched: these helpers only merge the non-secret keys the
// popups expose (model, permission mode, output style, hooks) and write plain
// markdown for memory/commands.
// ===========================================================================

/// Recursively merge `patch` into `base` (RFC 7386 style): `null` deletes a key,
/// objects merge, everything else overwrites. Mirrors the settings merge used
/// elsewhere so a partial patch does not clobber unrelated keys.
fn merge_json(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                if v.is_null() {
                    b.remove(k);
                } else {
                    merge_json(b.entry(k.clone()).or_insert(Value::Null), v);
                }
            }
        }
        (b, p) => *b = p.clone(),
    }
}

/// Patch `~/.claude/settings.json` with a partial object, preserving every key
/// the popup did not touch (including the secret `env` block). Returns nothing;
/// the next `claude_account_info` reflects the change.
#[tauri::command]
pub fn claude_settings_patch(patch: Value) -> ZResult<()> {
    let home = home_dir().ok_or_else(|| ZephyrError::NotFound("no home directory".into()))?;
    let dir = home.join(".claude");
    std::fs::create_dir_all(&dir).map_err(|e| ZephyrError::Io(e.to_string()))?;
    let path = dir.join("settings.json");
    let mut cur = read_json(&path).unwrap_or(Value::Object(Default::default()));
    if !cur.is_object() {
        cur = Value::Object(Default::default());
    }
    merge_json(&mut cur, &patch);
    let pretty = serde_json::to_string_pretty(&cur).map_err(|e| ZephyrError::Io(e.to_string()))?;
    std::fs::write(&path, pretty).map_err(|e| ZephyrError::Io(e.to_string()))?;
    Ok(())
}

/// Write a memory / instructions file (CLAUDE.md). `scope` is "user" (→
/// ~/.claude/CLAUDE.md) or "project" (→ <cwd>/CLAUDE.md). The content is plain
/// markdown the CLI reads verbatim.
#[tauri::command]
pub fn claude_memory_write(scope: String, content: String, cwd: Option<String>) -> ZResult<String> {
    let path = match scope.as_str() {
        "project" => {
            let dir = cwd
                .filter(|c| !c.is_empty())
                .ok_or_else(|| ZephyrError::InvalidInput("no project folder".into()))?;
            std::path::PathBuf::from(dir).join("CLAUDE.md")
        }
        _ => {
            let home = home_dir().ok_or_else(|| ZephyrError::NotFound("no home".into()))?;
            home.join(".claude").join("CLAUDE.md")
        }
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ZephyrError::Io(e.to_string()))?;
    }
    std::fs::write(&path, content).map_err(|e| ZephyrError::Io(e.to_string()))?;
    Ok(path.to_string_lossy().to_string())
}

/// Create or overwrite a slash command file. The name is sanitised to a bare
/// stem so it cannot escape the folder.
///
/// `dir` is optional: when absent the command lands in the real
/// `~/.claude/commands/`, which is what the app itself means by "save a
/// command". When present it is used as the target folder instead — a harness
/// that wanted to prove the write works could not otherwise do so without
/// putting a file in the user's own Claude config, which is a side effect that
/// outlives the test.
#[tauri::command]
pub fn claude_command_write(name: String, content: String, dir: Option<String>) -> ZResult<String> {
    let stem = name.trim().trim_start_matches('/');
    if stem.is_empty() || stem.contains(['/', '\\', ':']) || stem.contains("..") {
        return Err(ZephyrError::InvalidInput("bad command name".into()));
    }
    let folder = match dir.filter(|d| !d.is_empty()) {
        Some(d) => std::path::PathBuf::from(d),
        None => home_dir()
            .ok_or_else(|| ZephyrError::NotFound("no home".into()))?
            .join(".claude")
            .join("commands"),
    };
    std::fs::create_dir_all(&folder).map_err(|e| ZephyrError::Io(e.to_string()))?;
    let path = folder.join(format!("{stem}.md"));
    std::fs::write(&path, content).map_err(|e| ZephyrError::Io(e.to_string()))?;
    Ok(path.to_string_lossy().to_string())
}

/// Delete a slash command file. Returns whether a file was removed. Same
/// `dir` semantics as `claude_command_write`.
#[tauri::command]
pub fn claude_command_delete(name: String, dir: Option<String>) -> ZResult<bool> {
    let stem = name.trim().trim_start_matches('/');
    if stem.is_empty() || stem.contains(['/', '\\', ':']) || stem.contains("..") {
        return Err(ZephyrError::InvalidInput("bad command name".into()));
    }
    let folder = match dir.filter(|d| !d.is_empty()) {
        Some(d) => std::path::PathBuf::from(d),
        None => home_dir()
            .ok_or_else(|| ZephyrError::NotFound("no home".into()))?
            .join(".claude")
            .join("commands"),
    };
    let path = folder.join(format!("{stem}.md"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| ZephyrError::Io(e.to_string()))?;
        return Ok(true);
    }
    Ok(false)
}

/// The built-in slash commands Claude Code ships, for the "Slash commands"
/// popup so the list is complete even before the user adds custom ones. These
/// are the stable interactive commands; running one inserts it in the composer.
#[derive(serde::Serialize)]
pub struct BuiltinCommand {
    pub name: String,
    pub desc: String,
    /// Where the command does its work, so the palette can be honest about it.
    ///
    /// The real CLI has 67 of these and Zephyr can genuinely perform a large
    /// share of them, because it owns the panel, the transcript and the
    /// settings file. The rest need an interactive terminal session that
    /// `claude -p` does not have — those are marked `terminal` and are handed to
    /// the Terminal pane rather than silently doing nothing.
    ///
    ///   "zephyr"   — Zephyr performs it: opens a sheet, edits a setting, trims
    ///                the transcript
    ///   "cli"      — forwarded to the CLI as a prompt it can answer
    ///   "terminal" — needs the interactive TUI; opens the Terminal pane
    pub runs: String,
}

#[tauri::command]
pub fn claude_builtin_commands() -> ZResult<Vec<BuiltinCommand>> {
    let c = |name: &str, desc: &str, runs: &str| BuiltinCommand {
        name: name.into(),
        desc: desc.into(),
        runs: runs.into(),
    };
    /*
     * Grouped the way the real palette groups them, and complete: the CLI ships
     * 67 built-ins and a palette that lists 19 is not the same feature.
     *
     * `runs` is not decoration. Every one of these does something when picked —
     * a sheet opens, a setting changes, a prompt is sent, or the Terminal pane
     * opens for the ones that genuinely need a TTY. An entry that quietly did
     * nothing would be worse than not listing it, because the reader would
     * conclude the command was broken rather than unavailable.
     */
    let daftar: Vec<(&str, &str, &str)> = vec![
        // ---- Session -------------------------------------------------------
        ("/clear", "Clear conversation history and free up context", "zephyr"),
        ("/compact", "Compact the conversation to save context", "zephyr"),
        ("/rewind", "Restore the conversation to an earlier point", "zephyr"),
        ("/recap", "Summarise the current session in one line", "zephyr"),
        ("/export", "Export this conversation", "zephyr"),
        ("/exit", "Close this session", "zephyr"),

        // ---- Context -------------------------------------------------------
        ("/context", "See what is filling the context window", "zephyr"),
        /*
         * How full the window gets before compaction runs on its own.
         *
         * The real CLI has this command and Zephyr did not — its threshold was a
         * constant at 80%, which is a sensible default and a poor fixed rule: a
         * session doing large file edits fills the window in a few steps and
         * wants compaction sooner, while a conversational one is happy to run
         * closer to the line. `auto` restores the default.
         */
        ("/autocompact", "Set how full the context gets before auto-compacting", "zephyr"),
        ("/usage", "Show token usage and cost for this session", "zephyr"),
        ("/stats", "Session statistics: turns, tools, tokens", "zephyr"),
        ("/cost", "Alias for /usage", "zephyr"),

        // ---- Model & reasoning ---------------------------------------------
        ("/model", "Change the active model", "zephyr"),
        ("/effort", "How hard the model should think", "zephyr"),
        ("/config", "Open Zephyr settings", "zephyr"),

        // ---- Project -------------------------------------------------------
        /*
         * Forwarded to the CLI as a PROMPT: both expand into an instruction the
         * model answers, which is the one kind of slash command that works in
         * print mode. Verified against the real binary — `/status` and `/cost`
         * are ignored there, but a prompt-shaped command is answered.
         */
        ("/init", "Generate a CLAUDE.md with codebase instructions", "cli"),
        ("/memory", "Edit the project and user memory files", "zephyr"),
        ("/diff", "Review the changes in the working tree", "zephyr"),
        ("/review", "Review the current changes", "cli"),
        ("/security-review", "Security review of the pending changes", "zephyr"),
        ("/privacy-settings", "Review what is sent to the model provider", "zephyr"),

        // ---- Extend --------------------------------------------------------
        ("/agents", "Manage subagents", "zephyr"),
        ("/list-agents", "List the subagents this session can reach", "zephyr"),
        ("/skills", "Browse and install skills", "zephyr"),
        ("/plugins", "Browse and install plugins", "zephyr"),
        ("/mcp", "Manage MCP servers and view their tools", "zephyr"),
        ("/hooks", "Configure hooks that run on tool events", "zephyr"),
        ("/permissions", "View or edit tool permission rules", "zephyr"),
        ("/sandbox", "Permission mode and sandbox behaviour", "zephyr"),
        ("/fewer-permission-prompts", "Find repeated prompts worth allowing", "zephyr"),
        ("/tasks", "Background jobs and scheduled commands", "zephyr"),
        ("/statusline", "Choose what the status line shows", "zephyr"),

        // ---- Account & diagnostics -----------------------------------------
        ("/status", "Show version, model, account and connection", "zephyr"),
        ("/doctor", "Diagnose and verify your installation", "zephyr"),

        // ---- Appearance ----------------------------------------------------
        ("/theme", "Change the colour theme", "zephyr"),
        ("/vim", "Vim keybindings in the prompt", "zephyr"),

        // ---- Terminal-only -------------------------------------------------
        ("/ide", "Manage IDE integrations and show status", "terminal"),
        ("/login", "Switch Anthropic accounts", "terminal"),
        ("/logout", "Sign out of your Anthropic account", "terminal"),
        ("/terminal-setup", "Install the Shift+Enter newline keybinding", "terminal"),
        ("/keybindings", "Edit Zephyr's keyboard shortcuts", "zephyr"),
        ("/remote-control", "Control this session from another device", "terminal"),
        ("/upgrade", "Upgrade the Claude Code installation", "terminal"),
        ("/release-notes", "What changed in recent versions", "terminal"),

        // ---- Resources -----------------------------------------------------
        ("/help", "Show help and the full command list", "zephyr"),
    ];

    Ok(daftar
        .into_iter()
        .map(|(name, desc, runs)| c(name, desc, runs))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * The palette lists the real set, and every entry says where it runs.
     *
     * A 19-command list is not the feature: the CLI ships 67 built-ins, and the
     * reader who types "/" is looking for one of them. The `runs` field is what
     * keeps the list honest — an entry that quietly did nothing would read as
     * the command being broken rather than unavailable.
     */
    #[test]
    fn builtin_commands_meliputi_daftar_asli() {
        let c = claude_builtin_commands().expect("daftar");
        assert!(c.len() >= 40, "hanya {} command, mestinya puluhan", c.len());

        // Commands the real palette has and a 19-entry list would be missing.
        for wajib in [
            "/usage", "/diff", "/rewind", "/recap", "/tasks", "/skills",
            "/plugins", "/sandbox", "/context", "/stats", "/theme", "/export",
            "/autocompact",
        ] {
            assert!(
                c.iter().any(|x| x.name == wajib),
                "{wajib} tidak ada di daftar"
            );
        }
    }

    #[test]
    fn setiap_command_punya_tujuan_yang_jelas() {
        let c = claude_builtin_commands().expect("daftar");
        for x in &c {
            assert!(
                ["zephyr", "cli", "terminal"].contains(&x.runs.as_str()),
                "{} punya runs={} yang tidak dikenal",
                x.name,
                x.runs
            );
            assert!(!x.desc.trim().is_empty(), "{} tanpa deskripsi", x.name);
            assert!(x.name.starts_with('/'), "{} hilang garis miring", x.name);
        }
        // Tidak ada nama kembar: palette dengan dua entri sama membingungkan.
        let mut nama: Vec<&str> = c.iter().map(|x| x.name.as_str()).collect();
        nama.sort_unstable();
        let n = nama.len();
        nama.dedup();
        assert_eq!(nama.len(), n, "ada nama command yang kembar");
    }

    #[test]
    fn url_host_strips_path_and_query() {
        assert_eq!(url_host("https://api.anthropic.com/v1/x?k=secret"), "https://api.anthropic.com");
        assert_eq!(url_host("http://127.0.0.1:8181"), "http://127.0.0.1:8181");
    }

    #[test]
    fn short_id_masks_long_ids() {
        assert_eq!(short_id("f1c0c57b1f1a9e43c4"), "f1c0c57b…");
        assert_eq!(short_id("short"), "short");
    }

    #[test]
    fn merge_json_merges_and_deletes() {
        let mut base: Value =
            serde_json::from_str(r#"{"a":1,"b":{"x":1,"y":2},"env":{"KEY":"secret"}}"#).unwrap();
        let patch: Value = serde_json::from_str(r#"{"b":{"y":null,"z":3},"c":4}"#).unwrap();
        merge_json(&mut base, &patch);
        assert_eq!(base["a"], 1);
        assert_eq!(base["b"]["x"], 1);
        assert!(base["b"].get("y").is_none()); // null deleted it
        assert_eq!(base["b"]["z"], 3);
        assert_eq!(base["c"], 4);
        // An unrelated (secret) block is preserved untouched.
        assert_eq!(base["env"]["KEY"], "secret");
    }

    #[test]
    fn collect_mcp_redacts_to_command_or_host() {
        let v: Value = serde_json::from_str(
            r#"{"a":{"command":"npx","args":["-y","srv"]},"b":{"url":"https://h.io/mcp?token=xyz"}}"#,
        )
        .unwrap();
        let mut out = Vec::new();
        collect_mcp(Some(&v), "user", &mut out);
        assert_eq!(out.len(), 2);
        let a = out.iter().find(|m| m.name == "a").unwrap();
        assert_eq!(a.target, "npx -y srv");
        assert_eq!(a.kind, "stdio");
        let b = out.iter().find(|m| m.name == "b").unwrap();
        assert_eq!(b.target, "https://h.io");
        assert!(!b.target.contains("token"));
    }

    #[test]
    fn claude_line_extracts_text() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"halo"}]}}"#;
        assert_eq!(claude_text_from_line(line).as_deref(), Some("halo"));
    }

    #[test]
    fn claude_line_ignores_system() {
        let line = r#"{"type":"system","subtype":"init"}"#;
        assert!(claude_text_from_line(line).is_none());
    }

    #[test]
    fn claude_events_text_and_tool_use() {
        // A single assistant line can carry narration text AND a tool_use.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"I'll list files."},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls -la","description":"list"}}]}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 2);
        assert_eq!(ev[0]["kind"], "text");
        assert_eq!(ev[0]["text"], "I'll list files.");
        assert_eq!(ev[1]["kind"], "tool");
        assert_eq!(ev[1]["tool"]["callId"], "toolu_1");
        assert_eq!(ev[1]["tool"]["name"], "Bash");
        assert_eq!(ev[1]["tool"]["title"], "ls -la");
        assert_eq!(ev[1]["tool"]["status"], "running");
    }

    #[test]
    fn claude_events_thinking() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"let me reason"}]}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0]["kind"], "thinking");
        assert_eq!(ev[0]["text"], "let me reason");
    }

    #[test]
    fn claude_todo_write_becomes_a_todo_event() {
        // TodoWrite must NOT come through as a tool row: the checklist is the
        // representation, and a row would bury the plan inside collapsed JSON.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"TodoWrite","input":{"todos":[{"content":"Read the file","status":"completed","activeForm":"Reading the file"},{"content":"Edit beta","status":"in_progress","activeForm":"Editing beta"},{"content":"Run tests","status":"pending","activeForm":"Running tests"}]}}]}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 1, "expected one event, got {ev:?}");
        assert_eq!(ev[0]["kind"], "todo");
        let items = ev[0]["items"].as_array().expect("items array");
        assert_eq!(items.len(), 3);
        assert_eq!(items[0]["content"], "Read the file");
        assert_eq!(items[0]["status"], "completed");
        assert_eq!(items[1]["activeForm"], "Editing beta");
        assert_eq!(items[2]["status"], "pending");
    }

    #[test]
    fn claude_todo_tools_never_emit_a_tool_row() {
        // The regression this guards: a TodoWrite falling through to the
        // ordinary tool path, which produced a collapsed "TodoWrite" row the
        // reader had to click before they could see the plan.
        for name in ["TodoWrite", "TaskCreate", "TaskUpdate"] {
            let line = format!(
                r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","id":"t1","name":"{name}","input":{{"todos":[],"subject":"x","status":"pending"}}}}]}}}}"#
            );
            let ev = claude_events_from_line(&line);
            assert!(
                ev.iter().all(|e| e["kind"] != "tool"),
                "{name} leaked a tool row: {ev:?}"
            );
        }
    }

    #[test]
    fn claude_task_update_accepts_all_id_spellings() {
        // The SDK docs note Claude Code repairs id/task_id to taskId before
        // execution but that the repair is NOT reflected in the stream, so all
        // three spellings have to be read.
        for key in ["taskId", "id", "task_id"] {
            let input = json!({ key: "7", "status": "completed" });
            let out = claude_todo_snapshot("TaskUpdate", &input).expect("snapshot");
            assert_eq!(out[0]["id"], "7", "key {key} not read");
            assert_eq!(out[0]["status"], "completed");
        }
    }

    #[test]
    fn claude_todo_snapshot_ignores_ordinary_tools() {
        // Any other tool must be left alone so the tool-row path is untouched.
        let input = json!({ "command": "ls" });
        assert!(claude_todo_snapshot("Bash", &input).is_none());
        assert!(claude_todo_snapshot("Edit", &input).is_none());
    }

    #[test]
    fn todo_result_is_not_emitted_as_a_nameless_tool_row() {
        // The regression: TodoWrite became a checklist, but its tool_result then
        // arrived on a later line and was rendered as a tool row with no name,
        // carrying only "Todos have been modified successfully". The checklist
        // appeared WITH a piece of machinery beside it.
        let mut seen = std::collections::HashSet::new();
        let use_line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tu_1","name":"TodoWrite","input":{"todos":[{"content":"a","status":"pending"}]}}]}}"#;
        let ev1 = claude_events_from_line_skip(use_line, &mut seen);
        assert_eq!(ev1.len(), 1);
        assert_eq!(ev1[0]["kind"], "todo");

        let result_line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu_1","content":"Todos have been modified successfully."}]}}"#;
        let ev2 = claude_events_from_line_skip(result_line, &mut seen);
        assert!(ev2.is_empty(), "todo result leaked a tool row: {ev2:?}");
    }

    #[test]
    fn an_ordinary_tools_result_still_arrives() {
        // The skip must be narrow: every other tool's result is the payload the
        // reader actually opened the row for.
        let mut seen = std::collections::HashSet::new();
        let use_line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tu_2","name":"Bash","input":{"command":"ls"}}]}}"#;
        claude_events_from_line_skip(use_line, &mut seen);
        let result_line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu_2","content":"file.txt"}]}}"#;
        let ev = claude_events_from_line_skip(result_line, &mut seen);
        assert_eq!(ev.len(), 1, "ordinary tool result was dropped: {ev:?}");
        assert_eq!(ev[0]["kind"], "tool");
    }

    #[test]
    fn resume_flag_is_passed_through() {
        // Verified against the real binary: a session told "remember the name
        // Zephyr" answers "Zephyr." when a later run passes --resume with that
        // session id. Without the flag the context built up in a terminal is
        // stranded there.
        let a = build_args("claude", "hi", None, None, Some("2df728d2-fb47-4934-92d0-e6205a1fd603"));
        let pos = a.iter().position(|x| x == "--resume").expect("--resume present");
        assert_eq!(a[pos + 1], "2df728d2-fb47-4934-92d0-e6205a1fd603");
    }

    #[test]
    fn empty_resume_id_is_ignored() {
        // An empty string would produce a bare `--resume` with no id, which the
        // CLI rejects - so a blank value must add no flag at all.
        let a = build_args("claude", "hi", None, None, Some(""));
        assert!(!a.iter().any(|x| x == "--resume"), "empty id added a flag: {a:?}");
        let b = build_args("claude", "hi", None, None, None);
        assert!(!b.iter().any(|x| x == "--resume"), "None added a flag: {b:?}");
    }

    #[test]
    fn result_line_reports_usage() {
        // The context meter read 0% forever because the only frame carrying the
        // numbers - the closing `result` line - was discarded.
        let line = r#"{"type":"result","subtype":"success","num_turns":3,"total_cost_usd":0.0123,"usage":{"input_tokens":39088,"cache_read_input_tokens":1200,"cache_creation_input_tokens":300,"output_tokens":42}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 1, "expected one event, got {ev:?}");
        assert_eq!(ev[0]["kind"], "usage");
        // Cache reads and writes fold into input: same tokens, cheaper rate.
        assert_eq!(ev[0]["input"], 39088 + 1200 + 300);
        assert_eq!(ev[0]["output"], 42);
        assert_eq!(ev[0]["turns"], 3);
    }

    #[test]
    fn result_line_without_usage_emits_nothing() {
        // Emitting zeros would read as "this turn was free".
        let line = r#"{"type":"result","subtype":"success","num_turns":1}"#;
        let ev = claude_events_from_line(line);
        assert!(ev.is_empty(), "emitted a zero usage: {ev:?}");
    }

    #[test]
    fn claude_edit_tool_carries_diff_halves() {
        // An Edit tool_use must surface old/new halves so the UI draws a diff.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Edit","input":{"file_path":"/a.txt","old_string":"line two","new_string":"LINE TWO EDITED"}}]}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0]["tool"]["diffOld"], "line two");
        assert_eq!(ev[0]["tool"]["diffNew"], "LINE TWO EDITED");
        assert_eq!(ev[0]["tool"]["path"], "/a.txt");
        // A Write is a whole new file: old half empty, new half = content.
        let w = claude_events_from_line(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"/b.txt","content":"hello\nworld"}}]}}"#,
        );
        assert_eq!(w[0]["tool"]["diffOld"], "");
        assert_eq!(w[0]["tool"]["diffNew"], "hello\nworld");
        // A Bash tool must NOT get diff halves.
        let b = claude_events_from_line(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t3","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert!(b[0]["tool"].get("diffOld").is_none());
    }

    #[test]
    fn claude_events_tool_result_closes_call() {
        // String form.
        let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"total 2\n."}]}}"#;
        let ev = claude_events_from_line(line);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0]["tool"]["callId"], "toolu_1");
        assert_eq!(ev[0]["tool"]["status"], "ok");
        assert_eq!(ev[0]["tool"]["output"], "total 2\n.");
        // Array-of-blocks form, flagged as an error.
        let line2 = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","is_error":true,"content":[{"type":"text","text":"boom"}]}]}}"#;
        let ev2 = claude_events_from_line(line2);
        assert_eq!(ev2[0]["tool"]["status"], "fail");
        assert_eq!(ev2[0]["tool"]["output"], "boom");
    }

    #[test]
    fn codex_events_command_and_message() {
        let start = r#"{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls","status":"in_progress"}}"#;
        let ev = codex_events_from_line(start);
        assert_eq!(ev[0]["tool"]["callId"], "item_1");
        assert_eq!(ev[0]["tool"]["status"], "running");
        let done = r#"{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"ls","aggregated_output":"a\nb","exit_code":0,"status":"completed"}}"#;
        let ev2 = codex_events_from_line(done);
        assert_eq!(ev2[0]["tool"]["status"], "ok");
        assert_eq!(ev2[0]["tool"]["output"], "a\nb");
        let msg = r#"{"type":"item.completed","item":{"id":"item_9","type":"agent_message","text":"done"}}"#;
        let ev3 = codex_events_from_line(msg);
        assert_eq!(ev3[0]["kind"], "text");
        assert_eq!(ev3[0]["text"], "done");
    }

    #[test]
    fn recipe_known_and_unknown() {
        assert!(recipe("claude").is_some());
        assert!(recipe("codex").is_some());
        assert!(recipe("gemini").is_none());
    }

    #[test]
    fn pretty_model_names() {
        assert_eq!(pretty_model("claude-opus-4-8"), "Opus 4.8");
        assert_eq!(pretty_model("claude-sonnet-5"), "Sonnet 5");
        assert_eq!(pretty_model("claude-3-5-haiku"), "3 5.haiku");
        assert_eq!(pretty_model("opus"), "Opus");
    }

    #[test]
    fn build_args_folds_model_and_mode() {
        // Claude: --model and --permission-mode are added only when chosen.
        let a = build_args("claude", "hi", Some("opus"), Some("plan"), None);
        assert!(a.contains(&"--model".to_string()) && a.contains(&"opus".to_string()));
        assert!(a.contains(&"--permission-mode".to_string()) && a.contains(&"plan".to_string()));
        // A "default" selection adds no flag — the CLI uses its own default.
        let b = build_args("claude", "hi", Some("default"), None, None);
        assert!(!b.contains(&"--model".to_string()));
        assert!(!b.contains(&"--permission-mode".to_string()));
        // Codex: prompt stays last, model flag precedes it when set.
        let c = build_args("codex", "hi", Some("gpt-5"), None, None);
        assert_eq!(c.last().map(String::as_str), Some("hi"));
        assert!(c.contains(&"--model".to_string()) && c.contains(&"gpt-5".to_string()));
    }

    #[test]
    fn toml_top_string_reads_scalars_before_tables() {
        let doc = r#"
# a comment
model = "deepseek-v4.1-flash"
model_reasoning_effort = "minimal"  # inline comment
model_provider = 'modelrouter'

[model_providers.modelrouter]
model = "should-not-be-read"
"#;
        assert_eq!(toml_top_string(doc, "model").as_deref(), Some("deepseek-v4.1-flash"));
        assert_eq!(toml_top_string(doc, "model_reasoning_effort").as_deref(), Some("minimal"));
        assert_eq!(toml_top_string(doc, "model_provider").as_deref(), Some("modelrouter"));
        assert_eq!(toml_top_string(doc, "absent"), None);
    }

    #[test]
    fn last_model_in_file_takes_final_turn() {
        // Two turn_context lines: the picker should report the LAST model.
        let dir = std::env::temp_dir().join(format!("zephyr-codex-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rollout.jsonl");
        std::fs::write(
            &path,
            "{\"type\":\"turn_context\",\"payload\":{\"model\":\"gpt-5.5\",\"effort\":\"low\"}}\n\
             {\"type\":\"turn_context\",\"payload\":{\"model\":\"gpt-6-astra\",\"effort\":\"high\"}}\n",
        )
        .unwrap();
        assert_eq!(last_model_in_file(&path).as_deref(), Some("gpt-6-astra"));
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }
}
