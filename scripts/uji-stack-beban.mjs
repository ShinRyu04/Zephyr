/**
 * uji-stack-beban.mjs - buktikan isi tumpukan tidak lagi terpotong/bersarang.
 *
 *   node scripts/uji-stack-beban.mjs 9223
 *
 * LATAR: panel hanya merender EMPAT jejak terakhir (`JEJAK_TOOL_MAKS = 4`), dan
 * satu baris detail tingginya sekitar 24px. Jadi menumpuk ratusan langkah TIDAK
 * membebani apa pun - dan uji yang mengira begitu akan "lulus" tanpa mengukur
 * hal yang penting.
 *
 * Yang benar-benar diuji di sini, dan yang menjawab keluhan "ketimbun dan
 * melayang":
 *   1. isi tumpukan TIDAK punya scroll sendiri di dalam scroller percakapan
 *      (dulu `.ai-agent` punya `max-height:130px; overflow-y:auto`)
 *   2. tiap baris terlihat UTUH, tidak dipotong di tengah kalimat
 *   3. baris dengan argumen sangat panjang tetap muat - dulu ia langsung
 *      terpotong angka 130px
 *   4. tumpukan punya batas atas yang wajar sebagai jaring pengaman
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('stack-beban');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* Satu langkah dengan argumen SANGAT panjang - inilah beban yang nyata. */
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');

  /* Panjangnya melebihi 130px berkali-kali lipat: kalau batas lama masih ada,
     baris ini pasti terpotong. */
  const panjang = 'jalan/yang/sangat/panjang/dan/dalam/'.repeat(14);
  const langkah = [];
  for (let i = 0; i < 12; i++) {
    langkah.push({
      tool: 'read_file',
      args: '{ path: "/' + panjang + 'berkas-' + i + '.tsx" }',
      at: Date.now() + i,
      ok: true,
      ms: 40 + i,
    });
  }
  a.useAi.setState({ agentBusy: true, agentSteps: langkah, agentPhase: 'working' });
  await new Promise((res) => setTimeout(res, 1000));

  /* Buka lipatannya, seperti pengguna mengklik panahnya. Tanpa ini isinya tidak
     dirender sama sekali (AiPanel.tsx:938). */
  const kepala = document.querySelector('.ai-work-summary');
  if (kepala && kepala.getAttribute('aria-expanded') !== 'true') {
    kepala.click();
    await new Promise((res) => setTimeout(res, 600));
  }

  return { jumlah: (a.useAi.getState().agentSteps || []).length, terbuka: !!document.querySelector('.ai-work-body') };
})())`);

r.check('B0', isi.jumlah > 0 && isi.terbuka === true, `${isi.jumlah} langkah panjang disiapkan, lipatan terbuka`);

const ukur = await cdp.json(`return JSON.stringify((() => {
  const b = document.querySelector('.ai-work-body');
  const s = document.querySelector('.ai-work-stack');
  const c = document.querySelector('.ai-chat');
  if (!b || !s) return { ada: false };

  const baris = [...b.querySelectorAll('.ai-work-detail, .ai-work-step')];
  const terpotong = baris.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);

  /* Semua elemen yang bisa menggulir sendiri di dalam tumpukan. */
  const gulirDalam = [];
  s.querySelectorAll('*').forEach((e) => {
    const st = getComputedStyle(e);
    if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) {
      gulirDalam.push(String(e.className).slice(0, 50));
    }
  });

  return {
    ada: true,
    vh: window.innerHeight,
    batas: getComputedStyle(b).maxHeight,
    bodyTinggi: Math.round(b.getBoundingClientRect().height),
    bodyIsi: b.scrollHeight,
    jumlahBaris: baris.length,
    terpotong: terpotong.map((e) => ({ kelas: String(e.className).slice(0, 40), isi: e.scrollHeight, kotak: e.clientHeight })),
    gulirDalam,
    chatGulir: c ? getComputedStyle(c).overflowY : null,
    lewatJendela: s.getBoundingClientRect().bottom > window.innerHeight + 1,
  };
})())`);

r.check('B1', ukur.ada === true, `tumpukan terukur: ${ukur.jumlahBaris} baris di dalamnya`);

if (ukur.ada) {
  /*
   * Inilah inti perbaikannya: TIDAK ADA scroll bersarang di dalam tumpukan.
   * Dulu `.ai-agent` punya satu, dan itulah yang membuat isinya menggulir
   * tanpa menggerakkan percakapan - terlihat terpotong dan melayang.
   */
  r.check(
    'B2',
    ukur.gulirDalam.length === 0,
    `tidak ada scroll bersarang di dalam tumpukan (ketemu ${ukur.gulirDalam.length}: ${JSON.stringify(ukur.gulirDalam)})`,
  );

  /* Baris panjang harus terlihat UTUH - ini yang dulu dipotong 130px. */
  r.check(
    'B3',
    ukur.terpotong.length === 0,
    `tidak ada baris yang terpotong (${ukur.terpotong.length} dari ${ukur.jumlahBaris}): ${JSON.stringify(ukur.terpotong)}`,
  );

  /* Percakapan tetap satu-satunya scroller. */
  r.check(
    'B4',
    ukur.chatGulir === 'auto' || ukur.chatGulir === 'scroll',
    `percakapan tetap satu-satunya scroller (overflow-y: ${ukur.chatGulir})`,
  );

  /* Jaring pengaman: batasnya ada, wajar, dan tidak dilampaui. */
  const batas = parseFloat(ukur.batas);
  r.check(
    'B5',
    Number.isFinite(batas) && batas > 100 && batas <= ukur.vh * 0.5,
    `batas atas tetap ada sebagai jaring pengaman (${ukur.batas}, jendela ${ukur.vh}px)`,
  );
  r.check(
    'B6',
    ukur.lewatJendela === false,
    `tumpukan tidak melampaui jendela`,
  );
}

/* ---- Bersihkan ---- */

await cdp.json(`return JSON.stringify(await (async () => {
  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');
  a.useAi.setState({ agentBusy: false, agentSteps: [], agentPhase: null });
  return { bersih: true };
})())`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
