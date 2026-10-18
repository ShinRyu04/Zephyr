/*
 * Jawab dialog konfirmasi agen secara otomatis.
 *
 * Temuan Fase 5: agen berhenti di `waiting-confirmation` pada langkah 2 dan diam
 * 293 detik. Penyebabnya bukan model dan bukan tool: `send()` menunggu sebuah
 * Promise yang hanya diselesaikan oleh tombol di dialog konfirmasi
 * (`agentConfirmResolve`), dan dialog itu tidak pernah tampil karena run dimulai
 * lewat CDP tanpa jendela chat yang ter-mount.
 *
 * Skrip ini memantau `agentConfirm` dan menyetujuinya, sehingga run bisa
 * berjalan sampai selesai. Yang diuji jadi perilaku MODEL dan TOOL, bukan ada
 * tidaknya UI.
 *
 * Pakai: node scripts/jawab-konfirmasi.mjs [port] [menit]
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const MENIT = Number(process.argv[3] ?? 20);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');

const batas = Date.now() + MENIT * 60000;
let dijawab = 0;
const jejak = [];
/* Berapa kali berturut-turut agen terlihat idle SEBELUM dianggap benar-benar
 * selesai. Satu sampel idle bisa berarti "di antara dua langkah", dan keluar
 * pada sampel itu membuat penjawab mati tepat sebelum dialog berikutnya muncul -
 * itu yang terjadi pada percobaan pertama (0 konfirmasi dijawab, agen macet
 * 113 detik kemudian). */
const IDLE_DIPERCAYA = 6;
let idleBerturut = 0;

console.log('memantau konfirmasi agen...');

while (Date.now() < batas) {
  await new Promise((r) => setTimeout(r, 2500));

  const snap = await cdp
    .json(
      `return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    return {
      busy: A.agentBusy,
      fase: A.agentPhase,
      langkah: A.agentStepIndex,
      tool: A.agentCurrentTool,
      adaKonfirmasi: !!A.agentConfirm,
      konfirmasiTool: A.agentConfirm?.tool ?? null,
      konfirmasiArgs: A.agentConfirm?.argsText?.slice(0, 120) ?? null,
      langkahTools: (A.agentSteps ?? []).length,
      galat: A.agentError ?? null,
    };
  })())`,
      60000,
    )
    .then((x) => (typeof x === 'string' ? JSON.parse(x) : x))
    .catch(() => null);

  if (!snap) continue;

  if (snap.adaKonfirmasi) {
    /*
     * Klik tombol Allow yang SEBENARNYA.
     *
     * `agentConfirmResolve` adalah variabel modul-privat; satu-satunya jalan
     * menyelesaikannya adalah lewat handler tombol di AiPanel. Kalau panel chat
     * belum ter-mount, tombolnya tidak ada - dan itu sendiri temuan: dialog
     * konfirmasi tidak bisa dijawab tanpa UI, jadi run yang dimulai tanpa panel
     * akan menunggu selamanya.
     */
    const hasil = await cdp
      .json(
        `return JSON.stringify((() => {
      const ya = document.querySelector('[data-testid="ai-agent-confirm-yes"]');
      if (ya) { ya.click(); return { cara: 'klik tombol Allow', ada: true }; }
      const panel = document.querySelector('.ai-panel, .ai-confirm');
      return { cara: 'tombol tidak ada', ada: false, panel: !!panel };
    })())`,
        60000,
      )
      .then((x) => (typeof x === 'string' ? JSON.parse(x) : x))
      .catch((e) => ({ cara: 'galat', pesan: String(e) }));

    dijawab++;
    console.log(
      `[${new Date().toLocaleTimeString()}] setujui #${dijawab}: ${snap.konfirmasiTool} (langkah ${snap.langkah}) -> ${hasil.cara}`,
    );
    jejak.push({ tool: snap.konfirmasiTool, langkah: snap.langkah, cara: hasil.cara });
  }

  if (!snap.busy) {
    idleBerturut++;
    if (idleBerturut >= IDLE_DIPERCAYA) {
      console.log(`\nagen selesai (idle ${idleBerturut} sampel). konfirmasi dijawab: ${dijawab}`);
      if (snap.galat) console.log('galat:', snap.galat);
      break;
    }
  } else {
    idleBerturut = 0;
  }
}

console.log('jejak:', JSON.stringify(jejak));
keluarBersih(0);
