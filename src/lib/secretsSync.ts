import { listen } from '@tauri-apps/api/event';
import { EV } from './events';

/*
 * Daftar API key HARUS ikut berubah di SEMUA jendela.
 *
 * Gejala yang dilaporkan: "gua masukin API key, kok di jendela agent nggak
 * kebaca". Penyebabnya bukan penyimpanan — key-nya benar-benar tertulis di
 * `secrets.json` (terbukti: panel Models melihatnya). Masalahnya, tiap jendela
 * menyimpan SALINAN daftar itu (`useAi.keys` + `useSettingsUi.keys`) dan hanya
 * jendela yang MENYIMPAN key yang memperbarui salinannya. Jendela lain baru
 * tahu setelah di-reload, jadi ia terus menampilkan "provider ini belum punya
 * API key" untuk key yang jelas ada.
 *
 * Rust mengirim `secrets-changed` setelah `set_model_key` berhasil; modul ini
 * menangkapnya dan menyegarkan kedua salinan. `focus` ikut didengarkan sebagai
 * jaring pengaman: event yang terlewat saat jendela tidak aktif tetap
 * tertangkap begitu jendela itu dipakai, tanpa perlu reload.
 */

let terpasang = false;

async function segarkanKunci(): Promise<void> {
  const [{ useAi }, { useSettingsUi }] = await Promise.all([
    import('./aiStore'),
    import('./settingsStore'),
  ]);
  await Promise.all([
    useAi.getState().loadKeys(),
    useSettingsUi.getState().loadKeys(),
  ]).catch(() => {
    /* non-fatal: jendela tetap memakai daftar terakhir yang ia punya */
  });
}

export function pasangSinkronKunci(): void {
  if (terpasang) return;
  terpasang = true;

  /* Sudah ada di disk tapi belum pernah dibaca jendela ini? Baca sekarang. */
  void segarkanKunci();

  void listen(EV.secretsChanged, () => {
    void segarkanKunci();
  }).catch(() => {
    /* non-Tauri origin (browser preview / harness): tidak ada event */
    terpasang = false;
  });

  window.addEventListener('focus', () => {
    void segarkanKunci();
  });
}
