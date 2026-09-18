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
  /** filter kategori tab Marketplace; '' = semua */
  kategori: string;
}

interface Ext19Actions {
  refresh: () => Promise<void>;
  setQ: (q: string) => void;
  setTab: (t: ExtTab) => void
  setKategori: (k: string) => void;
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

/** Tebak apakah sebuah item registry (Open VSX) butuh runtime eksternal. */
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
  // Registry native Zephyr. URL remote (kalau ada) dibaca backend dari
  // settings.extensions.registryUrl — bukan hardcode open-vsx.org lagi.
  remoteUrl: '',
  remote: null,
  remoteErr: null,
  kategori: '',

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
  setKategori: (kategori) => set({ kategori }),
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
    // Dua sumber: paket bundled (ditulis Zephyr sendiri, offline) ATAU
    // unduhan .vsix dari registry remote (Open VSX). Untuk remote:
    // 1. unduh file ke temp, 2. serahkan ke `extensions_install` yang sudah
    //    handle .zip/.vsix lewat unzip_zext (zip-slip aman, fase 19).
    try {
      if (item.bundled || !item.url) {
        const path = await cmd.extensionsWriteBundled(item.id);
        return await get().install(path);
      }
      const vsixPath = await cmd.extensionsDownloadVsix(item.url, item.id);
      return await get().install(vsixPath);
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
    // Registry sekarang dibaca di BACKEND (ext_registry_list) — format index
    // Zephyr sendiri, bukan Open VSX. Frontend cuma meneruskan pencarian;
    // validasi, batas, dan penggabungan bundled+user+remote semua di Rust.
    try {
      const arr = await cmd.extRegistryList(get().q);
      set({
        // Petakan RegistryEntry (backend) ke KatalogItem (UI) — satu-satunya
        // tempat bentuknya berbeda. `perluRuntime` tidak perlu lagi: registry
        // Zephyr hanya berisi paket yang memang bisa dipasang.
        // Entri tanpa `url` = paket bundled (ditulis extensions_write_bundled,
        // bukan diunduh) → `bundled: true` supaya tombol Install aktif.
        remote: arr.map((e) => ({
          id: e.id,
          name: e.name || e.id,
          publisher: e.publisher || '-',
          version: e.version || '-',
          description: e.description,
          categories: e.categories.length > 0 ? e.categories : ['Other'],
          logo: e.logo || (e.name || e.id).slice(0, 2).toUpperCase(),
          logoUrl: e.iconUrl || undefined,
          logoColor: e.logoColor || undefined,
          // Bahasa yang membuat paket ini direkomendasikan (tab Recommended
          // membandingkan ini dengan bahasa file di workspace).
          untukBahasa: e.languages.length > 0 ? e.languages : undefined,
          bundled: !e.url,
          url: e.url || undefined,
          unduhan: e.downloadCount || undefined,
          rating: e.rating || undefined,
        })),
        // Registry backend selalu "tersedia" (bundled index selalu ada),
        // jadi tab Marketplace tidak boleh lagi menulis "belum dikonfigurasi".
        remoteUrl: 'native',
        remoteErr: null,
      });
    } catch (e) {
      set({ remote: null, remoteErr: cmd.asZephyrError(e).message });
    }
  },

  terpasang: () => get().manifests.filter((m) => m.manifest && !m.error),
  rusak: () => get().manifests.filter((m) => m.error || !m.manifest),

  sudahTerpasang: (id) => get().manifests.find((m) => m.manifest?.id === id) ?? null,

  rekomendasi: () => {
    const bahasa = getBahasaWorkspace();
    if (bahasa.length === 0) return [];
    const cocokBahasa = (k: KatalogItem) =>
      k.untukBahasa && k.untukBahasa.some((b) => bahasa.includes(b));
    // Gabung katalog bundled + marketplace (paket bahasa ada di marketplace,
    // bukan katalog) — pasang yang belum terpasang dulu, sisanya sebagai
    // saran kedua. Tanpa duplikat id.
    const dariMarket = (get().remote ?? []).filter(cocokBahasa);
    const dariKatalog = KATALOG_BUNDLED.filter(cocokBahasa);
    const sudah = new Set(get().terpasang().map((s) => s.manifest!.id));
    const urut = (k: KatalogItem) => (sudah.has(k.id) ? 1 : 0);
    return [...dariMarket, ...dariKatalog]
      .sort((a, b) => urut(a) - urut(b))
      .filter((k, i, arr) => arr.findIndex((x) => x.id === k.id) === i);
  },

  hasil: () => {
    const { q, tab, remote, kategori } = get();
    if (tab === 'marketplace') {
      // Hanya tampilkan item manifest-only (tidak butuh runtime eksternal).
      const daftarRemote = (remote ?? []).filter((it) => !it.perluRuntime);
      return daftarRemote.filter(
        (it) => cocok(it, q) && (!kategori || it.categories.includes(kategori)),
      );
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
        // fase 33: icon asli ekstensi terpasang (file lokal) — daftar
        // Installed ikut menampilkan logo seperti Marketplace.
        logoUrl: st.iconPath || undefined,
      };
      if (cocok(it, q)) tambahan.push(it);
    }
    return [...dariKatalog, ...tambahan];
  },
}));
