// extensionsStore19.ts — state ExtensionsView (fase 19).
//
// Beda dengan extensionStore.ts (fase 13): file itu mengurus daftar bawaan +
// toggle `settings.extensions.enabled` untuk paket gaya `package.json`. Fase 19
// mengurus paket NATIVE (`zephyr-extension.json`): katalog bundled, install /
// uninstall / enable, pencarian, dan panel Details.
//
// Keduanya sengaja hidup berdampingan: fase 13 sudah dipakai Settings dan
// harness verify13, dan menggabungkannya berarti mengubah kontrak yang sudah
// terbukti. Yang dibagi cuma Rust-nya (folder extensions/ yang sama).
//
// Catatan zustand v5 (pelajaran fase 09/12): selector DILARANG membuat
// array/objek baru. Semua daftar turunan dihitung lewat FUNGSI (`hasil()`,
// `terpasang()`), bukan selector.

import { create } from 'zustand';
import * as cmd from './commands';
import { KATALOG_BUNDLED, type KatalogItem } from './extCatalog';
import { muatSemuaEkstensi, ringkasanLoader, type LoaderRingkasan } from './extLoader';
import type { ExtManifestStatus } from './types';

/** Tab di ExtensionsView. */
export type ExtTab = 'installed' | 'recommended' | 'marketplace';

interface Ext19State {
  /** hasil `extensions_manifests` — sumber kebenaran apa yang terpasang */
  manifests: ExtManifestStatus[];
  loading: boolean;
  q: string;
  tab: ExtTab;
  /** id yang panel Details-nya terbuka */
  detailFor: string | null;
  /** id yang menu roda-giginya terbuka */
  menuFor: string | null;
  err: string | null;
  info: string | null;
  /** true = ada perubahan yang butuh Reload Window (19.4) */
  perluReload: boolean;
  /** ringkasan kontribusi hasil loader */
  ringkasan: LoaderRingkasan;
  /** URL registry remote; kosong = marketplace nonaktif (19.3) */
  remoteUrl: string;
  /** hasil fetch remote; null = belum/ tidak tersedia */
  remote: KatalogItem[] | null;
  remoteErr: string | null;
}

interface Ext19Actions {
  refresh: () => Promise<void>;
  setQ: (q: string) => void;
  setTab: (t: ExtTab) => void
  setDetail: (id: string | null) => void;
  setMenu: (id: string | null) => void;
  setErr: (m: string | null) => void;
  setInfo: (m: string | null) => void;
  install: (path: string) => Promise<boolean>;
  installKatalog: (item: KatalogItem) => Promise<boolean>;
  installDariDialog: (folder: boolean) => Promise<boolean>;
  uninstall: (id: string) => Promise<boolean>;
  setEnabled: (id: string, on: boolean) => Promise<void>;
  reloadWindow: () => void;
  muatRemote: () => Promise<void>;

  // ── turunan (FUNGSI, bukan selector) ──
  /** Ekstensi terpasang (punya manifest valid). */
  terpasang: () => ExtManifestStatus[];
  /** Yang rusak / manifest tidak terbaca. */
  rusak: () => ExtManifestStatus[];
  /** Hasil filter pencarian untuk tab aktif. */
  hasil: () => KatalogItem[];
  /** Rekomendasi berdasar bahasa yang ada di workspace. */
  rekomendasi: () => KatalogItem[];
  sudahTerpasang: (id: string) => ExtManifestStatus | null;
}

export type Ext19Store = Ext19State & Ext19Actions;

/** Bahasa yang terdeteksi di workspace — diisi ExtensionsView dari explorer. */
let bahasaWorkspace: string[] = [];
export const setBahasaWorkspace = (l: string[]) => {
  bahasaWorkspace = l;
};
export const getBahasaWorkspace = () => bahasaWorkspace.slice();

const cocok = (it: KatalogItem, q: string) => {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    it.id.toLowerCase().includes(s) ||
    it.name.toLowerCase().includes(s) ||
    it.publisher.toLowerCase().includes(s) ||
    it.description.toLowerCase().includes(s) ||
    it.categories.some((c) => c.toLowerCase().includes(s))
  );
};

