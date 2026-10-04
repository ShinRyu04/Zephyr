/**
 * deskripsiToolHook.ts - versi HOOK dari deskripsi tool, sengaja dipisah.
 *
 * Kenapa dipisah dari `deskripsiTool.ts`.
 *
 * Hook ini butuh `useStore`, dan mengimpor store dari `deskripsiTool.ts`
 * membuat berkas DATA itu tidak lagi murni. Akibatnya `catalog.ts` - yang
 * mengimpor `deskripsiTool.ts` - ikut menarik seluruh rantai aplikasi:
 * store -> terminalStore -> xterm -> CodeMirror. Di Node, rantai itu memanggil
 * `self` dan `document`, sehingga skrip verifikasi katalog di `scripts/` gagal
 * dimuat dengan "FATAL: katalog tidak bisa dimuat" - padahal katalognya sendiri
 * tidak pernah berubah dan tetap murni data.
 *
 * Menambal Node dengan `self` palsu hanya memindahkan masalahnya: sesudah itu
 * CodeMirror yang menuntut DOM. Yang benar adalah memutus rantainya, dan cara
 * termurah adalah memisahkan bagian yang MEMANG butuh store.
 *
 * Aturan yang berlaku sekarang: `deskripsiTool.ts` tidak boleh mengimpor apa
 * pun dari store. Kalau suatu saat ia butuh, taruh di berkas ini.
 */
import { useStore } from '../store';
import { deskripsiTool, POLA_AWALAN_MCP } from './deskripsiTool';

/**
 * Versi hook, untuk komponen yang harus ikut render ulang saat bahasa diganti.
 *
 * Langganannya ke `uiLang` di store - sama seperti `useLabel` di labelI18n.ts -
 * karena tanpa itu panel Tools tetap menampilkan bahasa lama sampai ada hal
 * lain yang memicu render.
 */
export function useDeskripsiTool(): (nama: string) => string {
  const bahasa = useStore((s) => s.settings.general.uiLang);
  return (nama) => deskripsiTool(nama.replace(POLA_AWALAN_MCP, ''), bahasa);
}
