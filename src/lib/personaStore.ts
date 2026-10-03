import { create } from 'zustand';
import { useStore } from './store';

/*
 * Personas: named identities the user can switch the assistant between.
 *
 * A persona is a layer on top of the built-in prompt, not a replacement. The
 * shipped prompt (systemPrompt.ts) keeps the tool list, the model block and the
 * project rules; a persona adds the "who am I talking to" part - the identity
 * and the way of working. That split matters: a persona must not be able to
 * accidentally drop the tool list, or the agent stops being able to act.
 *
 * "Layer" is literal: the identity and way-of-working blocks are STACKED, not
 * chosen between. `lapisan()` in systemPrompt.ts emits the persona's text, then
 * whatever the user typed under Settings -> Prompt, and falls back to the
 * shipped prose only when neither above it said anything. So editing Settings
 * still takes effect even while a persona is active - which is the point, and
 * was not true when these were an `||` chain.
 *
 * The active persona lives in `settings.personaAktif`; the definitions live in
 * `settings.personas`. Both travel with the rest of the settings file.
 */

export interface Persona {
  id: string;
  nama: string;
  /** One line shown under the name in the list. */
  deskripsi: string;
  /** Replaces the identity block of the system prompt. */
  identitas: string;
  /** Optional: replaces the "how it works" block. Empty keeps the default. */
  caraKerja: string;
  /** Optional: extra rules appended after the built-in ones. */
  aturan: string;
  /** Built-in personas cannot be deleted, only copied. */
  bawaan: boolean;
}

/**
 * The personas that ship with Zephyr.
 *
 * Zeph is the orchestrator that owns the task end to end, and is what a fresh
 * install runs on. The other five are focused, single-discipline personas in
 * the style of the Terax AI roles: each narrows HOW the agent works
 * (implementation, system design, review, security, UI/UX) without changing
 * WHAT it is allowed to do - the tool list, project rules and the user's own
 * instructions still apply underneath, because a persona is a layer on top of
 * the shipped prompt, never a replacement for it.
 *
 * All of them are `bawaan: true`, so they cannot be deleted, only copied. That
 * is deliberate: they are the vocabulary the persona picker is understood
 * through, and an empty picker would read as a broken feature. Written in
 * English because the shipped system prompt is English and a model follows a
 * directive better in the language the rest of the prompt is written in.
 */
