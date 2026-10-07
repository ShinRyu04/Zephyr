import { create } from 'zustand';
import * as cmd from './commands';
import { onCliChatChunk, type CliEvent } from './events';
import { useStore } from './store';
import type { CliModel } from './cliCatalog';

/*
 * Native chat UI for a hosted CLI (Cara B).
 *
 * The CLI runs headless (`cli_chat` in Rust) and its answer is streamed back on
 * the `cli-chat-chunk` event; this store collects it into ordinary chat
 * messages so <CliChat/> can paint Zephyr's own bubbles instead of a terminal.
 *
 * Beyond the plain answer text, the stream now carries STRUCTURED events —
 * thinking, tool calls (with their input/output/exit code) and file-edit diffs
 * — exactly as the real CLI emits them. Those are collected into an ordered
 * `parts[]` timeline on the assistant message so the UI can render the same
 * thinking blocks / tool rows / diffs the desktop app shows, instead of a wall
 * of text. `content` stays the concatenated answer text for copy/title/export.
 *
 * Like Zephyr's own AI panel, each agent keeps MANY sessions: a conversation
 * starts fresh ("New chat"), can be switched between via a history list, and the
 * tab title follows the first message. Sessions are persisted to localStorage
 * so a reload does not lose the history — login/credentials stay the CLI's own
 * responsibility, this only stores the transcript the user already saw.
 */

/**
 * One entry in an assistant message's ordered timeline.
 *
 * The parts are appended in arrival order, so rendering them top-to-bottom
 * reproduces how the turn actually unfolded: a line of narration, a tool call
 * and its result, more narration, a diff, the final answer. A `tool` part is
 * mutated in place (upserted by `callId`) as it goes from running to done.
 */
export type CliTodo = {
  /** The imperative label ("Run tests"). */
  content: string;
  /** The present-continuous label ("Running tests"), used while in progress. */
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted' | string;
  id: string;
};

export type CliPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'error'; text: string }
  /*
   * The agent's task list, replaced wholesale each time it is written.
   *
   * TodoWrite sends the COMPLETE list on every call, so the newest snapshot is
   * the whole truth and there is nothing to merge — the part is replaced, not
   * appended. Keeping the previous lists would render a history of plans
   * instead of the current one, which is the opposite of what a checklist is
   * for.
   */
  | { type: 'todo'; items: CliTodo[] }
  | {
      type: 'tool';
      callId: string;
      name: string;
      title?: string;
      input?: string;
      status: 'running' | 'ok' | 'fail';
      output?: string;
      exitCode?: number | null;
      diffOld?: string;
      diffNew?: string;
      path?: string;
    };

export interface CliMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  /**
   * The structured timeline (thinking / tool / diff / text), in arrival order.
   * Absent on user messages and on assistant messages restored from an older
   * version — the renderer falls back to `content` when there are no parts.
   */
  parts?: CliPart[];
  /**
   * Marked by the reader for coming back to.
   *
   * A bookmark is a property of the MESSAGE, not a separate list, because the
   * only thing a bookmark is good for is jumping to it — a parallel array of
   * ids would need reconciling on every rewind and compact, and would silently
   * point at messages that no longer exist after either.
   */
  bookmark?: boolean;
}

export interface CliSession {
  id: string;
  /** Follows the first user message; "New chat" until then. */
  title: string;
  messages: CliMsg[];
  /** The request id of the in-flight run, or null when idle. */
  pending: string | null;
  /** stderr collected during the current run, shown only if it errored. */
  stderr: string;
  /** Epoch ms the session was created — history is sorted newest first. */
  createdAt: number;
}

/*
 * The composer settings the user picks per CLI (model, permission mode, effort
 * dial, Ultracode). They are passed straight to the CLI on the next send, and
 * kept in localStorage so a reload does not reset the picker — they are editor
 * preferences, not secrets. `model`/`mode` default to 'default', meaning "add
 * no flag, use the CLI's own default".
 */
export interface CliOpts {
  model: string;
  mode: string;
  effort: number;
  ultracode: boolean;
}

const DEFAULT_OPTS: CliOpts = { model: 'default', mode: 'default', effort: 0, ultracode: false };

const OPTS_KEY = 'zephyr.aiCliOpts.v1';
const SESS_KEY = 'zephyr.aiCliSessions.v1';

