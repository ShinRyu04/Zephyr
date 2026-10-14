/*
 * Bisikan V10: cari TAHAP MANA yang menggantung di blok fallback port.
 *
 * verify11 mati tepat sesudah V9 (tidak sampai mencetak V10) - jadi yang
 * menggantung ada di antara toggle(false) -> hog 9222 -> toggle(true) ->
 * getJson/rpc port alternatif. Tiap tahap di sini diberi batas waktu supaya
 * hasilnya menunjukkan tahap pelakunya, bukan cuma "menggantung".
 */
import net from 'node:net';
import { Cdp } from '../scripts/lib-cdp.mjs';

const ms = () => Date.now();
const t0 = ms();
const jejak = [];
const catat = (label, info) => {
  const baris = `[${String(ms() - t0).padStart(6)}ms] ${label}${info ? ' -> ' + info : ''}`;
  jejak.push(baris);
  console.log(baris);
};

function batas(nama, janji, ms_) {
  return Promise.race([
    janji,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${ms_}ms di ${nama}`)), ms_)),
  ]);
}

function hogPort(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((c) => c.end());
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const { cdp } = await Cdp.attach(9223, 'Zephyr');
catat('attach CDP');

const st0 = JSON.parse(
  await batas(
    'baca status awal',
    cdp.runAsync(`
      await M.refresh();
      const st = MS().status ?? {};
      return JSON.stringify({ running: !!st.running, port: st.port ?? null });
    `),
    15000,
  ),
);
catat('status awal', JSON.stringify(st0));

/* 1. matikan dulu */
try {
  await batas(
    'toggle(false)',
    cdp.runAsync("await M.toggle(false); await tunggu(); await wait(400); return 'ok';"),
    20000,
  );
  catat('toggle(false)', 'ok');
} catch (e) {
  catat('toggle(false)', 'GAGAL ' + e.message);
}

/* 2. blokir port utama */
let hog = null;
const want = Number(st0.port ?? 9222);
try {
  hog = await batas('hogPort', hogPort(want), 5000);
  catat(`hogPort ${want}`, 'port diblokir');
} catch (e) {
  catat(`hogPort ${want}`, 'GAGAL ' + e.message);
}

/* 3. nyalakan lagi -> harus fallback */
try {
  await batas(
    'toggle(true) di tengah fallback',
    cdp.runAsync("await M.toggle(true); await tunggu(); await wait(700); return 'ok';"),
    45000,
  );
  catat('toggle(true)', 'ok (tidak menggantung)');
} catch (e) {
  catat('toggle(true)', 'GAGAL ' + e.message);
}

/* 4. baca hasil di UI + periksa port kandidat */
try {
  const ui = JSON.parse(
    await batas(
      'baca status sesudah fallback',
      cdp.runAsync(`
        await M.refresh();
        const st = MS().status ?? {};
        return JSON.stringify({ running: !!st.running, port: st.port ?? null, requested: st.requestedPort ?? null,
          settingPort: S.getState().settings.mcp.port,
          statusTeks: q('[data-testid="mcp-status"]')?.textContent?.trim() ?? null });
      `),
      15000,
    ),
  );
  catat('UI sesudah fallback', JSON.stringify(ui));
} catch (e) {
  catat('baca status sesudah fallback', 'GAGAL ' + e.message);
}

for (const p of [want, want + 1, want + 2, want + 3, want + 4]) {
  try {
    const r = await batas(`health ${p}`, fetch(`http://127.0.0.1:${p}/health`).then((x) => x.status), 3000);
    catat(`health ${p}`, String(r));
  } catch (e) {
    catat(`health ${p}`, e.message.startsWith('TIMEOUT') ? 'TIMEOUT/tergantung' : 'tidak ada');
  }
}

if (hog) await new Promise((r) => hog.close(r));
catat('hog dilepas', 'ok');
try {
  await batas(
    'tutup CDP',
    cdp.runAsync("await M.toggle(false); await tunggu(); return 'ok';"),
    15000,
  );
  catat('server dimatikan lagi', 'ok');
} catch (e) {
  catat('server dimatikan lagi', 'GAGAL ' + e.message);
}
try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
