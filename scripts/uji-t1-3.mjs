// uji-t1-3.mjs — verifikasi T1.3 (HTTP client .http).
//
// UJI NYATA: menjalankan server HTTP kecil di dalam app (lewat fetch ke
// server uji yang sudah ada) — bukan mock. Yang dibuktikan:
//   1. Rust mem-parse file .http jadi daftar request (termasuk variabel)
//   2. Tab "HTTP" muncul di panel bawah
//   3. Request benar-benar dikirim & response diterima
//   4. Status code & body terbaca
//   5. Error transport (host mati) ditangani, bukan crash
//
// Pakai: node scripts/uji-t1-3.mjs

import { Cdp } from './lib-cdp.mjs';

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');

// Isi file .http untuk uji — pakai server uji mock-ai (port 8098) yang sudah
// ada di repo, supaya tidak butuh internet.
const ISI_HTTP = [
  '# File uji T1.3',
  '@base = http://127.0.0.1:8098',
  '',
  '### Cek versi',
  '# @name versi',
  'GET {{base}}/__version',
  'Accept: application/json',
  '',
  '### Host mati (uji error)',
  '# @name mati',
  'GET http://127.0.0.1:9/tidak-ada',
  '',
].join('\n');

try {
  // ── 1. Rust mem-parse file .http ──
  const parse = await cdp.json(`return JSON.stringify(await (async () => {
    const r = await window.__TAURI_INTERNALS__.invoke('http_parse', {
      isi: ${JSON.stringify(ISI_HTTP)},
      variabel: [['base', 'http://127.0.0.1:8098']],
    });
    return r;
  })())`);

  cek('http_parse mengembalikan 2 request', parse.length === 2, `n=${parse.length}`);
  if (parse.length === 2) {
    cek('request 1 = GET', parse[0].method === 'GET', parse[0].method);
    cek('URL variabel {{base}} diganti', parse[0].url === 'http://127.0.0.1:8098/__version',
      parse[0].url);
    cek('nama dari # @name', parse[0].nama === 'versi', parse[0].nama);
    cek('header terbaca', parse[0].headers.length === 1,
      JSON.stringify(parse[0].headers));
    cek('request 2 = host mati', parse[1].url.includes('127.0.0.1:9'), parse[1].url);
  }

  // ── 2. request NYATA ke server uji ──
  const kirim = await cdp.json(`return JSON.stringify(await (async () => {
    const r = await window.__TAURI_INTERNALS__.invoke('http_send', {
      method: 'GET',
      url: 'http://127.0.0.1:8098/__version',
      headers: [['Accept', 'application/json']],
      body: null,
      variabel: [],
    });
    return r;
  })())`, 60000);

  cek('http_send berhasil (ok=true)', kirim.ok === true, kirim.error ?? '');
  cek('status 200', kirim.status === 200, `status=${kirim.status}`);
  cek('body memuat version', (kirim.body ?? '').includes('version'),
    (kirim.body ?? '').slice(0, 60));
  cek('waktu tercatat', typeof kirim.ms === 'number' && kirim.ms >= 0, `${kirim.ms}ms`);

  // ── 3. POST dengan body ──
  const post = await cdp.json(`return JSON.stringify(await (async () => {
    const r = await window.__TAURI_INTERNALS__.invoke('http_send', {
      method: 'POST',
      url: 'http://127.0.0.1:8098/__log',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({ uji: 't1-3' }),
      variabel: [],
    });
    return r;
  })())`, 60000);
  cek('POST terkirim (server menjawab)', post.status > 0, `status=${post.status}`);

  // ── 4. host mati -> error transport, bukan crash ──
  const mati = await cdp.json(`return JSON.stringify(await (async () => {
    const r = await window.__TAURI_INTERNALS__.invoke('http_send', {
      method: 'GET',
      url: 'http://127.0.0.1:9/tidak-ada',
      headers: [],
      body: null,
      variabel: [],
    });
    return r;
  })())`, 60000);
  cek('host mati -> ok=false', mati.ok === false);
  cek('host mati -> status 0', mati.status === 0, `status=${mati.status}`);
  cek('host mati -> ada pesan error', !!mati.error, (mati.error ?? '').slice(0, 50));

  // ── 5. tab HTTP ada di panel bawah ──
  const tab = await cdp.eval(`(() => {
    const P = window.__ZEPHYR_PANEL__;
    const tabs = P?.visibleTabs?.() ?? [];
    // Cek juga di DOM setelah panel dibuka.
    const T = window.__ZEPHYR_TERM__;
    T.getState().setVisible(true);
    P.store.getState().setActiveTab('http');
    return { adaDiDaftar: tabs.includes('http'), tabs: tabs.join(',') };
  })()`);
  cek('tab "http" terdaftar di panel', tab.adaDiDaftar, tab.tabs);

  await new Promise((r) => setTimeout(r, 900));
  const dom = await cdp.eval(`(() => {
    const v = document.querySelector('[data-testid="http-view"]');
    const e = document.querySelector('[data-testid="http-empty"]');
    const strip = document.querySelector('[data-testid="panel-body"]');
    return {
      adaView: !!v,
      adaEmpty: !!e,
      tabAktif: strip?.getAttribute('data-active-tab') ?? '?',
      teksEmpty: e?.textContent?.slice(0, 70) ?? '',
    };
  })()`);
  cek('panel menampilkan tab http', dom.tabAktif === 'http', dom.tabAktif);
  cek('view http ter-render (kosong atau daftar)', dom.adaView || dom.adaEmpty);

  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
