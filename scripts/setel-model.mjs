/*
 * Setel model provider custom ke model yang BENAR-BENAR ada di router.
 *
 * Model yang tersimpan adalah "custom-model" - placeholder bawaan - dan router
 * Anda menjawab 404 untuknya. Daftar model router sudah dibaca: mr-vip ada di
 * sana, dan uji langsung dengan key Anda menjawab 200.
 *
 * Setelah ditulis, dibaca ULANG dan dicocokkan dengan daftar model router -
 * supaya tidak "berhasil menulis" tapi tetap salah.
 *
 * MASIH DIPAKAI (bukan skrip sekali pakai): jalankan lagi kalau model provider
 * custom kembali ke "custom-model". Butuh aplikasi hidup di port debug 9223.
 *
 *   node scripts/setel-model.mjs mr-vip
 *
 * Untuk melihat model apa saja yang tersedia di router: scripts/probe-model.mjs
 */
const ELEMEN = process.argv[2] ?? 'mr-vip';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + r.result.exceptionDetails.text;
  return r.result?.result?.value;
};
const jalan = async (nama, expr, ms = 40000) => {
  await send('Runtime.evaluate', {
    expression: `window.__t_${nama} = { selesai: false };
      (async () => { try { window.__t_${nama} = { selesai: true, nilai: await (${expr}) }; }
        catch (e) { window.__t_${nama} = { selesai: true, galat: String(e && e.message || e) }; } })();`,
  });
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    const v = await ev(`JSON.stringify(window.__t_${nama})`);
    if (v && v !== 'undefined') {
      const p = JSON.parse(v);
      if (p?.selesai) return p.galat ? { GALAT: p.galat } : p.nilai;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { TIMEOUT: true };
};

console.log(`=== setel model custom -> ${ELEMEN} ===`);
console.log(
  await jalan('tulis', `(async () => {
  const inv = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  await inv('set_settings', { patch: { models: { providers: { custom: { model: '${ELEMEN}' } } } } });
  return 'ditulis';
})()`),
);

console.log('\n=== baca ulang ===');
const hasil = await jalan('baca', `(async () => {
  const inv = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  const r = await inv('get_settings');
  return JSON.stringify(r.models?.providers?.custom ?? r);
})()`);
console.log(hasil);
const nilai = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
console.log(`model tersimpan: ${nilai?.model} | cocok dengan yang diminta? ${nilai?.model === ELEMEN ? 'YA' : 'TIDAK'}`);

console.log('\n=== sinkronkan store AI supaya UI ikut berubah ===');
console.log(
  await jalan('store', `(async () => {
  const S = window.__ZEPHYR_AI__.store.getState();
  if (S.setProvider) S.setProvider('custom');
  if (S.setModel) S.setModel('${ELEMEN}');
  const s = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ provider: s.provider, model: s.model });
})()`),
);

console.log('\n=== kirim pesan sungguhan ===');
console.log(
  await jalan(
    'chat',
    `(async () => {
  const s = window.__ZEPHYR_AI__.store.getState();
  const n0 = (s.activeSession()?.messages||[]).length;
  const keluar = await window.__ZEPHYR_AI__.store.getState().send('halo');
  const s2 = window.__ZEPHYR_AI__.store.getState();
  const baru = (s2.activeSession()?.messages||[]).slice(n0);
  return JSON.stringify({ keluar, balasan: baru.map(m => ({ peran: m.role, isi: String(m.content||'').slice(0,400) })) });
})()`,
    90000,
  ),
);

ws.close();