export const useExt19 = create<Ext19Store>((set, get) => ({
  manifests: [],
  loading: false,
  q: '',
  tab: 'installed',
  detailFor: null,
  menuFor: null,
  err: null,
  info: null,
  perluReload: false,
  ringkasan: ringkasanLoader(),
  remoteUrl: '',
  remote: null,
  remoteErr: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const manifests = await cmd.extensionsManifests();
      // Loader dijalankan ulang supaya kontribusi (command/snippet) langsung
      // ikut berubah tanpa reload untuk hal-hal yang memang bisa panas.
      const ringkasan = await muatSemuaEkstensi();
      set({ manifests, ringkasan, loading: false, err: null });
    } catch (e) {
      set({ loading: false, err: cmd.asZephyrError(e).message });
    }
  },

  setQ: (q) => set({ q }),
  setTab: (tab) => set({ tab, menuFor: null }),
  setDetail: (detailFor) => set({ detailFor, menuFor: null }),
  setMenu: (menuFor) => set({ menuFor }),
  setErr: (err) => set({ err }),
  setInfo: (info) => set({ info }),

  install: async (path) => {
    try {
      const h = await cmd.extensionsInstall(path);
      await get().refresh();
      set({
        info: `${h.name} v${h.version || '-'} terpasang`,
        err: null,
        perluReload: get().perluReload || h.perluReload,
      });
      return true;
    } catch (e) {
      set({ err: cmd.asZephyrError(e).message });
      return false;
    }
  },

  installKatalog: async (item) => {
    // Katalog bundled = folder contoh yang DITULIS Zephyr sendiri ke
    // extensions/. Tidak ada unduhan jaringan di jalur ini (19.3: bundled
    // harus bisa dipasang offline).
    try {
      const path = await cmd.extensionsWriteBundled(item.id);
      return await get().install(path);
    } catch (e) {
      set({ err: cmd.asZephyrError(e).message });
      return false;
    }
  },

  installDariDialog: async (folder) => {
    try {
      const picked = folder
        ? await cmd.folderDialogOpen()
        : (await cmd.fileDialogOpen(false))?.[0];
      const p = Array.isArray(picked) ? picked[0] : picked;
      if (!p) return false;
      return await get().install(p);
    } catch (e) {
      set({ err: cmd.asZephyrError(e).message });
      return false;
    }
  },

  uninstall: async (id) => {
    try {
      const ok = await cmd.extensionsUninstall(id);
      await get().refresh();
      set({
        info: ok ? `${id} dihapus` : `${id} tidak ditemukan`,
        err: null,
        perluReload: true,
        detailFor: null,
        menuFor: null,
      });
      return ok;
    } catch (e) {
      set({ err: cmd.asZephyrError(e).message });
      return false;
    }
  },

  setEnabled: async (id, on) => {
    try {
      await cmd.extensionsSetEnabled(id, on);
      await get().refresh();
      const m = get().sudahTerpasang(id)?.manifest;
      // Tema/keymap/bahasa butuh reload; command & snippet tidak.
      const berat =
        !!m &&
        (m.contributes.themes.length > 0 ||
          m.contributes.keymaps.length > 0 ||
          m.contributes.languages.length > 0 ||
          m.contributes.iconThemes.length > 0);
      set({
        info: `${id} ${on ? 'diaktifkan' : 'dimatikan'}`,
        err: null,
        perluReload: get().perluReload || berat,
        menuFor: null,
      });
    } catch (e) {
      set({ err: cmd.asZephyrError(e).message });
    }
  },

  reloadWindow: () => {
    set({ perluReload: false });
    window.location.reload();
  },

  muatRemote: async () => {
    const url = get().remoteUrl.trim();
    if (!url) {
      // 19.3 + V10: registry kosong BUKAN error.
      set({ remote: null, remoteErr: null });
      return;
    }
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as unknown;
      const arr = Array.isArray(data) ? data : (data as { extensions?: unknown }).extensions;
      if (!Array.isArray(arr)) throw new Error('bentuk registry tidak dikenal');
      set({
        remote: arr.slice(0, 200).map((x) => {
          const o = x as Record<string, unknown>;
          return {
            id: String(o.id ?? ''),
            name: String(o.name ?? o.id ?? ''),
            publisher: String(o.publisher ?? '-'),
            version: String(o.version ?? '-'),
            description: String(o.description ?? ''),
            categories: Array.isArray(o.categories) ? (o.categories as string[]) : ['Other'],
            logo: String(o.logo ?? '?').slice(0, 3),
            /** remote tidak punya paket lokal */
            bundled: false,
            url: String(o.url ?? ''),
          } satisfies KatalogItem;
        }),
        remoteErr: null,
      });
    } catch (e) {
      set({ remote: null, remoteErr: e instanceof Error ? e.message : String(e) });
    }
  },

  terpasang: () => get().manifests.filter((m) => m.manifest && !m.error),
  rusak: () => get().manifests.filter((m) => m.error || !m.manifest),

  sudahTerpasang: (id) => get().manifests.find((m) => m.manifest?.id === id) ?? null,

  rekomendasi: () => {
    const bahasa = getBahasaWorkspace();
    if (bahasa.length === 0) return [];
    return KATALOG_BUNDLED.filter(
      (k) => k.untukBahasa && k.untukBahasa.some((b) => bahasa.includes(b)),
    );
  },

  hasil: () => {
    const { q, tab, remote } = get();
    if (tab === 'marketplace') {
      return (remote ?? []).filter((it) => cocok(it, q));
    }
    if (tab === 'recommended') {
      return get().rekomendasi().filter((it) => cocok(it, q));
    }
    // installed: katalog + yang benar-benar terpasang (termasuk non-katalog)
    const dariKatalog = KATALOG_BUNDLED.filter((it) => cocok(it, q));
    const idKatalog = new Set(dariKatalog.map((x) => x.id));
    const tambahan: KatalogItem[] = [];
    for (const st of get().terpasang()) {
      const m = st.manifest!;
      if (idKatalog.has(m.id)) continue;
      const it: KatalogItem = {
        id: m.id,
        name: m.name,
        publisher: m.publisher || '-',
        version: m.version || '-',
        description: m.description,
        categories: m.categories.length > 0 ? m.categories : ['Other'],
        logo: (m.name || m.id).slice(0, 2).toUpperCase(),
        bundled: false,
      };
      if (cocok(it, q)) tambahan.push(it);
    }
    return [...dariKatalog, ...tambahan];
  },
}));
