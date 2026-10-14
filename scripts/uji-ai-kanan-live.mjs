import { Cdp, tungguBridge, reporter, keluarBersih } from './lib-cdp.mjs';

/*
 * UJI LIVE — AI tidak boleh lagi punya rumah di GRUP PANEL BAWAH.
 *
 * Yang dibuktikan (semua dari instance yang SEDANG jalan, bukan dari kode):
 *   V1 PANEL_TABS grup bawah tidak lagi memuat id 'ai';
 *   V2 panel.visibleTabs() tidak memuat 'ai' (isinya dicetak apa adanya);
 *   V3 DOM tab strip grup bawah tidak punya tab 'ai' dan tidak ada node chat
 *      AI di dalam `section.panel-area`;
 *   V4 jalur lama (setActivity('ai'), ai.panel, aiPanel.focus, ai.newChat,
 *      view.hideAiPanel) TIDAK bisa lagi mengisi panel bawah dengan AI:
 *      activeTab != 'ai', visibleTabs bersih, tidak ada node AI di bawah;
 *   V5 jalur lama justru membuka AI di KOLOM KANAN (selector + lebar + induk);
 *   V6 papan AI di kanan: `[data-testid="ai-side-col"]` ada, lebarnya > 0,
 *      BUKAN di dalam panel bawah, dan AI-nya ber-data-pos="kanan";
 *   V7 preferensi tersimpan yang masih berisi 'ai' dibuang saat hydrate.
 *
 * Jalankan foreground: node scripts/uji-ai-kanan-live.mjs
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page =
  list.find((t) => t.type === 'page' && /Zephyr/i.test(t.title ?? '')) ??
  list.find((t) => t.type === 'page');
if (!page) {
  console.error('GAGAL: tidak ada halaman di CDP 9223');
  keluarBersih(1);
}

const { cdp } = await Cdp.attach('9223', page.title);
await tungguBridge(cdp, '__ZEPHYR_PANEL__');
await tungguBridge(cdp, '__ZEPHYR_NOTIF__');

const r = await cdp.runAsync(
  `
  await wait(400);
  const P = window.__ZEPHYR_PANEL__;
  /* Runner command yang SEBENARNYA: runCommand(id). __ZEPHYR_CMD__ BUKAN runner
     (itu undo/redo) — memakainya membuat "uji jalur command" cuma no-op. */
  const RUN = (id) => window.__ZEPHYR_NOTIF__.run(id);
  const KOLOM = () => q('[data-testid="ai-side-col"]');

  const potretBawah = () => ({
    panelTabsSemua: P.PANEL_TABS.map((t) => t.id),
    visibleTabs: P.visibleTabs(),
    activeTab: P.activeTab(),
    panelTerlihat: P.visible(),
    tinggiPanel: P.height(),
    domTabIds: qa('[data-testid="pts-tab"]').map((b) => b.dataset.tab),
    domLabelTab: qa('[data-testid="pts-tab"]').map((b) => b.textContent.trim()),
    domActiveTabAttr: q('[data-testid="panel-body"]')?.getAttribute('data-active-tab') ?? null,
    domPanelAda: !!q('section.panel-area'),
    domPanelAdaDiDalamnya:
      !!q('section.panel-area [data-testid="ai-panel"], section.panel-area [data-testid="ai-host"]'),
    domAdaTabAiDiStrip: !!q('[data-testid="panel-tabstrip"] [data-tab="ai"]'),
  });

  const potretKolom = () => {
    const col = KOLOM();
    if (!col) return null;
    const ai = col.querySelector('[data-testid="ai-panel"]');
    return {
      selector: '[data-testid="ai-side-col"]',
      tag: col.tagName,
      lebar: col.offsetWidth,
      tinggi: col.offsetHeight,
      dataLebar: col.getAttribute('data-lebar'),
      flexBasis: getComputedStyle(col).flexBasis,
      induk: col.parentElement ? col.parentElement.tagName + '.' + col.parentElement.className : null,
      indukTestid: col.parentElement?.getAttribute('data-testid') ?? null,
      diDalamPanelBawah: !!col.closest('section.panel-area, [data-testid="panel-body"]'),
      aiPanelDiDalamKolom: !!ai,
      dataPosAiPanel: ai?.getAttribute('data-pos') ?? null,
      jumlahTabAiHost: col.querySelectorAll('[data-testid^="ai-host-tab-"]').length,
      hostAda: !!col.querySelector('[data-testid="ai-host"]'),
    };
  };

  const sebelumSemua = potretBawah();
  const setelanAwal = s.settings.general.aiPanel ?? null;
  const kolomAwal = potretKolom();

  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await wait(500);

  const jalur = [];
  const ujiJalur = async (nama, fn, harapKolom) => {
    const sebelum = {
      activeTab: P.activeTab(),
      panelTerlihat: P.visible(),
      kolomKananAda: !!KOLOM(),
      lebarKolom: KOLOM()?.offsetWidth ?? -1,
    };
    let error = null;
    let hasil = null;
    try {
      const v = await fn();
      hasil = v === undefined ? null : JSON.stringify(v);
    } catch (e) {
      error = String((e && e.message) || e);
    }
    await wait(800);
    const kk = potretKolom();
    const sesuaiHarap =
      harapKolom === 'toggle' ? !!kk !== sebelum.kolomKananAda : !!kk === harapKolom;
    jalur.push({
      jalur: nama,
      harapKolom,
      hasil,
      error,
      sebelum,
      sesudah: potretBawah(),
      kolomKanan: kk,
      sesuaiHarap,
    });
  };

  await ujiJalur("setActivity('ai')", () => S.getState().setActivity('ai'), true);
  /* 'ai.panel' = "AI: Toggle AI Panel" — memang toggle, jadi harapannya berbalik
     dari keadaan sebelumnya, bukan selalu "terbuka". */
  await ujiJalur("runCommand('ai.panel')", () => RUN('ai.panel'), 'toggle');
  await ujiJalur("runCommand('aiPanel.focus')", () => RUN('aiPanel.focus'), true);
  await ujiJalur("runCommand('view.hideAiPanel')", () => RUN('view.hideAiPanel'), false);
  /* jalur MCP 'ai.focus' (mcpStore.ts runEditorCommand): efek akhirnya sama —
     buka kolom kanan lalu lepas event 'zephyr-ai-focus' (didengar AiPanel.tsx). */
  {
    const sebelum = {
      activeTab: P.activeTab(),
      panelTerlihat: P.visible(),
      kolomKananAda: !!KOLOM(),
      lebarKolom: KOLOM()?.offsetWidth ?? -1,
    };
    S.getState().setAiKolomVisible(true);
    await wait(400);
    window.dispatchEvent(new Event('zephyr-ai-focus'));
    await wait(700);
    const kk = potretKolom();
    const ak = document.activeElement;
    const diKolom = !!(ak && KOLOM() && KOLOM().contains(ak));
    jalur.push({
      jalur: "event 'zephyr-ai-focus' (jalur MCP 'ai.focus')",
      harapKolom: true,
      hasil: JSON.stringify({ diKolom: diKolom }),
      fokus: { diKolom, tagAktif: ak ? ak.tagName : null },
      error: null,
      sebelum,
      sesudah: potretBawah(),
      kolomKanan: kk,
      sesuaiHarap: !!kk,
    });
  }

  /* ai.newChat sengaja TIDAK dipanggil: ia memulai percakapan baru dan bisa
     membuang konteks chat user yang sedang jalan — manfaatnya nol untuk uji ini. */

  /* preferensi tersimpan dari versi lama: visibleTabs ['ai','terminal'] + activeTab 'ai' */
  const simpanVis = P.visibleTabs();
  const simpanAktif = P.activeTab();
  P.hydrate(['ai', 'terminal'], 'ai');
  await wait(250);
  const sesudahHydrateBasi = potretBawah();
  P.hydrate(simpanVis, simpanAktif);
  await wait(200);

  /* potret akhir: AI dibuka lewat jalur yang benar (kolom kanan) */
  S.getState().setAiKolomVisible(true);
  await wait(800);
  const akhir = { ...potretBawah(), kolomKanan: potretKolom() };

  await S.getState().applySettings({ general: { aiPanel: setelanAwal ?? 'right' } });
  await wait(400);

  return {
    app: document.title,
    setelanAwal,
    sebelumSemua,
    kolomAwal,
    jalur,
    sesudahHydrateBasi,
    akhir,
  };
