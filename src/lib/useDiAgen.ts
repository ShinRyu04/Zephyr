import { useEffect, useState } from 'react';

/*
 * "Apakah saya sedang render di window Agents?"
 *
 * Window Agents adalah WebView terpisah dengan root-nya sendiri
 * (`<div class="agents-window-root">`), dan beberapa bagian dipakai bersama
 * window utama (Explorer, Timeline, breadcrumb editor). Pertanyaan ini dipakai
 * untuk mematikan bagian yang hanya masuk akal di window utama.
 *
 * DUA hal yang wajib diperhatikan, keduanya sudah pernah jadi bug:
 *
 * 1. Jawabannya HARUS dibaca di effect, bukan disampel saat render.
 *    `AgentsWindow` mengembalikan `<div class="agents-window-root">` sebagai
 *    root-nya SENDIRI, jadi ketika anak-anaknya render wrapper-nya belum ada di
 *    dokumen — pengecekan saat render membaca `false` di window Agents juga.
 *    Akibatnya Timeline dan header Explorer tetap muncul di kolom agents.
 *
 * 2. Hook ini tinggal di file TERPISAH, bukan di dalam `ExplorerPanel`.
 *    Saat ia diekspor dari `ExplorerPanel` lalu diimpor `CodeMirrorEditor` —
 *    yang pada gilirannya diimpor `ExplorerPanel` — terbentuk impor melingkar,
 *    dan modulnya gagal dimuat: `openPath` berhenti mengisi store sama sekali
 *    (0 tab) padahal sebelumnya berfungsi. Satu file tanpa dependensi ke
 *    komponen mana pun memutus lingkaran itu.
 */
export function useDiAgen(): boolean {
  const [diAgen, setDiAgen] = useState(false);
  useEffect(() => {
    setDiAgen(!!document.querySelector('.agents-window-root'));
  }, []);
  return diAgen;
}
