import { create } from 'zustand';
import type { Tampilan } from '../components/agents/AgentsViewDropdown';

/*
 * View yang sedang terbuka di panel kanan jendela Agents.
 *
 * Dulu ini `useState` di dalam `AgentsPanelKanan`. Komponen itu di-unmount
 * setiap kali panel ditutup (induknya `AgentsApp` merender kondisional), jadi
 * toggle panel selalu mengembalikan user ke `Start here` — semua pilihannya
 * hilang. Dengan disimpan di store modul, pilihan terakhir bertahan selama
 * jendela hidup (tidak ditulis ke disk: bukan pengaturan, hanya posisi sesi).
 */
export const useAgxPanelKanan = create<{
  tampilan: Tampilan;
  setTampilan: (v: Tampilan) => void;
}>((set) => ({
  tampilan: 'start',
  setTampilan: (v) => set({ tampilan: v }),
}));
