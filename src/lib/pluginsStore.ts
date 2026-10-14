/*
 * The plugin layer.
 *
 * A plugin is a package that bundles contributions the agent already
 * understands — skills, rules, hooks, agents and MCP servers — so they can be
 * installed as one thing instead of five. This store is only the frontend half:
 *
 *   - skills and rules are FILES, written by `plugins.rs` into the workspace
 *     `.zephyr/` folders (or the global ones when no workspace is open). After a
 *     toggle the skills/rules stores are re-read so the panes show them.
 *   - MCP servers live in `settings.mcp.servers`, written by the backend too.
 *   - hooks (`agentExtrasStore`) and agents (`personaStore`) live in the
 *     frontend, so the backend hands their definitions back in the toggle result
 *     and this store merges them into the two stores that own them.
 *
 * Nothing here re-implements a contribution: a plugin hook is a `Hook`, a plugin
 * agent is a `Persona`. Both carry the plugin's name so a disable can remove
 * exactly what that plugin added and nothing else.
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { HOOK_EVENTS, useAgentExtras, type Hook, type HookEvent } from './agentExtrasStore';
import { usePersona, type Persona } from './personaStore';
import { useSkills } from './skillsStore';
import { useInstructions } from './instructionsStore';

export interface InstalledPlugin {
  name: string;
  description: string;
  version: string;
  author: string;
  source: string;
  enabled: boolean;
  scope: string;
  path: string;
  /** `["skill:conventional-commits", "hook:commit-message", …]` for the chips. */
  provides: string[];
  /** The package folder is gone: the entry is stale, not an installed plugin. */
  missing: boolean;
}

export interface MarketPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  homepage: string;
  provides: string[];
  installed: boolean;
}

export interface PluginHook {
  id: string;
  name: string;
  event: string;
  command: string;
  enabled: boolean;
  scope: string;
  plugin: string;
}

export interface PluginAgent {
  id: string;
  nama: string;
  deskripsi: string;
  identitas: string;
  caraKerja: string;
  aturan: string;
  plugin: string;
}

/** What enabling or disabling actually did — and what it refused to do. */
export interface PluginToggle {
  name: string;
  enabled: boolean;
  scope: string;
  /** The folder `written`/`skipped` are relative to — what makes them findable. */
  scopeRoot: string;
  written: string[];
  skipped: string[];
  hooks: PluginHook[];
  agents: PluginAgent[];
  mcp: string[];
  warnings: string[];
}

interface PluginState {
  daftar: InstalledPlugin[];
  pasar: MarketPlugin[];
  memuat: boolean;
  sibuk: string | null;
  galat: string | null;
  /** The last toggle's report, shown under the list until the next action. */
  catatan: PluginToggle | null;

  muat: () => Promise<void>;
  pasang: (path: string) => Promise<boolean>;
  pasangBawaan: (id: string) => Promise<boolean>;
  aktifkan: (name: string, on: boolean) => Promise<boolean>;
  hapus: (name: string) => Promise<void>;
  bersihkanCatatan: () => void;
}

function pesan(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; code?: string };
    if (o.message) return o.message;
    if (o.code) return o.code;
  }
  return String(e);
}

const ID_EVENT = new Set<string>(HOOK_EVENTS.map((e) => e.id));

/** A plugin hook is stored switched off, the same rule the Hooks pane follows. */
function keHook(h: PluginHook): Hook {
  return {
    id: h.id,
    name: h.name,
    event: (ID_EVENT.has(h.event) ? h.event : 'session-end') as HookEvent,
    command: h.command,
    enabled: false,
    scope: h.scope === 'user' ? 'user' : 'workspace',
    plugin: h.plugin,
  };
}

/** A plugin agent becomes a normal custom persona, tagged with its plugin. */
function kePersona(a: PluginAgent): Persona {
  return {
    id: a.id,
    nama: a.nama,
    deskripsi: a.deskripsi,
    identitas: a.identitas,
    caraKerja: a.caraKerja,
    aturan: a.aturan,
    bawaan: false,
    plugin: a.plugin,
  };
}

/*
 * Skills and rules are written straight to disk by the backend, so the panes
 * that read them have to be told to re-read — and the reload is awaited: a pane
 * that refreshes in the background can still show the pre-toggle list for a
 * moment, and "did the skill appear?" must have one answer at one moment.
 */
async function segarkanBerkas(): Promise<void> {
  await Promise.all([
    useSkills.getState().muat().catch(() => undefined),
    useInstructions.getState().muat().catch(() => undefined),
  ]);
}

export const usePlugins = create<PluginState>((set, get) => ({
  daftar: [],
  pasar: [],
  memuat: false,
  sibuk: null,
  galat: null,
  catatan: null,

  muat: async () => {
    set({ memuat: true, galat: null });
    try {
      const [daftar, pasar] = await Promise.all([
        invoke<InstalledPlugin[]>('plugins_list'),
        invoke<MarketPlugin[]>('plugins_marketplace'),
      ]);
      set({ daftar, pasar, memuat: false });
    } catch (e) {
      set({ memuat: false, galat: pesan(e) });
    }
  },

  pasang: async (path) => {
    set({ sibuk: path, galat: null, catatan: null });
    try {
      await invoke<string>('plugin_install', { path });
      await get().muat();
      set({ sibuk: null });
      return true;
    } catch (e) {
      set({ sibuk: null, galat: pesan(e) });
      return false;
    }
  },

  pasangBawaan: async (id) => {
    set({ sibuk: id, galat: null, catatan: null });
    try {
      await invoke<string>('plugin_install_bundled', { name: id });
      await get().muat();
      set({ sibuk: null });
      return true;
    } catch (e) {
      set({ sibuk: null, galat: pesan(e) });
      return false;
    }
  },

  aktifkan: async (name, on) => {
    set({ sibuk: name, galat: null });
    try {
      const t = await invoke<PluginToggle>('plugin_enable', { name, enabled: on });
      if (on) {
        useAgentExtras.getState().setHooksDariPlugin(name, t.hooks.map(keHook));
        await usePersona.getState().setPersonasDariPlugin(name, t.agents.map(kePersona));
      } else {
        useAgentExtras.getState().hapusHooksDariPlugin(name);
        await usePersona.getState().hapusPersonasDariPlugin(name);
      }
      await segarkanBerkas();
      await get().muat();
      set({ sibuk: null, catatan: t });
      return true;
    } catch (e) {
      set({ sibuk: null, galat: pesan(e) });
      return false;
    }
  },

  hapus: async (name) => {
    set({ sibuk: name, galat: null });
    try {
      await invoke<void>('plugin_remove', { name });
      // Whatever the plugin had wired up goes with it. The backend already
      // unwired skills, rules and MCP; the two frontend lists are ours to drop.
      useAgentExtras.getState().hapusHooksDariPlugin(name);
      await usePersona.getState().hapusPersonasDariPlugin(name);
      await segarkanBerkas();
      await get().muat();
      set({ sibuk: null, catatan: null });
    } catch (e) {
      set({ sibuk: null, galat: pesan(e) });
    }
  },

  bersihkanCatatan: () => set({ catatan: null }),
}));
