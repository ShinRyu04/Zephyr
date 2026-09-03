// lib-cdp helper: fokus WEBVIEW tanpa memunculkan jendela ke depan.
//
// Kenapa ada: harness dulu memakai `Page.bringToFront`, yang MENYAMBAR fokus
// jendela Windows — kalau user sedang main game / kerja di app lain, jendela
// Zephyr melompat ke depan dan mengganggu. Padahal yang benar-benar dibutuhkan
// harness hanyalah dokumen dianggap fokus supaya keyboard event & clipboard
// jalan; itu disediakan `Emulation.setFocusEmulationEnabled` TANPA mengubah
// jendela mana yang di depan.
//
// Pakai: `await fokusDiam(cdp)` sebagai pengganti bringToFront.

/**
 * Buat WebView menganggap dirinya fokus, tanpa mengangkat jendela.
 * @param {{ send: (m: string, p?: object) => Promise<unknown> }} cdp
 */
export async function fokusDiam(cdp) {
  // Emulation: dokumen dianggap fokus & terlihat -> rAF jalan, keydown diproses.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  // Paksa page dianggap terlihat walau jendela di belakang/minimize.
  await cdp
    .send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    .catch(() => {});
  return true;
}
