import { create } from 'zustand';
import * as cmd from './commands';
import { KATALOG_BUNDLED, type KatalogItem } from './extCatalog';
import { muatSemuaEkstensi, ringkasanLoader, type LoaderRingkasan } from './extLoader';
import type { ExtInstallHasil, ExtKontribItem, ExtManifestStatus, ExtPengaruh } from './types';

export type ExtTab = 'installed' | 'recommended' | 'marketplace';

/**
 * The header Rust puts on a refusal for a package with nothing the app can use
 * (`TOLAK_PENANDA` in `ext_pkg.rs`). Matched so the panel can tell "this
 * package would do nothing here" - a verdict about the package - apart from
 * "the install failed", which is a verdict about the attempt.
 */
export const TOLAK_PENANDA = 'NOTHING TO INSTALL:';

/** Used when a response arrives without a report (older backend, dev bridge). */
const PENGARUH_KOSONG: ExtPengaruh = { didukung: [], diabaikan: [], ringkasan: [] };

/** Contribution kinds whose effect only lands after a window reload. */
const RELOAD_KINDS = new Set(['theme', 'iconTheme', 'keymap', 'language']);

/** Mirrors `InstallHasil.perlu_reload` on the Rust side. */
const pengaruhBerat = (p: ExtPengaruh) => p.didukung.some((i) => RELOAD_KINDS.has(i.kind));

export type ExtKabarJenis = 'pasang' | 'tolak' | 'hapus';

/**
 * The result of the last install or delete, in the form the user asked for:
 * what changed, what was ignored, and - for a refusal - the whole message.
 *
 * `info: "X installed"` was the old answer and it was not enough: an install
 * that applied nothing looked identical to one that repainted the window.
 */
export interface ExtKabar {
  jenis: ExtKabarJenis;
  id: string;
  judul: string;
  /** One line per kind: "1 theme: 12 UI colors + 11 code colors". */
  ringkasan: string[];
  /** Contributions this app cannot apply, with the reason. */
  diabaikan: ExtKontribItem[];
  /** Full text of the refusal, for `jenis === 'tolak'`. */
  pesan?: string;
}

interface Ext19State {
  
  manifests: ExtManifestStatus[];
  loading: boolean;
  q: string;
  tab: ExtTab;
  
  detailFor: string | null;
  
  menuFor: string | null;
  err: string | null;
  info: string | null;
  
  perluReload: boolean;

  /** Result of the last install/delete: what changed and what was ignored. */
  kabar: ExtKabar | null;
  
  ringkasan: LoaderRingkasan;
  
  remoteUrl: string;
  
  remote: KatalogItem[] | null;
  remoteErr: string | null;
  
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

  /** Clear the install/delete report panel. */
  tutupKabar: () => void;
  install: (path: string) => Promise<boolean>;
  installKatalog: (item: KatalogItem) => Promise<boolean>;
  installDariDialog: (folder: boolean) => Promise<boolean>;
  uninstall: (id: string) => Promise<boolean>;
  setEnabled: (id: string, on: boolean) => Promise<void>;
  reloadWindow: () => void;
  muatRemote: () => Promise<void>;

  terpasang: () => ExtManifestStatus[];
  
  rusak: () => ExtManifestStatus[];
  
  hasil: () => KatalogItem[];
  
  rekomendasi: () => KatalogItem[];
  sudahTerpasang: (id: string) => ExtManifestStatus | null;
}