function loadOpts(): Record<string, CliOpts> {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, Partial<CliOpts>>;
    const out: Record<string, CliOpts> = {};
    for (const [k, v] of Object.entries(p)) out[k] = { ...DEFAULT_OPTS, ...v };
    return out;
  } catch {
    return {};
  }
}

function persistOpts(opts: Record<string, CliOpts>): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {
    /* storage blocked — the picker is not critical */
  }
}

interface Persisted {
  sessions: Record<string, CliSession[]>;
  activeId: Record<string, string>;
}

function loadSessions(): Persisted {
  try {
    const raw = localStorage.getItem(SESS_KEY);
    if (!raw) return { sessions: {}, activeId: {} };
    const p = JSON.parse(raw) as Partial<Persisted>;
    const sessions: Record<string, CliSession[]> = {};
    for (const [agentId, list] of Object.entries(p.sessions ?? {})) {
      sessions[agentId] = (list ?? [])
        /* A run never survives a reload: anything that was pending is dead the
           moment the window closed, so it loads back as idle. */
        .map((s) => ({ ...s, pending: null, stderr: '' }))
        .slice(-30);
    }
    return { sessions, activeId: p.activeId ?? {} };
  } catch {
    return { sessions: {}, activeId: {} };
  }
}

function persistSessions(sessions: Record<string, CliSession[]>, activeId: Record<string, string>): void {
  try {
    /* Keep the store small: at most 30 sessions per agent, and drop the live
       `pending`/`stderr` which only mean anything within a single run. */
    const trimmed: Record<string, CliSession[]> = {};
    for (const [agentId, list] of Object.entries(sessions)) {
      trimmed[agentId] = list.slice(-30).map((s) => ({ ...s, pending: null, stderr: '' }));
    }
    localStorage.setItem(SESS_KEY, JSON.stringify({ sessions: trimmed, activeId }));
  } catch {
    /* storage blocked — history is a convenience, not critical */
  }
}

