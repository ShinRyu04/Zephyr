import { create } from 'zustand';
import { useStore } from './store';

export interface ExtApproval {
  extId: string;
  runtime: string;
  
  binPath: string;
  args: string[];
  cwd: string | null;
  
  selesaikan: (setujui: boolean) => void;
}

interface ApprovalState {
  antrean: ExtApproval[];
}

interface ApprovalActions {
  
  minta: (p: Omit<ExtApproval, 'selesaikan'>) => Promise<boolean>;
  
  putuskan: (setujui: boolean) => Promise<void>;
}

export const useExtApproval = create<ApprovalState & ApprovalActions>((set, get) => ({
  antrean: [],

  minta: (p) =>
    new Promise<boolean>((resolve) => {
      set((s) => ({ antrean: [...s.antrean, { ...p, selesaikan: resolve }] }));
    }),

  putuskan: async (setujui) => {
    const kepala = get().antrean[0];
    if (!kepala) return;
    set((s) => ({ antrean: s.antrean.slice(1) }));

    if (setujui) {
      
      const trust = { ...(useStore.getState().settings.extensions.trust ?? {}) };
      const lama = trust[kepala.extId];
      trust[kepala.extId] = {
        runtimes: { ...(lama?.runtimes ?? {}), [kepala.runtime]: kepala.binPath },
        grantedAt: lama?.grantedAt ?? new Date().toISOString(),
      };
      const ok = await useStore
        .getState()
        .applySettings({ extensions: { trust } })
        .then(() => true)
        .catch(() => false);
      kepala.selesaikan(ok);
      return;
    }
    kepala.selesaikan(false);
  },
}));