`,
  120000,
);

console.log(JSON.stringify(r, null, 2));

const rep = reporter('uji-ai-kanan');
const b = r.sebelumSemua;

rep.check(
  'V1',
  !b.panelTabsSemua.includes('ai'),
  `PANEL_TABS grup bawah = [${b.panelTabsSemua.join(', ')}] (memuat 'ai'? ${b.panelTabsSemua.includes('ai')})`,
);
rep.check(
  'V2',
  !b.visibleTabs.includes('ai'),
  `visibleTabs = [${b.visibleTabs.join(', ')}] aktif='${b.activeTab}' (memuat 'ai'? ${b.visibleTabs.includes('ai')})`,
);
rep.check(
  'V3',
  !b.domTabIds.includes('ai') && !b.domAdaTabAiDiStrip && !b.domPanelAdaDiDalamnya,
  `DOM tab grup bawah = [${b.domTabIds.join(', ')}] label=[${b.domLabelTab.join(' | ')}] data-active-tab='${b.domActiveTabAttr}' node AI di dalam panel bawah=${b.domPanelAdaDiDalamnya}`,
);

const jalur = r.jalur;
const jalurBocor = jalur.filter(
  (j) =>
    j.sesudah.activeTab === 'ai' ||
    j.sesudah.visibleTabs.includes('ai') ||
    j.sesudah.domPanelAdaDiDalamnya ||
    j.sesudah.domAdaTabAiDiStrip,
);
rep.check(
  'V4',
  jalurBocor.length === 0,
  `${jalur.length} jalur lama diuji, bocor ke panel bawah: ${jalurBocor.length === 0 ? 'tidak ada' : jalurBocor.map((j) => j.jalur).join(', ')}`,
);
for (const j of jalur) {
  console.log(
    `       · ${j.jalur.padEnd(26)} hasil=${j.hasil} -> panel aktif='${j.sesudah.activeTab}' visibleTabs=[${j.sesudah.visibleTabs.join(', ')}] panelTerlihat=${j.sesudah.panelTerlihat} nodeAiDiBawah=${j.sesudah.domPanelAdaDiDalamnya} kolomKanan=${j.kolomKanan ? j.kolomKanan.lebar + 'px' : 'TIDAK ADA'} harap=${j.harapKolom === 'toggle' ? 'toggle' : j.harapKolom ? 'buka' : 'tutup'}${j.sesuaiHarap ? '' : ' SALAH'}${j.error ? ' error=' + j.error : ''}`,
  );
}

const salahHarap = jalur.filter((j) => !j.sesuaiHarap);
rep.check(
  'V5',
  salahHarap.length === 0,
  `${jalur.length - salahHarap.length}/${jalur.length} jalur berakhir sesuai harapan (AI muncul/hilang di kolom KANAN)${salahHarap.length ? ': menyimpang -> ' + salahHarap.map((j) => j.jalur).join(', ') : ''}`,
);

/* hanya jalur perintah yang punya hasil runCommand (boolean string). Jalur
   event ('zephyr-ai-focus') menyimpan potret JSON {diKolom}, jadi jangan
   dituntut 'true' — dulu itu bikin V5b merah padahal jalurnya benar. */
const jalurCmd = jalur.filter((j) => j.hasil !== null && !j.fokus);
rep.check(
  'V5b',
  jalurCmd.length > 0 && jalurCmd.every((j) => j.hasil === 'true'),
  `${jalurCmd.length} jalur perintah runCommand mengembalikan: ${jalurCmd.map((j) => j.jalur + '=' + j.hasil).join(', ')}`,
);

const k = r.akhir.kolomKanan;
rep.check(
  'V6',
  !!(k && k.lebar > 0 && !k.diDalamPanelBawah && k.dataPosAiPanel === 'kanan'),
  k
    ? `selector=${k.selector} lebar=${k.lebar}px tinggi=${k.tinggi} data-lebar=${k.dataLebar} induk=${k.induk} (testid induk=${k.indukTestid}) diDalamPanelBawah=${k.diDalamPanelBawah} data-pos AI='${k.dataPosAiPanel}'`
    : 'kolom kanan TIDAK ADA',
);
rep.check(
  'V7',
  !r.sesudahHydrateBasi.visibleTabs.includes('ai') && r.sesudahHydrateBasi.activeTab !== 'ai',
  `hydrate(['ai','terminal'],'ai') -> visibleTabs=[${r.sesudahHydrateBasi.visibleTabs.join(', ')}] activeTab='${r.sesudahHydrateBasi.activeTab}'`,
);

const jFokus = jalur.find((j) => j.fokus);
rep.check(
  'V8',
  !!(jFokus && jFokus.fokus.diKolom),
  jFokus
    ? `event 'zephyr-ai-focus' (jalur MCP ai.focus) -> focus pindah ke dalam kolom KANAN? ${jFokus.fokus.diKolom} (activeElement=${jFokus.fokus.tagAktif})`
    : 'jalur zephyr-ai-focus tidak diuji',
);

console.log(
  `\n   panel bawah akhir: visibleTabs=[${r.akhir.visibleTabs.join(', ')}] activeTab='${r.akhir.activeTab}' terlihat=${r.akhir.panelTerlihat} tinggi=${r.akhir.tinggiPanel}px`,
);
console.log(`   kolom kanan akhir: ${k ? k.lebar + 'px, induk ' + k.induk + ', diDalamPanelBawah=' + k.diDalamPanelBawah : 'tidak ada'}`);

rep.selesai();
await cdp.close();
keluarBersih(process.exitCode ?? 0);