/** A short header taken from the first user line, like Zephyr's own chat. */
function titleFromPrompt(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

interface AiCliState {
  /** Every session per agent, oldest first. */
  sessions: Record<string, CliSession[]>;
  /** The id of the session on screen, per agent. */
  activeId: Record<string, string>;
  /** Per-agent composer selection (model / mode / effort / ultracode). */
  opts: Record<string, CliOpts>;
  /**
   * The live model list fetched from the backend per agent, mirroring what the
   * logged-in CLI account can use. Empty until `loadModels` fills it; the UI
   * falls back to cliCatalog's static list meanwhile.
   */
  models: Record<string, CliModel[]>;
  /** Ensure an agent has at least one session and return the active one. */
  active: (agentId: string) => CliSession;
  optsFor: (agentId: string) => CliOpts;
  setOpts: (agentId: string, patch: Partial<CliOpts>) => void;
  loadModels: (agentId: string) => Promise<void>;
  newSession: (agentId: string) => void;
  selectSession: (agentId: string, id: string) => void;
  deleteSession: (agentId: string, id: string) => void;
  /**
   * Send a prompt. `cwd` overrides the working folder for this run only;
   * omitted, it follows the open workspace. A caller that needs the agent to
   * work somewhere specific (a test sandbox) has no other way to say so.
   */
  send: (agentId: string, prompt: string, opts?: { cwd?: string }) => Promise<void>;
  cancel: (agentId: string) => void;
  /** Clear the current conversation — same as starting a new session. */
  clear: (agentId: string) => void;
  /**
   * Trim the transcript to save context.
   *
   * `/compact` in the real CLI asks the model to summarize the conversation and
   * then continues from the summary. Zephyr's hosted tab keeps its OWN
   * transcript and the CLI process is one-shot per prompt, so there is nothing
   * on the CLI side to compact — but the user's intent is context, and the part
   * Zephyr owns is the visible history. Keeping the tail (which is what the
   * next prompt's context is actually built from) and marking the cut is the
   * faithful version of that intent here.
   */
  compact: (agentId: string) => void;
  /** Mark or unmark a message so the reader can find it again. */
  toggleBookmark: (agentId: string, msgId: string) => void;
  /**
   * Roll the conversation back to just before a message, dropping everything
   * after it.
   *
   * This is the destructive half of the feature — the messages after the cut
   * are gone, not hidden — so the caller is expected to confirm first. It exists
   * because the alternative is worse: without it, a run that went wrong can only
   * be recovered by starting a new session and losing the context that made the
   * question worth asking.
   */
  rewindTo: (agentId: string, msgId: string) => void;
}

const EMPTY_LIST: CliSession[] = [];
let seq = 0;
const rid = () => `clichat-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function freshSession(): CliSession {
  return { id: rid(), title: 'New chat', messages: [], pending: null, stderr: '', createdAt: Date.now() };
}

const boot = loadSessions();

export const useAiCli = create<AiCliState>((set, get) => ({
  sessions: boot.sessions,
  activeId: boot.activeId,
  opts: loadOpts(),
  models: {},

  active: (agentId) => {
    const list = get().sessions[agentId] ?? [];
    const id = get().activeId[agentId];
    const found = list.find((s) => s.id === id);
    if (found) return found;
    /* No session yet (first open, or a cleared agent): make one so callers
       always get a real session to read from. */
    const s = freshSession();
    set((st) => {
      const sessions = { ...st.sessions, [agentId]: [...(st.sessions[agentId] ?? []), s] };
      const activeId = { ...st.activeId, [agentId]: s.id };
      persistSessions(sessions, activeId);
      return { sessions, activeId };
    });
    return s;
  },

  optsFor: (agentId) => get().opts[agentId] ?? DEFAULT_OPTS,

  setOpts: (agentId, patch) =>
    set((s) => {
      const next = { ...(s.opts[agentId] ?? DEFAULT_OPTS), ...patch };
      const opts = { ...s.opts, [agentId]: next };
      persistOpts(opts);
      return { opts };
    }),

  /*
   * Fetch the account's live model list once per agent.
   *
   * The backend reads the CLI's own config so the picker mirrors what a terminal
   * run would see (real names like "Opus 4.8", the configured default). On any
   * failure we leave the slot empty and the UI keeps cliCatalog's static list —
   * the picker must never end up blank just because the backend could not be
   * asked.
   */
  loadModels: async (agentId) => {
    if (get().models[agentId]?.length) return;
    try {
      const list = await cmd.cliModels(agentId);
      if (Array.isArray(list) && list.length) {
        set((s) => ({ models: { ...s.models, [agentId]: list } }));
      }
    } catch {
      /* keep the static fallback */
    }
  },

  newSession: (agentId) =>
    set((s) => {
      const list = s.sessions[agentId] ?? [];
      /* Reuse an empty "New chat" at the end rather than piling blanks: pressing
         New twice should not leave two empty sessions in the history. */
      const lastEmpty = list.length && list[list.length - 1].messages.length === 0
        ? list[list.length - 1]
        : null;
      const target = lastEmpty ?? freshSession();
      const sessions = {
        ...s.sessions,
        [agentId]: lastEmpty ? list : [...list, target],
      };
      const activeId = { ...s.activeId, [agentId]: target.id };
      persistSessions(sessions, activeId);
      return { sessions, activeId };
    }),

  selectSession: (agentId, id) =>
    set((s) => {
      if (!(s.sessions[agentId] ?? []).some((x) => x.id === id)) return {} as never;
      const activeId = { ...s.activeId, [agentId]: id };
      persistSessions(s.sessions, activeId);
      return { activeId };
    }),

  deleteSession: (agentId, id) =>
    set((s) => {
      const list = (s.sessions[agentId] ?? []).filter((x) => x.id !== id);
      const sessions = { ...s.sessions, [agentId]: list };
      let activeId = s.activeId;
      if (s.activeId[agentId] === id) {
        /* Fall back to the newest remaining session, or none. */
        activeId = { ...s.activeId, [agentId]: list[list.length - 1]?.id ?? '' };
      }
      persistSessions(sessions, activeId);
      return { sessions, activeId };
    }),

  send: async (agentId, prompt, opts) => {
    const teks = prompt.trim();
    if (!teks) return;
    const cur = get().active(agentId);
    if (cur.pending) return;

    const reqId = rid();
    const userMsg: CliMsg = { id: rid(), role: 'user', content: teks };
    const botMsg: CliMsg = { id: reqId, role: 'assistant', content: '' };
    set((s) => {
      const list = (s.sessions[agentId] ?? []).map((x) =>
        x.id === cur.id
          ? {
              ...x,
              title: x.messages.length === 0 ? titleFromPrompt(teks) : x.title,
              messages: [...x.messages, userMsg, botMsg],
              pending: reqId,
              stderr: '',
            }
          : x,
      );
      const sessions = { ...s.sessions, [agentId]: list };
      persistSessions(sessions, s.activeId);
      return { sessions };
    });

    const o = get().opts[agentId] ?? DEFAULT_OPTS;
    try {
      await cmd.cliChat({
        id: reqId,
        agentId,
        prompt: teks,
        cwd: opts?.cwd ?? useStore.getState().workspace ?? undefined,
        model: o.model !== 'default' ? o.model : undefined,
        mode: o.mode !== 'default' ? o.mode : undefined,
      });
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      set((s) => {
        const list = (s.sessions[agentId] ?? []).map((x) =>
          x.id === cur.id
            ? {
                ...x,
                pending: null,
                messages: x.messages.map((mm) =>
                  mm.id === reqId ? { ...mm, content: msg, error: true } : mm,
                ),
              }
            : x,
        );
        return { sessions: { ...s.sessions, [agentId]: list } };
      });
    }
  },

  cancel: (agentId) => {
    const cur = get().active(agentId);
    if (!cur.pending) return;
    void cmd.cliChatCancel(cur.pending).catch(() => {});
    set((s) => {
      const list = (s.sessions[agentId] ?? []).map((x) =>
        x.id === cur.id ? { ...x, pending: null } : x,
      );
      return { sessions: { ...s.sessions, [agentId]: list } };
    });
  },

  clear: (agentId) => get().newSession(agentId),

  compact: (agentId) => {
    /* How many turns survive. Enough to keep the thread intelligible without
       keeping the whole run: the reader usually compacts precisely because the
       panel has become long. */
    const KEEP = 4;
    set((s) => {
      const list = s.sessions[agentId] ?? [];
      const rid0 = s.activeId[agentId];
      return {
        sessions: {
          ...s.sessions,
          [agentId]: list.map((sess) => {
            if (sess.id !== rid0) return sess;
            const keep = sess.messages.slice(-KEEP);
            if (keep.length === sess.messages.length) return sess;
            const dropped = sess.messages.length - keep.length;
            /* A visible marker, not a silent cut. Discovering later that the
               history is shorter than remembered, with nothing saying why,
               reads as messages having been lost. */
            const note: CliMsg = {
              id: `compact-${Date.now().toString(36)}`,
              role: 'assistant',
              content: `— ${dropped} earlier messages compacted —`,
            };
            return { ...sess, messages: [note, ...keep] };
          }),
        },
      };
    });
  },
  toggleBookmark: (agentId, msgId) => {
    set((s) => ({
      sessions: {
        ...s.sessions,
        [agentId]: (s.sessions[agentId] ?? []).map((sess) => ({
          ...sess,
          messages: sess.messages.map((m) => (m.id === msgId ? { ...m, bookmark: !m.bookmark } : m)),
        })),
      },
    }));
  },

  rewindTo: (agentId, msgId) => {
    set((s) => ({
      sessions: {
        ...s.sessions,
        [agentId]: (s.sessions[agentId] ?? []).map((sess) => {
          const cut = sess.messages.findIndex((m) => m.id === msgId);
          /* Not found means the message was already removed - leave the session
             alone rather than truncating to -1, which would empty it. */
          if (cut < 0) return sess;
          /*
           * The message itself goes too.
           *
           * The control sits on the assistant reply, and the reader is looking
           * at a reply they want gone — keeping it would leave the very answer
           * they rejected at the end of the trimmed thread. The question that
           * produced it is already the last user message above the cut, so the
           * session is left ready to ask again.
           */
          return { ...sess, messages: sess.messages.slice(0, cut) };
        }),
      },
    }));
  },
}));

/*
 * Find the session a request id belongs to (chunks only carry the request id).
 * Returns the agent and session so the listener can update exactly one.
 */
function sessionForReq(reqId: string): { agentId: string; sessionId: string } | null {
  const sessions = useAiCli.getState().sessions;
  for (const [agentId, list] of Object.entries(sessions)) {
    for (const s of list) {
      if (s.pending === reqId || s.messages.some((m) => m.id === reqId)) {
        return { agentId, sessionId: s.id };
      }
    }
  }
  return null;
}

/**
 * Apply one structured event onto an assistant message, returning a NEW message
 * (immutably) with its `parts[]` and `content` updated.
 *
 * Rules (see the frozen event contract):
 *  - text     : append to content AND to the trailing text part (or push one).
 *  - thinking : append to the trailing thinking part (or push one).
 *  - tool     : upsert by callId — a `running` start creates the row, the
 *               `ok`/`fail` close merges output/exit/diff into the same row.
 *  - error    : push an error part.
 *
 * Consecutive deltas of the same kind coalesce into one part so a token-by-token
 * stream does not explode into hundreds of one-character parts.
 */
function applyCliEvent(msg: CliMsg, ev: CliEvent): CliMsg {
  const parts: CliPart[] = msg.parts ? msg.parts.slice() : [];
  const last = parts[parts.length - 1];
  let content = msg.content;

  if (ev.kind === 'text') {
    content += ev.text;
    if (last && last.type === 'text') parts[parts.length - 1] = { ...last, text: last.text + ev.text };
    else parts.push({ type: 'text', text: ev.text });
  } else if (ev.kind === 'thinking') {
    if (last && last.type === 'thinking') parts[parts.length - 1] = { ...last, text: last.text + ev.text };
    else parts.push({ type: 'thinking', text: ev.text });
  } else if (ev.kind === 'error') {
    parts.push({ type: 'error', text: ev.text });
  } else if (ev.kind === 'todo') {
    /*
     * Replace the LAST todo part rather than pushing another.
     *
     * TodoWrite fires several times in a run — once to lay out the plan, then
     * again on each status change — and each call carries the whole list. Push
     * them all and the transcript grows a checklist per step, all but the last
     * of them stale. Replacing in place keeps ONE checklist that updates, which
     * is what the reader watches while the agent works.
     */
    const idx = parts.findIndex((p) => p.type === 'todo');
    const part = { type: 'todo' as const, items: ev.items };
    if (idx >= 0) parts[idx] = part;
    else parts.push(part);
  } else {
    // tool: upsert by callId.
    const t = ev.tool;
    const idx = parts.findIndex((p) => p.type === 'tool' && p.callId === t.callId);
    if (idx >= 0) {
      const prev = parts[idx] as Extract<CliPart, { type: 'tool' }>;
      parts[idx] = {
        ...prev,
        // A close event carries an empty name; keep the one from the start.
        name: t.name || prev.name,
        title: t.title ?? prev.title,
        input: t.input ?? prev.input,
        status: t.status,
        output: t.output ?? prev.output,
        exitCode: t.exitCode ?? prev.exitCode,
        diffOld: t.diffOld ?? prev.diffOld,
        diffNew: t.diffNew ?? prev.diffNew,
        path: t.path ?? prev.path,
      };
    } else {
      parts.push({ type: 'tool', ...t });
    }
  }
  return { ...msg, parts, content };
}

/*
 * One chunk listener per process, guarded like `pty-output` / `ai-chunk`:
 * StrictMode mounts twice in dev and would otherwise double every token.
 */
let bound = false;
export function bindCliChatListener(): void {
  if (bound) return;
  bound = true;
  void onCliChatChunk((chunk) => {
    const found = sessionForReq(chunk.id);
    if (!found) return;
    const { agentId, sessionId } = found;
    useAiCli.setState((s) => {
      const list = s.sessions[agentId] ?? [];
      const next = list.map((sess) => {
        if (sess.id !== sessionId) return sess;
        let messages = sess.messages;
        let stderr = sess.stderr;
        let pending = sess.pending;

        /* A structured event (thinking / tool / diff / text) builds the message
           timeline; plain `text` still appends to content for back-compat. */
        if (chunk.event) {
          messages = messages.map((m) =>
            m.id === chunk.id ? applyCliEvent(m, chunk.event!) : m,
          );
        }
        if (chunk.text) {
          messages = messages.map((m) =>
            m.id === chunk.id
              ? applyCliEvent(m, { kind: 'text', text: chunk.text! })
              : m,
          );
        }
        if (chunk.stderr) {
          stderr = stderr + chunk.stderr + '\n';
        }
        if (chunk.done) {
          pending = null;
          /* If the run produced no assistant text, surface stderr as the error
             so the bubble is never left blank. */
          messages = messages.map((m) => {
            if (m.id !== chunk.id) return m;
            if (m.content.trim() || (m.parts && m.parts.length > 0)) return m;
            return {
              ...m,
              content: chunk.cancelled
                ? 'Stopped.'
                : stderr.trim() || 'The CLI did not return any text.',
              error: !chunk.cancelled,
            };
          });
        }
        return { ...sess, messages, stderr, pending };
      });
      const sessions = { ...s.sessions, [agentId]: next };
      /* Persist only when the run finished, not on every token. */
      if (chunk.done) persistSessions(sessions, s.activeId);
      return { sessions };
    });
  });
}

export { EMPTY_LIST };