export type Ext19Store = Ext19State & Ext19Actions;

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

  kabar: null,
  ringkasan: ringkasanLoader(),
  
  remoteUrl: '',
  remote: null,
  remoteErr: null,
  kategori: '',

  refresh: async () => {
    set({ loading: true });
    try {
      const manifests = await cmd.extensionsManifests();
      
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
  tutupKabar: () => set({ kabar: null }),

  install: async (path) => {
    try {
      const h: ExtInstallHasil = await cmd.extensionsInstall(path);
      const pengaruh = h.pengaruh ?? PENGARUH_KOSONG;
      await get().refresh();

      /*
       * The install result answers the question the panel could not answer
       * before: what changed? The counts come from Rust reading the files the
       * package shipped, so "installed" now carries evidence, and a package
       * that applied nothing says so in the same breath.
       */
      const ringkas = pengaruh.ringkasan.join('; ');
      set({
        info: ringkas
          ? `${h.name} v${h.version || '-'} terpasang — ${ringkas}`
          : `${h.name} v${h.version || '-'} terpasang tanpa perubahan yang bisa diterapkan`,
        err: null,
        perluReload: get().perluReload || h.perluReload,
        kabar: {
          jenis: 'pasang',
          id: h.id,
          judul: `${h.name} v${h.version || '-'}`,
          ringkasan: pengaruh.ringkasan,
          diabaikan: pengaruh.diabaikan,
        },
      });
      return true;
    } catch (e) {
      const pesan = cmd.asZephyrError(e).message;

      /*
       * A refusal is not a failure of the attempt: the package installed fine
       * and would have changed nothing, so Rust declined it before writing to
       * disk. Shown as its own report rather than a red error line.
       */
      const ditolak = pesan.includes(TOLAK_PENANDA);
      set({
        err: ditolak ? null : pesan,
        /* The refusal replaces the line from the last install: two opposing
           statements about the same act would both be on screen otherwise. */
        info: ditolak ? null : get().info,
        kabar: ditolak
          ? {
              jenis: 'tolak',
              id: path,
              judul: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
              ringkasan: [],
              diabaikan: [],
              pesan,
            }
          : get().kabar,
      });
      return false;
    }
  },

  installKatalog: async (item) => {
    
    try {
      if (item.bundled || !item.url) {
        const path = await cmd.extensionsWriteBundled(item.id);
        return await get().install(path);
      }
      const zextPath = await cmd.extensionsDownloadZext(item.url, item.id);
      return await get().install(zextPath);
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
      /* Read the report before the delete: after it the status is gone, and
         "what did removing this take away" is exactly what the user needs to
         see to trust that the removal restored the window. */
      const st = get().sudahTerpasang(id);
      const pengaruh = st?.pengaruh ?? PENGARUH_KOSONG;

      const ok = await cmd.extensionsUninstall(id);
      await get().refresh();
      set({
        info: ok ? `${id} deleted` : `${id} not found`,
        err: null,
        perluReload: get().perluReload || (ok && pengaruhBerat(pengaruh)),
        detailFor: null,
        menuFor: null,
        kabar: ok
          ? {
              jenis: 'hapus',
              id,
              judul: `${st?.manifest?.name ?? id} v${st?.manifest?.version ?? '-'}`,
              ringkasan: pengaruh.ringkasan,
              diabaikan: pengaruh.diabaikan,
            }
          : null,
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

      /*
       * The reload banner used to be raised from the manifest ("it mentions a
       * theme, so ask for a reload"), which was wrong for a theme with no UI
       * colours: the reload changed nothing. The report says what is actually
       * applied, so the banner follows that instead.
       */
      const pengaruh = get().sudahTerpasang(id)?.pengaruh;
      const berat = !!pengaruh && pengaruhBerat(pengaruh);
      const kosong = !!pengaruh && pengaruh.didukung.length === 0;

      set({
        info: kosong
          ? `${id} ${on ? 'diaktifkan' : 'dimatikan'} — tidak ada kontribusi yang bisa diterapkan (lihat laporan)`
          : `${id} ${on ? 'diaktifkan' : 'dimatikan'}`,
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
    
    try {
      const arr = await cmd.extRegistryList(get().q);
      set({
        
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
          
          untukBahasa: e.languages.length > 0 ? e.languages : undefined,
          bundled: !e.url,
          url: e.url || undefined,
          unduhan: e.downloadCount || undefined,
          rating: e.rating || undefined,
        })),
        
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

    /*
     * Marketplace shows two things: whatever the registry served, and the
     * packages Zephyr ships inside the binary. The bundled ones are installable
     * without a network, so hiding them behind "no registry URL is configured"
     * made the tab look broken on a fresh install — they are the only catalog
     * that is always there.
     *
     * Installed is now strictly "what is on disk": it reads the manifests the
     * loader found, so the tab answers "what do I have", not "what could I have".
     */
    if (tab === 'marketplace') {
      const dariRemote = (remote ?? []).filter((it) => !it.perluRuntime);
      const idRemote = new Set(dariRemote.map((x) => x.id));
      const dariBundel = KATALOG_BUNDLED.filter((it) => !idRemote.has(it.id));
      return [...dariRemote, ...dariBundel].filter(
        (it) => cocok(it, q) && (!kategori || it.categories.includes(kategori)),
      );
    }
    if (tab === 'recommended') {
      return get().rekomendasi().filter((it) => cocok(it, q));
    }

    // Installed: only what the loader actually found on disk.
    const tambahan: KatalogItem[] = [];
    for (const st of get().terpasang()) {
      const m = st.manifest!;
      const it: KatalogItem = {
        id: m.id,
        name: m.name,
        publisher: m.publisher || '-',
        version: m.version || '-',
        description: m.description,
        categories: m.categories.length > 0 ? m.categories : ['Other'],
        logo: (m.name || m.id).slice(0, 2).toUpperCase(),
        bundled: false,

        logoUrl: st.iconPath || undefined,
      };
      if (cocok(it, q)) tambahan.push(it);
    }
    return tambahan;
  },
}));
