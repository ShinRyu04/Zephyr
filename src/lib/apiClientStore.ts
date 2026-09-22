// apiClientStore.ts — API Client: collection + environment variables (T2.2).
//
// BEDA dari T1.3 (`.http`): file `.http` hidup DI DALAM repo — cocok untuk
// request yang ikut di-review dan di-commit. API Client menyimpan request di
// DATA APLIKASI (`%APPDATA%\zephyr\`) — cocok untuk request pribadi yang tidak
// boleh masuk git (token, endpoint internal) dan untuk berpindah environment
// (dev/staging/prod) tanpa mengedit file.
//
// KEDUANYA DIPAKAI BERSAMAAN: `.http` untuk yang dibagikan, collection untuk
// yang pribadi. Keduanya memakai backend Rust yang sama (`http_send`), jadi
// perilaku jaringan tidak berbeda.
//
// PENYIMPANAN: satu file JSON di folder data aplikasi. Token TIDAK dienkripsi
// di sini — kalau user butuh rahasia, ia memakai variabel yang merujuk
// `{{secret}}` dan mengisinya saat kirim (tidak disimpan).

import { create } from 'zustand';
import * as cmd from './commands';

/** Satu request tersimpan. */
export interface SavedRequest {
  id: string;
  nama: string;
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  /** id collection pemiliknya */
  collectionId: string;
}

/** Satu collection (folder) request. */
export interface Collection {
  id: string;
  nama: string;
}

/** Satu environment (kumpulan variabel). */
export interface Environment {
  id: string;
  nama: string;
  vars: [string, string][];
}

interface ApiClientState {
  collections: Collection[];
  requests: SavedRequest[];
  environments: Environment[];
  /** environment aktif; null = tidak ada variabel */
  envAktif: string | null;
  /** request yang sedang dibuka di builder */
  terpilih: string | null;
  /** true = sudah dimuat dari disk */
  dimuat: boolean;

  muat: () => Promise<void>;
  simpan: () => Promise<void>;

  tambahCollection: (nama: string) => string;
  hapusCollection: (id: string) => void;

  tambahRequest: (collectionId: string) => string;
  ubahRequest: (id: string, patch: Partial<SavedRequest>) => void;
  hapusRequest: (id: string) => void;
  pilih: (id: string | null) => void;

  tambahEnv: (nama: string) => string;
  ubahEnv: (id: string, patch: Partial<Environment>) => void;
  hapusEnv: (id: string) => void;
  setEnvAktif: (id: string | null) => void;

  /** Variabel efektif dari environment aktif. */
  vars: () => [string, string][];
}

const KUNCI = 'zephyr.apiclient.v1';

/** Muat dari localStorage (data aplikasi lewat plugin store Rust belum
 *  menyediakan jalur khusus untuk ini, dan isinya kecil + bukan rahasia
 *  permanen — jadi localStorage sudah tepat). */
function muatLokal(): {
  collections: Collection[];
  requests: SavedRequest[];
  environments: Environment[];
  envAktif: string | null;
} {
  try {
    const raw = localStorage.getItem(KUNCI);
    if (!raw) throw new Error('kosong');
    const d = JSON.parse(raw) as {
      collections?: Collection[];
      requests?: SavedRequest[];
      environments?: Environment[];
      envAktif?: string | null;
    };
    return {
      collections: Array.isArray(d.collections) ? d.collections : [],
      requests: Array.isArray(d.requests) ? d.requests : [],
      environments: Array.isArray(d.environments) ? d.environments : [],
      envAktif: d.envAktif ?? null,
    };
  } catch {
    // Default: satu collection "Umum" + satu environment "Lokal" supaya user
    // tidak melihat layar kosong tanpa jalan keluar.
    return {
      collections: [{ id: 'col-umum', nama: 'Umum' }],
      requests: [],
      environments: [
        { id: 'env-lokal', nama: 'Lokal', vars: [['base', 'http://127.0.0.1:3000']] },
      ],
      envAktif: 'env-lokal',
    };
  }
}

const uid = (pre: string) =>
  `${pre}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useApiClient = create<ApiClientState>((set, get) => {
  const boot = muatLokal();
  return {
    ...boot,
    terpilih: null,
    dimuat: false,

    muat: async () => {
      if (get().dimuat) return;
      const d = muatLokal();
      set({ ...d, dimuat: true });
    },

    simpan: async () => {
      const s = get();
      try {
        localStorage.setItem(
          KUNCI,
          JSON.stringify({
            collections: s.collections,
            requests: s.requests,
            environments: s.environments,
            envAktif: s.envAktif,
          }),
        );
      } catch {
        /* kuota penuh — data tetap hidup di memori */
      }
    },

    tambahCollection: (nama) => {
      const id = uid('col');
      set((s) => ({ collections: [...s.collections, { id, nama: nama || 'Collection baru' }] }));
      void get().simpan();
      return id;
    },

    hapusCollection: (id) => {
      set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
        requests: s.requests.filter((r) => r.collectionId !== id),
        terpilih: null,
      }));
      void get().simpan();
    },

    tambahRequest: (collectionId) => {
      const id = uid('req');
      set((s) => ({
        requests: [
          ...s.requests,
          {
            id,
            nama: 'Request baru',
            method: 'GET',
            url: '{{base}}/',
            headers: [['Accept', 'application/json']],
            body: '',
            collectionId,
          },
        ],
        terpilih: id,
      }));
      void get().simpan();
      return id;
    },

    ubahRequest: (id, patch) => {
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));
      void get().simpan();
    },

    hapusRequest: (id) => {
      set((s) => ({
        requests: s.requests.filter((r) => r.id !== id),
        terpilih: s.terpilih === id ? null : s.terpilih,
      }));
      void get().simpan();
    },

    pilih: (id) => set({ terpilih: id }),

    tambahEnv: (nama) => {
      const id = uid('env');
      set((s) => ({
        environments: [...s.environments, { id, nama: nama || 'Environment baru', vars: [] }],
      }));
      void get().simpan();
      return id;
    },

    ubahEnv: (id, patch) => {
      set((s) => ({
        environments: s.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
      void get().simpan();
    },

    hapusEnv: (id) => {
      set((s) => ({
        environments: s.environments.filter((e) => e.id !== id),
        envAktif: s.envAktif === id ? null : s.envAktif,
      }));
      void get().simpan();
    },

    setEnvAktif: (id) => {
      set({ envAktif: id });
      void get().simpan();
    },

    vars: () => {
      const s = get();
      const env = s.environments.find((e) => e.id === s.envAktif);
      return env?.vars ?? [];
    },
  };
});

/** Kirim satu request tersimpan (memakai variabel environment aktif). */
export async function kirimRequest(
  r: SavedRequest,
  vars: [string, string][],
): Promise<cmd.HttpRunResult> {
  return cmd.httpSend({
    method: r.method,
    url: r.url,
    headers: r.headers,
    body: r.body || undefined,
    variabel: vars,
  });
}
