/**
 * Terjemahan label yang datang dari data, bukan dari JSX.
 *
 * Sebagian besar label UI hidup di berkas data (daftar menu, daftar action,
 * daftar command, pustaka prompt) dan dibaca saat modul dimuat. Menerjemahkan
 * di tempat itu TIDAK bisa: nilainya dihitung sebelum store siap, dan
 * menerjemahkan sekali di awal berarti labelnya tidak ikut berubah saat
 * pengguna mengganti bahasa.
 *
 * Karena itu terjemahannya dilakukan SAAT RENDER: komponen memanggil
 * labelTerjemah() setiap kali menggambar, dan fungsi ini membaca bahasa aktif
 * dari store. Hasilnya ikut berubah begitu bahasa diganti, tanpa reload.
 *
 * Label aslinya berbahasa Indonesia dan sekaligus jadi kunci kamus, sama
 * seperti tr()/tx() di i18n.
 */

import { useStore } from './store';
import { translate } from './i18n';

/**
 * Terjemahkan satu label data sesuai bahasa antarmuka yang aktif.
 *
 * Aman dipanggil dari komponen maupun dari fungsi biasa: bahasa dibaca
 * langsung dari store, bukan dari hook React.
 */
export function labelTerjemah(teks: string | undefined | null): string {
  if (!teks) return '';
  const lang = useStore.getState().settings.general.uiLang;
  return translate(lang, teks);
}

/** Versi hook: dipakai komponen yang perlu ikut render ulang saat bahasa berganti. */
export function useLabel(): (teks: string | undefined | null) => string {
  // Berlangganan uiLang supaya komponen menggambar ulang saat bahasa diganti.
  const lang = useStore((s) => s.settings.general.uiLang);
  return (teks) => (teks ? translate(lang, teks) : '');
}