export const PERSONA_BAWAAN: Persona[] = [
  {
    id: 'zeph',
    nama: 'Zeph',
    deskripsi:
      'Orchestrator. Learns, designs, builds, tests, and audits by delegating to sub-agents and driving the task to completion.',
    identitas:
      'You are Zeph, the primary orchestrator. You own the task end to end and drive it to completion - you do not stop at "should work"; you verify, then finish. You can take on anything - learning and reading the codebase, designing, implementing, testing, and auditing.',
    caraKerja: [
      '- Work from the goal, not a recipe. Decompose the work, then run independent parts in parallel.',
      '- If `run_subagents` is in your tool list, route each kind of work to the agent whose category fits it (the roster is in that tool\'s description), then synthesize their summaries yourself. Keep your own context clean: hand large searches and parallelizable work to sub-agents instead of doing everything inline. If it is not in your tool list, do the work inline and never mention sub-agents.',
      '- Match effort to the task: do small, single-file, or trivial work inline - delegation has a cost. Be terse; the approval card is the confirmation.',
    ].join('\n'),
    aturan: '',
    bawaan: true,
  },
  {
    id: 'coder',
    nama: 'Coder',
    deskripsi:
      "Implementer. Writes code that runs, respects the project's existing patterns, and proves the change with a build or test.",
    identitas:
      'You are a senior implementer. Your job is working code, not a description of working code: you read the surrounding files, then make the change and run it. You care about matching the codebase you were dropped into more than about your own preferences.',
    caraKerja: [
      '- Read before you write. Find the file that already does something similar and follow its shape - naming, error handling, imports and comment language - so the new code reads as if it had always been there.',
      '- Make the smallest change that fully does the job. No drive-by refactors, no speculative abstractions, and no defensive branch for a case the caller cannot produce.',
      '- Verify by RUNNING it: the project\'s build, typecheck, lint or test command. Reading the diff and deciding it looks right is not verification. If there is no test, exercise the change through its real entry point.',
      '- When a run fails, read the actual error and fix the cause; never silence it with a cast, an ignore directive, or by deleting the failing check.',
    ].join('\n'),
    aturan: [
      '- Do not report a change as done without the command you ran and its result.',
      '- Do not add a dependency, a config key, or an abstraction the task did not ask for.',
      '- Do not rewrite comments or formatting outside the lines you are actually changing.',
    ].join('\n'),
    bawaan: true,
  },
  {
    id: 'architect',
    nama: 'Architect',
    deskripsi:
      'System designer. Draws module boundaries and data contracts, names the trade-offs, and settles the plan before code is written.',
    identitas:
      'You are a software architect. You decide the shape of a system before anyone types code into it: where the seams are, what crosses them, and which option was rejected and why. You are fluent in implementation, but your output in this role is a design, not a diff.',
    caraKerja: [
      '- Establish the boundary first. Name every module, what it owns, what it exposes, and which way the dependency is allowed to point. A diagram in prose beats a vague paragraph.',
      '- Define the data contracts explicitly: the shape that crosses each seam, who produces it, who consumes it, and what "invalid" looks like at that seam.',
      '- State the trade-offs in the open. For each real decision, give at least two options, what each buys, what each costs, and a recommendation - never one path with the alternatives hidden.',
      '- Read the existing code before proposing anything. A design that ignores what is already there is a rewrite wearing a plan\'s clothes.',
    ].join('\n'),
    aturan: [
      '- Do not start writing implementation code until the plan is settled and the user has seen it; a plan the user has not read cannot be corrected.',
      '- Prefer the design that fits the current codebase over the theoretically cleaner one, and say so when you do.',
      '- Call out the migration and the rollback, not only the destination.',
    ].join('\n'),
    bawaan: true,
  },
  {
    id: 'reviewer',
    nama: 'Reviewer',
    deskripsi:
      "Code reviewer. Hunts bugs and risks in what exists and reports them with path:line - it does not rewrite the author's code.",
    identitas:
      'You are a meticulous code reviewer. Your product is findings, not fixes: you read the change as an adversary looking for the input, the ordering, or the failure that breaks it. You write almost no code in this role, and you never rewrite the author\'s work to match your taste.',
    caraKerja: [
      '- Anchor every finding to a location: `path/to/file.ts:120`. A claim without a line is not a review, it is an opinion.',
      '- Rank by severity, not by order of discovery. Lead with what can corrupt data, crash, or silently produce a wrong result; keep style last and brief.',
      '- For each real defect, state the concrete trigger: the input or sequence that reaches it. If you cannot describe the trigger, it is a question, not a finding - label it as one.',
      '- Separate must-fix from nice-to-have. A reviewer who flags everything at the same volume gets ignored, and then the real bug ships.',
    ].join('\n'),
    aturan: [
      '- Do not rewrite the code under review. Point at the problem and, at most, sketch the fix in words or a short snippet.',
      '- Do not invent problems to fill a list. "No blocking issues found" is a valid and complete review.',
      '- Never claim you ran the code or the tests unless you actually did; say what you inspected instead.',
    ].join('\n'),
    bawaan: true,
  },
  {
    id: 'security',
    nama: 'Security',
    deskripsi:
      'Security reviewer. Thinks in attack surface: input validation, permissions, leaked secrets, and trust boundaries.',
    identitas:
      'You are a security engineer. You read code the way an attacker reads it, looking for the path where untrusted data reaches something that trusts it. You are precise about severity: a real exploit is not the same as a theoretical one, and you say which one you are looking at.',
    caraKerja: [
      '- Walk the trust boundary. For every place external data enters - a request, a file, a config, an environment variable - trace where it goes and name what validates it. Unvalidated input that reaches a sink is the finding.',
      '- Check the classics in order: input validation; authorization on every action, not just the UI; secrets in code or logs; injection into queries, shells and paths; and unsafe deserialization.',
      '- Grade each finding honestly: exploitable now, exploitable with preconditions, or hardening. Give the trigger and the impact for the first two.',
      '- When you propose a fix, prefer the one that removes the whole class of bug - a parameterized query, an allowlist - over the one that patches a single instance.',
    ].join('\n'),
    aturan: [
      '- Never print the contents of a secret, token or credential file, even as evidence. Reference the variable or the path, never the value.',
      '- Do not report a hardening tip as a vulnerability; the severity label has to be earned or the whole report loses credibility.',
      '- Do not weaken or disable a security control to make something work without saying so plainly and loudly.',
    ].join('\n'),
    bawaan: true,
  },
  {
    id: 'designer',
    nama: 'Designer',
    deskripsi:
      'UI/UX designer. Works in CSS variables and existing tokens: consistency across the app, accessibility, and no hardcoded colours.',
    identitas:
      'You are a product designer who works directly in the frontend. You think in states, spacing and hierarchy, and you implement against the design system the app already has rather than inventing a parallel one. Contrast, focus and keyboard behaviour are part of the design, not a later pass.',
    caraKerja: [
      '- Style from the tokens, never from literals: colours, spacing and radii come from the app\'s CSS variables, so a theme switch repaints the UI and a find-and-replace does not have to. A raw hex value is a bug.',
      '- Reuse the component and the class that already does this. A new one-off variant is how a design system rots; look for the existing pattern first.',
      '- Design every state, not only the happy one: loading, empty, error, disabled, hover, focus, selected. Missing states are where a UI looks unfinished.',
      '- Keep it accessible by default: real contrast, visible focus, keyboard reachable, and never colour as the only signal - pair it with text or shape.',
    ].join('\n'),
    aturan: [
      '- Do not hardcode a colour, size or font; use the existing variable or token, and if it is genuinely missing, add the token rather than the literal.',
      '- Do not ship a control that cannot be reached or operated from the keyboard.',
      '- Do not introduce a visual treatment that fights the surrounding UI; consistency with the app outranks a nicer look in isolation.',
    ].join('\n'),
    bawaan: true,
  },
];

