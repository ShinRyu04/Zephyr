// uji-t2-2.mjs — verifikasi T2.2 (API client: collection + environment).
//
// UJI NYATA: collection disimpan, environment dipakai untuk mengganti variabel,
// dan request benar-benar dikirim ke server uji (mock 8098).
//
// Pakai: node scripts/uji-t2-2.mjs

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

try {
  // ── 0. buka tab API ──
  await cdp.eval(`(() => {
    const T = window.__ZEPHYR_TERM__;
    const P = window.__ZEPHYR_PANEL__;
    T.getState().setVisible(true);
    P.store.getState().setActiveTab('api');
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 800));

  // ── 1. store API client ada ──
  const info = await cdp.eval(`(() => {
    const A = window.__ZEPHYR_API__;
    if (!A) return { ada: false };
    const st = A.store.getState();
    return {
      ada: true,
      koleksi: st.collections.length,
      env: st.environments.length,
      envAktif: st.envAktif,
      adaTambahReq: typeof st.tambahRequest === 'function',
      adaUbahEnv: typeof st.ubahEnv === 'function',
      adaVars: typeof st.vars === 'function',
    };
  })()`);

  cek('bridge API client ada', info.ada);
  if (!info.ada) {
    console.log('\n== 1/1 lulus == (bridge tidak ada)');
    process.exit(1);
  }
  cek('default: 1 collection', info.koleksi === 1, `${info.koleksi}`);
  cek('default: 1 environment', info.env === 1, `${info.env}`);
  cek('environment default aktif', !!info.envAktif, `${info.envAktif}`);
  cek('aksi tambahRequest ada', info.adaTambahReq);
  cek('aksi ubahEnv ada', info.adaUbahEnv);
  cek('aksi vars ada', info.adaVars);

  // ── 2. tambah request + environment baru ──
  const tambah = await cdp.json(`return JSON.stringify(await (async () => {
    const A = window.__ZEPHYR_API__;
    const st = A.store.getState();
    const colId = st.collections[0].id;
    const reqId = st.tambahRequest(colId);
    await new Promise((r) => setTimeout(r, 200));
    const envId = st.tambahEnv('Produksi');
    st.ubahEnv(envId, { vars: [['base', 'http://127.0.0.1:8098'], ['token', 'RAHASIA123']] });
    await new Promise((r) => setTimeout(r, 200));
    const s2 = A.store.getState();
    return {
      reqId,
      envId,
      jumlahReq: s2.requests.length,
      jumlahEnv: s2.environments.length,
      varsProduksi: s2.environments.find((e) => e.id === envId)?.vars ?? [],
    };
  })())`);

  cek('request baru dibuat', !!tambah.reqId);
  cek('jumlah request = 1', tambah.jumlahReq === 1, `${tambah.jumlahReq}`);
  cek('environment baru dibuat', tambah.jumlahEnv === 2, `${tambah.jumlahEnv}`);
  cek('variabel environment tersimpan', tambah.varsProduksi.length === 2,
    JSON.stringify(tambah.varsProduksi));

  // ── 3. ganti environment aktif -> variabel efektif berubah ──
  const ganti = await cdp.json(`return JSON.stringify(await (async () => {
    const A = window.__ZEPHYR_API__;
    const st = A.store.getState();
    const envProduksi = st.environments.find((e) => e.nama === 'Produksi');
    const sebelum = st.vars();
    st.setEnvAktif(envProduksi.id);
    await new Promise((r) => setTimeout(r, 200));
    const sesudah = A.store.getState().vars();
    return { sebelum: sebelum.length, sesudah, envAktif: A.store.getState().envAktif };
  })())`);

  cek('ganti environment mengubah variabel efektif',
    ganti.sesudah.some(([k]) => k === 'base'),
    JSON.stringify(ganti.sesudah));
  cek('envAktif berpindah', ganti.envAktif !== null);

  // ── 4. kirim request NYATA memakai variabel {{base}} ──
  const kirim = await cdp.json(`return JSON.stringify(await (async () => {
    const A = window.__ZEPHYR_API__;
    const st = A.store.getState();
    const req = st.requests[0];
    st.ubahRequest(req.id, { url: '{{base}}/__version', method: 'GET' });
    await new Promise((r) => setTimeout(r, 250));
    const r2 = A.store.getState().requests[0];
    try {
      const hasil = await A.kirim(r2, A.store.getState().vars());
      return { ok: true, status: hasil.status, body: (hasil.body ?? '').slice(0, 60), ms: hasil.ms };
    } catch (e) {
      return { ok: false, pesan: String(e).slice(0, 160) };
    }
  })())`, 60000);

  cek('request terkirim lewat API client', kirim.ok, kirim.pesan ?? '');
  cek('variabel {{base}} diganti (status 200)', kirim.status === 200, `status=${kirim.status}`);
  cek('body diterima', (kirim.body ?? '').includes('version'), kirim.body ?? '');

  // ── 5. persistensi: simpan lalu muat ulang ──
  const persist = await cdp.json(`return JSON.stringify(await (async () => {
    const A = window.__ZEPHYR_API__;
    await A.store.getState().simpan();
    const raw = localStorage.getItem('zephyr.apiclient.v1');
    const d = raw ? JSON.parse(raw) : null;
    return {
      adaDiStorage: !!raw,
      jumlahReqStorage: d?.requests?.length ?? 0,
      jumlahEnvStorage: d?.environments?.length ?? 0,
    };
  })())`);

  cek('tersimpan ke localStorage', persist.adaDiStorage);
  cek('request ikut tersimpan', persist.jumlahReqStorage >= 1, `${persist.jumlahReqStorage}`);
  cek('environment ikut tersimpan', persist.jumlahEnvStorage >= 2, `${persist.jumlahEnvStorage}`);

  // ── 6. UI: tab API + elemen builder ──
  const ui = await cdp.eval(`(() => {
    const v = document.querySelector('[data-testid="api-view"]');
    const tabCol = document.querySelector('[data-testid="api-tab-collection"]');
    const tabEnv = document.querySelector('[data-testid="api-tab-env"]');
    const reqs = [...document.querySelectorAll('[data-testid^="api-req-"]')];
    const strip = document.querySelector('[data-testid="panel-body"]');
    return {
      adaView: !!v,
      adaTabCol: !!tabCol,
      adaTabEnv: !!tabEnv,
      jumlahReqUI: reqs.length,
      tabAktif: strip?.getAttribute('data-active-tab') ?? '?',
    };
  })()`);

  cek('view API ter-render', ui.adaView);
  cek('tab Collection ada', ui.adaTabCol);
  cek('tab Environment ada', ui.adaTabEnv);
  cek('request tampil di UI', ui.jumlahReqUI >= 1, `${ui.jumlahReqUI}`);
  cek('panel aktif = api', ui.tabAktif === 'api', ui.tabAktif);

  // ── 7. bersihkan ──
  await cdp.json(`return JSON.stringify(await (async () => {
    const A = window.__ZEPHYR_API__;
    const st = A.store.getState();
    for (const r of st.requests) st.hapusRequest(r.id);
    const envProduksi = st.environments.find((e) => e.nama === 'Produksi');
    if (envProduksi) st.hapusEnv(envProduksi.id);
    st.setEnvAktif('env-lokal');
    await st.simpan();
    return 'ok';
  })())`);

  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
