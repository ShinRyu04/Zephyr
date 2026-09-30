import { create } from 'zustand';

/*
 * Request log for the AI panel.
 *
 * When an answer comes back wrong — empty, truncated, cut mid-word, or phrased
 * as if a tool ran when it did not — the cause is almost always in the request
 * that was sent: which provider, which model id, how many messages, whether the
 * stream ended. None of that was visible anywhere in the app, so a bad answer
 * could only be guessed at.
 *
 * This keeps the last N exchanges in memory, in the order they were sent, with
 * the numbers that explain a bad reply: status, duration, chunk count, byte
 * count, and the error text if one arrived. Nothing is written to disk and the
 * message bodies are truncated — this is a debugging aid, not a transcript
 * store, and the panel must not become a second copy of the conversation.
 */

/** One request/response pair, as the panel lists it. */
export interface ReqLog {
  id: string;
  /** Epoch ms when the request went out. */
  at: number;
  provider: string;
  model: string;
  /** "chat" for the panel, "agent" for a tool-using turn. */
  kind: 'chat' | 'agent' | 'subagent';
  /** Messages sent, including the system turn. */
  pesan: number;
  /** Total characters across the outgoing messages. */
  chars: number;
  /** Set when the request finishes; null while in flight. */
  ms: number | null;
  /** Streamed chunks seen. */
  chunk: number;
  /** Characters received. */
  balas: number;
  /** Terminal state: ok, error, or cancelled. */
  status: 'jalan' | 'ok' | 'error' | 'batal';
  error?: string;
}

/** Ring buffer size. Older entries fall off; the panel says so in its header. */
export const LOG_MAKS = 40;

interface AiDebugState {
  buka: boolean;
  /** Newest first, so the panel lists without reversing. */
  log: ReqLog[];
  /** Id of the row expanded in the panel, or null. */
  pilih: string | null;

  setBuka: (v: boolean) => void;
  toggle: () => void;
  setPilih: (id: string | null) => void;

  mulai: (r: Omit<ReqLog, 'at' | 'ms' | 'chunk' | 'balas' | 'status'>) => void;
  /** Add a chunk to an in-flight request. */
  potong: (id: string, n: number) => void;
  /** Close a request. `balas` is the final character count. */
  selesai: (id: string, status: ReqLog['status'], balas: number, error?: string) => void;
  bersih: () => void;
}

export const useAiDebug = create<AiDebugState>((set, get) => ({
  buka: false,
  log: [],
  pilih: null,

  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
  setPilih: (id) => set({ pilih: id }),

  mulai: (r) =>
    set((s) => ({
      log: [
        { ...r, at: Date.now(), ms: null, chunk: 0, balas: 0, status: 'jalan' as const },
        ...s.log,
      ].slice(0, LOG_MAKS),
    })),

  potong: (id, n) =>
    set((s) => ({
      log: s.log.map((r) => (r.id === id ? { ...r, chunk: r.chunk + 1, balas: r.balas + n } : r)),
    })),

  selesai: (id, status, balas, error) =>
    set((s) => ({
      log: s.log.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              balas: balas || r.balas,
              /* Duration is measured from `at`, not accumulated per chunk, so a
                 long pause between chunks is visible as time rather than as
                 something the reader has to add up. */
              ms: r.ms ?? Date.now() - r.at,
              ...(error ? { error } : {}),
            }
          : r,
      ),
    })),

  bersih: () => set({ log: [], pilih: null }),
}));
