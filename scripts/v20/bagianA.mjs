// v20/bagianA.mjs — V2..V3: toggle panel + tinggi persist, terminal instance sama.

import fs from 'node:fs';
import path from 'node:path';

const SETTINGS = path.join(process.env.APPDATA ?? '', 'zephyr', 'settings.json');

export const bagianA = async (cdp, check) => {
  // ═════════ V2: Ctrl+J toggle + tinggi tersimpan ═════════
  const v2 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    const KB = window.__ZEPHYR_KB__;
    TS().setVisible(true);
    await wait(300);
    const adaAwal = !!q('[data-testid="panel-tabstrip"]');

    // Ctrl+J lewat resolver chord asli (bukan panggil store langsung).
    KB.press('Ctrl+J');
    await wait(400);
    const setelahTutup = { visible: P.visible(), adaStrip: !!q('[data-testid="panel-tabstrip"]'),
                           adaTombol: !!q('[data-testid="term-show"]') };

    KB.press('Ctrl+J');
    await wait(400);
    const setelahBuka = { visible: P.visible(), adaStrip: !!q('[data-testid="panel-tabstrip"]') };

    // Ubah tinggi lalu paksa persist (drag sungguhan tidak bisa dari CDP).
    TS().setHeight(322);
    await P.store.getState().persist();
    await wait(500);
    const tinggiStore = P.height();
    const gaya = q('.panel-area') ? q('.panel-area').style.height : null;
    const cmdChord = KB.chordFor('workbench.action.togglePanel');
    return JSON.stringify({ adaAwal, setelahTutup, setelahBuka, tinggiStore, gaya, cmdChord });
  `,
    60000,
  );
  let tinggiDisk = null;
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    tinggiDisk = raw?.panel?.height ?? null;
  } catch (e) {
    tinggiDisk = `gagal baca: ${e.message}`;
  }
  check(
    'V2',
    v2.adaAwal &&
      !v2.setelahTutup.visible &&
      !v2.setelahTutup.adaStrip &&
      v2.setelahTutup.adaTombol &&
      v2.setelahBuka.visible &&
      v2.setelahBuka.adaStrip &&
      v2.tinggiStore === 322 &&
      v2.gaya === '322px' &&
      tinggiDisk === 322 &&
      v2.cmdChord === 'Ctrl+J',
    `Ctrl+J (${v2.cmdChord}) → tutup: visible=${v2.setelahTutup.visible} strip=${v2.setelahTutup.adaStrip} ` +
      `tombol=${v2.setelahTutup.adaTombol}; buka: visible=${v2.setelahBuka.visible} strip=${v2.setelahBuka.adaStrip}; ` +
      `tinggi store=${v2.tinggiStore} DOM=${v2.gaya} disk=${tinggiDisk}; stripAwal=${v2.adaAwal}`,
  );

  // ═════════ V3: tab Terminal = instance fase 05/06 yang SAMA ═════════
  const v3 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    P.focusTab('terminal');
    await wait(400);
    const paneId = await TS().addPane('shell');
    if (!paneId) return JSON.stringify({ gagal: 'addPane gagal' });
    await wait(2500);

    // Jalankan perintah nyata lewat PTY.
    await window.__ZEPHYR_PTY__.write(paneId, 'node -v\\r');
    await wait(2500);
    const pidSebelum = TS().findPane(paneId) ? TS().findPane(paneId).pid : null;
    const bufSebelum = window.__ZEPHYR_PTY__.read(paneId, 400);

    // Tutup panel (Ctrl+J) lalu buka lagi.
    window.__ZEPHYR_KB__.press('Ctrl+J');
    await wait(700);
    const tertutup = !P.visible();
    window.__ZEPHYR_KB__.press('Ctrl+J');
    await wait(900);

    const pane = TS().findPane(paneId);
    const pidSesudah = pane ? pane.pid : null;
    const bufSesudah = window.__ZEPHYR_PTY__.read(paneId, 400);
    const status = pane ? pane.status : null;

    // Pindah ke tab lain lalu kembali — holder xterm tidak boleh di-unmount.
    P.focusTab('problems');
    await wait(400);
    const hostAdaSaatTabLain = !!q('[data-testid="panel-term-host"]');
    const hostTersembunyi = hostAdaSaatTabLain
      ? getComputedStyle(q('[data-testid="panel-term-host"]')).display
      : null;
    P.focusTab('terminal');
    await wait(500);
    const bufAkhir = window.__ZEPHYR_PTY__.read(paneId, 400);
    const paneAkhir = TS().findPane(paneId);

    return JSON.stringify({
      paneId,
      pidSebelum, pidSesudah,
      adaVersiSebelum: /v\\d+\\.\\d+/.test(bufSebelum),
      adaVersiSesudah: /v\\d+\\.\\d+/.test(bufSesudah),
      adaVersiAkhir: /v\\d+\\.\\d+/.test(bufAkhir),
      tertutup, status,
      hostAdaSaatTabLain, hostTersembunyi,
      pidAkhir: paneAkhir ? paneAkhir.pid : null,
      panjangBuf: bufSesudah.length,
    });
  `,
    120000,
  );
  check(
    'V3',
    !v3.gagal &&
      v3.pidSebelum &&
      v3.pidSesudah === v3.pidSebelum &&
      v3.pidAkhir === v3.pidSebelum &&
      v3.adaVersiSebelum &&
      v3.adaVersiSesudah &&
      v3.adaVersiAkhir &&
      v3.tertutup &&
      v3.status === 'live' &&
      v3.hostAdaSaatTabLain &&
      v3.hostTersembunyi === 'none',
    v3.gagal
      ? v3.gagal
      : `pid ${v3.pidSebelum}→${v3.pidSesudah}→${v3.pidAkhir}; versi node terbaca ` +
        `${v3.adaVersiSebelum}/${v3.adaVersiSesudah}/${v3.adaVersiAkhir}; tertutup=${v3.tertutup}; ` +
        `status=${v3.status}; host ada saat tab lain=${v3.hostAdaSaatTabLain} display=${v3.hostTersembunyi}; ` +
        `buffer ${v3.panjangBuf} char`,
  );
};
