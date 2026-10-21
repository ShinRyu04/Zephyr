import { create } from 'zustand';

/*
 * Draft komposer Agents yang bisa ditulis dari LUAR komponennya.
 *
 * Dulu draft-nya state lokal di `AgentsComposer`, dan "Add to Chat" (menu
 * klik kanan pohon File) butuh jalan masuk ke kotak yang sama — tanpa store,
 * path yang dipilih di pohon tidak bisa diantarkan ke composer.
 *
 * Store kecil, bukan bagian `aiStore`: isinya hanya teks draft, sedangkan
 * `aiStore` milik percakapan (sesi, streaming, dsb.) tidak perlu tahu.
 */

export const useAgxDraft = create<{ draft: string; setDraft: (v: string) => void }>((set) => ({
  draft: '',
  setDraft: (v) => set({ draft: v }),
}));