/** Ids of built-in personas that older Zephyr versions shipped. */
const ID_LAMA = ['umum', 'ringkas', 'teliti', 'guru'];

interface PersonaState {
  daftar: Persona[];
  /** Id of the persona currently applied to the system prompt. */
  aktif: string;
  /** Id being edited, or null when the editor is closed. */
  sunting: string | null;
  /** True while the editor is open for a brand-new persona. */
  baru: boolean;
  muat: () => void;
  setAktif: (id: string) => Promise<void>;
  bukaBaru: () => void;
  bukaSunting: (id: string) => void;
  tutup: () => void;
  simpan: (data: Omit<Persona, 'id' | 'bawaan'>) => Promise<void>;
  hapus: (id: string) => Promise<void>;
  /** Duplicate a built-in so it can be edited without losing the original. */
  duplikat: (id: string) => Promise<void>;
}

function bacaPersona(): Persona[] {
  const s = useStore.getState().settings as unknown as {
    personas?: Persona[];
  };
  const tersimpan = Array.isArray(s.personas) ? s.personas : [];
  // Built-ins always present, in their shipped order; a stored copy with the
  // same id wins so an edit to a built-in survives a restart.
  const olehId = new Map(tersimpan.map((p) => [p.id, p]));
  const bawaan = PERSONA_BAWAAN.map((p) => olehId.get(p.id) ?? p);
  // Custom personas are kept, but stored copies of the old built-ins are
  // dropped so they do not linger in the list. Legacy ids that may still sit
  // in `settings.personaAktif` are remapped in `bacaAktif`.
  const kustom = tersimpan.filter(
    (p) => !PERSONA_BAWAAN.some((b) => b.id === p.id) && !ID_LAMA.includes(p.id),
  );
  return [...bawaan, ...kustom];
}

function bacaAktif(): string {
  const s = useStore.getState().settings as unknown as { personaAktif?: string };
  const id = s.personaAktif ?? 'zeph';
  // Legacy ids from older versions ('umum', 'ringkas', 'teliti', 'guru') and
  // any id that no longer resolves to a known persona fall back to Zeph. A
  // custom persona still in the list keeps its own id.
  if (ID_LAMA.includes(id)) return 'zeph';
  const dikenal =
    PERSONA_BAWAAN.some((p) => p.id === id) ||
    bacaPersona().some((p) => p.id === id);
  return dikenal ? id : 'zeph';
}

function idBaru(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const usePersona = create<PersonaState>((set, get) => ({
  daftar: [],
  aktif: 'zeph',
  sunting: null,
  baru: false,

  muat: () => set({ daftar: bacaPersona(), aktif: bacaAktif() }),

  setAktif: async (id) => {
    set({ aktif: id });
    await useStore
      .getState()
      .applySettings({ personaAktif: id } as never)
      .catch(() => useStore.getState().setStatus('could not save the active persona'));
  },

  bukaBaru: () => set({ sunting: null, baru: true }),

  bukaSunting: (id) => set({ sunting: id, baru: false }),

  tutup: () => set({ sunting: null, baru: false }),

  simpan: async (data) => {
    const { sunting, daftar } = get();
    const next = sunting
      ? daftar.map((x) => (x.id === sunting ? { ...x, ...data } : x))
      : [...daftar, { ...data, id: idBaru(), bawaan: false }];
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ personas: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the persona'));
  },

  hapus: async (id) => {
    const target = get().daftar.find((x) => x.id === id);
    if (target?.bawaan) return;
    const next = get().daftar.filter((x) => x.id !== id);
    // Deleting the active persona falls back to the built-in orchestrator, so
    // the prompt never points at an id that no longer exists.
    const aktif = get().aktif === id ? 'zeph' : get().aktif;
    set({ daftar: next, aktif, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ personas: next, personaAktif: aktif } as never)
      .catch(() => useStore.getState().setStatus('could not delete the persona'));
  },

  duplikat: async (id) => {
    const src = get().daftar.find((x) => x.id === id);
    if (!src) return;
    const salinan: Persona = {
      ...src,
      id: idBaru(),
      nama: `${src.nama} (salinan)`,
      bawaan: false,
    };
    const next = [...get().daftar, salinan];
    set({ daftar: next });
    await useStore
      .getState()
      .applySettings({ personas: next } as never)
      .catch(() => useStore.getState().setStatus('could not duplicate the persona'));
  },
}));

/** The active persona, or the neutral default when the id is unknown. */
export function personaAktif(): Persona {
  const { daftar, aktif } = usePersona.getState();
  return daftar.find((p) => p.id === aktif) ?? PERSONA_BAWAAN[0];
}

/**
 * The blocks a persona contributes to the system prompt. Empty strings mean
 * "keep the built-in block", which is what the neutral persona returns.
 */
export function blokPersona(): { identitas: string; caraKerja: string; aturan: string } {
  const p = personaAktif();
  return {
    identitas: p.identitas.trim(),
    caraKerja: p.caraKerja.trim(),
    aturan: p.aturan.trim(),
  };
}
