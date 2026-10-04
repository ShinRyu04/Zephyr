/*
 * Bukti hidup untuk reasoning: kirim satu pesan nyata ke model yang punya
 * reasoning (effort high), lalu periksa apakah isinya sampai ke pesan di store
 * dan apakah ReasoningBlock benar-benar dirender di DOM.
 *
 * Ini satu-satunya cara membuktikan "isi thinking dibuang setelah dibayar":
 * membaca kode hanya membuktikan bahwa ada accumulator, bukan bahwa isinya
 * sampai ke layar.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
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

const ev = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  const v = r.result?.result?.value;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
};

/* Effort default-nya null (Auto), dan itu berarti parameter reasoning TIDAK
   dikirim sama sekali - jadi model tidak mungkin thinker, danitelusuri dari
   sisi kode tidak akan pernah menemukan apa pun. Setel effort dulu, lalu
   pulihkan, supaya yang diukur adalah jalurnya dan bukan kebetulan setting. */
const effortAsli = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ effort: st.reasoningEffort, model: st.model, provider: st.provider });
})()`);
console.log('sebelum:', JSON.stringify(effortAsli));
await ev(`window.__ZEPHYR_AI__.store.getState().setReasoningEffort('high')`);

/* Buka panel AI secara idempoten: klik buta akan menutup panel yang sudah
   kebetulan terbuka, dan panel tidak dirender sama sekali kalau dock != 'ai'. */
console.log('panel:', await ev(`(() => {
  if (document.querySelector('.ai-send-wrap')) return 'sudah terbuka';
  const b = [...document.querySelectorAll('button')].find((x) => /agent|ai\b|zeta/i.test(x.getAttribute('aria-label') || x.title || ''));
  if (b) { b.click(); return 'diklik: ' + (b.getAttribute('aria-label') || b.title); }
  return 'tidak ada tombol';
})()`));
await new Promise((r) => setTimeout(r, 1500));

const kirim = await ev(`(async () => {
  const st = window.__ZEPHYR_AI__.store.getState();
  if (st.agentPhase !== 'idle') return { ok: false, sebab: 'siburan: ' + st.agentPhase };
  await st.send('Jawab satu kalimat saja: apa itu editor teks?', []);
  return { ok: true };
})()`, true);
console.log('kirim:', JSON.stringify(kirim));
if (!kirim?.ok) { ws.close(); process.exit(1); }

let akhir = null;
for (let i = 0; i < 70; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await ev(`(() => {
    const st = window.__ZEPHYR_AI__.store.getState();
    const s = st.sessions[st.sessions.length - 1];
    const m = [...(s?.messages ?? [])].reverse().find((x) => x.role === 'assistant');
    return JSON.stringify({ phase: st.agentPhase, streaming: m?.streaming ?? null, isi: String(m?.content ?? '').length, reasoning: String(m?.reasoning ?? '').length });
  })()`);
  if (s?.phase === 'idle' && s?.streaming === false && s?.isi > 0 && i > 0) { akhir = s; break; }
  akhir = s;
}
console.log('akhir:', JSON.stringify(akhir));

const v = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  const s = st.sessions[st.sessions.length - 1];
  const msgs = s?.messages ?? [];
  const dengan = msgs.filter((m) => typeof m.reasoning === 'string' && m.reasoning.trim());
  /* ReasoningBlock yang sudah selesai dirender di dalam balasan. Cari berdasarkan
     teks yang benar-benar ada di blok itu, bukan tebakan nama kelas. */
  const nodeReasoning = [...document.querySelectorAll('details, [class*="reason" i], [class*="think" i]')]
    .map((n) => (n.innerText || '').trim())
    .filter((t) => /reason|thinking|thought|berpikir/i.test(t));
  return JSON.stringify({
    jumlahPesan: msgs.length,
    jumlahDenganReasoning: dengan.length,
    contoh: dengan.slice(-1).map((m) => ({ panjang: m.reasoning.length, ms: m.reasoningMs, cuplikan: m.reasoning.replace(/\\s+/g, ' ').slice(0, 200) })),
    reasoningTextGlobal: String(st.reasoningText ?? '').length,
    nodeReasoning: nodeReasoning.slice(0, 2),
  });
})()`);
ws.close();

console.log('\npesan total           :', v.jumlahPesan);
console.log('pesan dengan reasoning:', v.jumlahDenganReasoning);
console.log('reasoningText global  :', v.reasoningTextGlobal, 'karakter');
console.log('blok reasoning di DOM :', v.nodeReasoning.length);
for (const c of v.contoh ?? []) console.log(`\n panjang=${c.panjang} ms=${c.ms}\n ${c.cuplikan}`);
for (const t of v.nodeReasoning ?? []) console.log(`\n DOM: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);

const isiSampai = v.jumlahDenganReasoning > 0;
const tampilDiDom = v.nodeReasoning.length > 0;
let lulus = 0;
const cek = (n, ok) => { console.log(`\n  ${ok ? 'OK  ' : 'GAGAL'}  ${n}`); if (ok) lulus++; };
cek('isi reasoning sampai ke pesan di store', isiSampai);
cek('blok reasoning tampil di DOM', tampilDiDom);
console.log(`\n== ${lulus}/2 lulus ==`);
process.exit(lulus === 2 ? 0 : 1);
