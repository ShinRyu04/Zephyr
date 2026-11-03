// uji-upstream-error.mjs — bukti hidup dua kebocoran error provider:
//
//   U1 FRAME   : HTTP 200 + frame SSE {"error":{...}} -> terminal_error di ai.rs,
//                pesan "upstream error frame: ..." terbaca di jalur agen.
//   U2 CONTENT : HTTP 200 + error ditulis sebagai KONTEN chat
//                ("[upstream: {'type': 'error'...") -> isUpstreamErrorAsContent()
//                mengubahnya jadi res.error sehingga run TIDAK dianggap sukses.
//   U3 RETRY   : pesan "too_many_requests" klasifikasi retryable.
//
// Jalur yang diuji = jalur agen ASLI (send -> Rust -> SSE -> loop agent).
// Yang ditukar hanya baseUrl provider custom-freellmapi -> mock 8098.
// settings.json + secrets.json dicadangkan dan dikembalikan apa adanya.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Cdp, pilihJendelaUtama, sleep } from './lib-cdp.mjs';

const MOCK = 8098;
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const SETTINGS = path.join(APPDATA, 'zephyr', 'settings.json');
const SECRETS = path.join(APPDATA, 'zephyr', 'secrets.json');

const cadangan = (nama, asal) => {
  const tujuan = path.join(os.tmpdir(), `${nama}-${process.pid}`);
  try {
    if (fs.existsSync(asal)) {
      fs.copyFileSync(asal, tujuan);
      return tujuan;
    }
  } catch { /* lanjut tanpa cadangan */ }
  return null;
};
const pulihkan = (asal, cad) => {
  try {
    if (cad && fs.existsSync(cad)) {
      fs.copyFileSync(cad, asal);
      fs.rmSync(cad, { force: true });
    }
  } catch { /* biarkan — cadangan tetap ada */ }
};
const cadSettings = cadangan('settings-uji-upstream', SETTINGS);
const cadSecrets = cadangan('secrets-uji-upstream', SECRETS);

let mockProses = null;
async function pastikanMock() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
    if (Number(v.version) >= 8) return; // mock sudah punya pemicu UPSTREAM_ERR
    throw new Error('mock lama di 8098 — matikan dulu mock-ai versi lama');
  } catch (e) {
    const t = String((e && e.message) || e);
    if (!/fetch failed|ECONNREFUSED/i.test(t)) throw e;
  }
  mockProses = spawn(process.execPath, ['scripts/mock-ai.mjs'], { cwd: process.cwd(), stdio: 'ignore' });
  const tenggat = Date.now() + 8000;
  while (Date.now() < tenggat) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
      if (Number(v.version) >= 8) return;
    } catch { /* coba lagi */ }
    await sleep(200);
  }
  throw new Error('mock tidak menyala di 8098 / versinya lama');
}

const R = { lulus: 0, cek: [] };
const cek = (id, ok, bukti) => {
  R.cek.push({ id, ok, bukti });
  if (ok) R.lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  [${bukti}]`);
};

let exitCode = 2;
let cdp = null;
try {
  await pastikanMock();
  const page = pilihJendelaUtama(await (await fetch('http://127.0.0.1:9223/json/list')).json());
  cdp = await Cdp.connect(page.webSocketDebuggerUrl);

  await cdp.runAsync(`
    await S.getState().applySettings({
      models: {
        activeProvider: 'custom-freellmapi',
        providers: { 'custom-freellmapi': { baseUrl: 'http://127.0.0.1:8098/v1', model: 'mock-model' } },
      },
    });
    await window.__ZEPHYR_SET__.setKey('custom-freellmapi', 'kunci-uji-bukan-rahasia');
    await X.store.getState().setModel('mock-model', 'custom-freellmapi');
    X.store.getState().newChat('');
    return { provider: X.store.getState().provider, model: X.store.getState().model };
  `).then((s) => console.log('setup:', JSON.stringify(s)));

  const bacaTeksAkhir = () => cdp.runAsync(`
    const st0 = X.store.getState();
    const sess = st0.sessions.find((x) => x.id === (st0.activeIds[''] ?? st0.activeId));
    const as = (sess && sess.messages ? sess.messages : []).filter((m) => m.role === 'assistant');
    return String((as[as.length - 1] && as[as.length - 1].content) || '');
  `);

  const kirimDanTunggu = async (teks, batasDetik) => {
    await cdp.runAsync(`
      X.store.getState().newChat('');
      window.__UJI_SEND = { done: false, value: null };
      const p = X.store.getState().send(${JSON.stringify(teks)});
      Promise.resolve(p).then((v) => { window.__UJI_SEND = { done: true, value: v === true }; });
      return 'dikirim';
    `);
    const tenggat = Date.now() + batasDetik * 1000;
    let langkah = [];
    while (Date.now() < tenggat) {
      const s = await cdp.runAsync(`
        const st1 = X.store.getState();
        return { busy: st1.agentBusy, langkah: st1.agentSteps || [] };
      `);
      langkah = s.langkah;
      if (!s.busy) break;
      await sleep(500);
    }
    return langkah;
  };

  /* ── U1: frame error ─────────────────────────────────────────────── */
  const langkah1 = await kirimDanTunggu('UPSTREAM_ERR_FRAME satu dua tiga', 90);
  const teks1 = await bacaTeksAkhir();
  const gagal1 = langkah1
    .filter((x) => x.kind === 'tool' && x.ok === false)
    .map((x) => String(x.result || ''))
    .join(' | ');
  cek(
    'U1 frame error dikenali (bukan sukses kosong)',
    /upstream error frame|too_many_requests/i.test(gagal1 + ' ' + teks1),
    `teks=${teks1.slice(0, 90).replace(/\n/g, ' ')}`,
  );

  /* ── U2: error sebagai konten ────────────────────────────────────── */
  const langkah2 = await kirimDanTunggu('UPSTREAM_ERR_CONTENT satu dua tiga', 90);
  const teks2 = await bacaTeksAkhir();
  cek(
    'U2 error-as-content dikenali',
    /upstream|too_many_requests|provider error|gagal/i.test(teks2),
    `langkah=${langkah2.length} teks=${teks2.slice(0, 90).replace(/\n/g, ' ')}`,
  );

  /* ── U3: klasifikasi retryable ───────────────────────────────────── */
  const u3 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    return {
      frame: m.isRetryableAgentProviderError('upstream error frame: Requests have exceeded (too_many_requests)'),
      konten: m.isRetryableAgentProviderError('provider error as content: [upstream: {type: too_many_requests}]'),
      status: m.isRetryableAgentProviderError('Rate limited (429) - wait a moment'),
    };
  `);
  cek(
    'U3 too_many_requests klasifikasi retryable',
    u3.frame === true && u3.konten === true && u3.status === true,
    JSON.stringify(u3),
  );

  exitCode = R.lulus === 3 ? 0 : 2;
} catch (e) {
  console.error('harness gagal:', e && e.message);
} finally {
  pulihkan(SETTINGS, cadSettings);
  pulihkan(SECRETS, cadSecrets);
  if (mockProses) {
    try { mockProses.kill(); } catch { /* biarkan */ }
  }
  console.log(`\n== ${R.lulus}/${R.cek.length} lulus ==`);
}
process.exit(exitCode);
