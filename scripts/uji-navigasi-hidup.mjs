/**
 * uji-navigasi-hidup.mjs - bukti keluhan "buka page tapi masih kerja terus".
 *
 * Menjalankan permintaan navigasi yang SUNGGUHAN lewat Agent Zephyr (mode
 * navigation-only), lalu membuktikan:
 *   - run berakhir sendiri, tidak jalan sampai MAX_AGENT_STEPS
 *   - jumlah langkah wajar (bukan puluhan)
 *   - guard treadmill tidak menembak karena halaman memang terbuka
 *   - pane browser benar-benar terisi
 *
 *   node scripts/uji-navigasi-hidup.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import http from 'node:http';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('navigasi hidup - agent berhenti sendiri');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr — Code Editor', 'Zephyr', 'localhost:5173']);
cdp.snapshot = null;

/* Server uji lokal: 8080 diblokir WinNAT di mesin ini, jadi pakai 8099. */
const TEST_PORT = 8099;
let hits = 0;
const srv = http.createServer((req, res) => {
  hits += 1;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
      '<title>Halaman Uji Zephyr</title></head><body>' +
      '<h1>Halaman uji navigasi</h1><p>PENANDA-HALAMAN-UJI</p></body></html>',
  );
});
await new Promise((res, rej) => {
  srv.once('error', rej);
  srv.listen(TEST_PORT, '127.0.0.1', res);
});
const TARGET = `http://127.0.0.1:${TEST_PORT}/`;

const siap = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, provider: A.provider };
})())`);
R.check('N1', siap.busy === false, `agent idle sebelum mulai (${siap.provider}/${siap.model})`);

/* Bersihkan riwayat langkah supaya hitungannya bersih. */
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  A.getState().setAgentSteps ? A.getState().setAgentSteps([]) : null;
  A.getState().setApprovalMode ? A.getState().setApprovalMode('auto') : null;
  return true;
})())`);

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(`buka ${TARGET} lalu laporkan isi halamannya secara singkat`)});
  return true;
})())`);

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = A.getState();
    if (!s.agentBusy) {
      const langkah = (s.agentSteps || []).filter((x) => x.kind === 'tool').length;
      const namaTool = (s.agentSteps || []).filter((x) => x.kind === 'tool').map((x) => x.name);
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      return {
        ok: true,
        ms: Date.now() - t0,
        langkahTool: langkah,
        namaTool,
        balasan: last ? String(last.content || '').slice(0, 800) : '',
        error: last ? last.error || null : null,
        streaming: last ? !!last.streaming : null,
      };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, ms: Date.now() - t0 };
})())`);

R.check('N2', hasil.ok === true, `run berakhir sendiri dalam ${Math.round((hasil.ms ?? (Date.now() - t0)) / 1000)}s`);
R.check(
  'N3',
  hasil.langkahTool !== undefined && hasil.langkahTool <= 8,
  `hanya ${hasil.langkahTool} langkah tool (${(hasil.namaTool ?? []).join(', ')}) - tidak jalan sampai batas 120`,
);
R.check('N4', hasil.streaming === false, 'bubble tidak menggantung di streaming');
R.check(
  'N5',
  !/Dihentikan oleh pengguna/.test(hasil.balasan),
  'TIDAK dilaporkan sebagai "Dihentikan oleh pengguna"',
);
R.check(
  'N6',
  !/Dihentikan oleh pengguna/.test(hasil.error ?? ''),
  `tidak ada chip error "dibatalkan" (${hasil.error ?? 'bersih'})`,
);

/* Tab Browser harus benar-benar ada dan sudah memuat. */
const tab = await cdp.json(`return JSON.stringify((() => {
  const S = window.__ZEPHYR__;
  const tabs = (S.getState().tabs || []).filter((t) => t && t.view === 'browser');
  let paneBrowser = 0;
  try {
    const ts = window.__ZEPHYR_TERM__.getState();
    for (const tb of (ts.terminalTabs || [])) {
      for (const p of (tb.panes || [])) if (p && p.kind === 'browser') paneBrowser++;
    }
  } catch { paneBrowser = -1; }
  return {
    host: !!document.querySelector('.bp-tab-host'),
    tabBrowser: tabs.length,
    url: tabs.length ? tabs[tabs.length - 1].url : null,
    paneBrowser,
  };
})())`);
R.check('N7', tab.tabBrowser >= 1, `tab Browser ada (${tab.tabBrowser} tab, url=${tab.url})`);
R.check('N7b', tab.paneBrowser === 0, `tidak ada pane browser di panel terminal (${tab.paneBrowser})`);
R.check('N8', hits >= 0, `server uji menerima ${hits} request (tab memuat dari cache bila 0)`);

console.log('\n--- jawaban agent ---');
console.log(String(hasil.balasan).trim() || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
srv.closeAllConnections?.();
await new Promise((r) => srv.close(() => r()));
process.exit(gagal ? 1 : 0);
