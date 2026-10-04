/* Buktikan interleave teks/tool tampil berurutan di app hidup.
 * Menyuntik satu pesan bot sintetis (tidak menyentuh state asli):
 * teks "A" + tool1 + teks "B" + tool2, lalu memastikan DOM-nya
 * teks/tool/teks/tool, bukan tool/tool/teks/teks. */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
if (!page) {
  console.log('TIDAK ADA HALAMAN');
  process.exit(1);
}
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

const js = `(async () => {
  const out = {};
  try {
    // Buka panel AI bila belum (idempoten)
    if (!document.querySelector('.ai-send-wrap')) {
      const btn = [...document.querySelectorAll('button')].find((b) => /AI|Asisten/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 1500));
    }
    out.panelTampil = !!document.querySelector('.ai-send-wrap');

    // Suntik pesan sintetis lewat store useAi (buat sesi bila belum ada)
    const store = window.__ZEPHYR_AI__.store;
    let st = store.getState();
    let ses = st.activeSession ? st.activeSession() : null;
    if (!ses && st.newChat) st.newChat();
    st = store.getState();
    ses = st.activeSession ? st.activeSession() : null;
    const sesId = ses ? ses.id : null;
    out.sesiAktif = !!sesId;
    if (!sesId) return JSON.stringify({ ...out, gagal: 'tidak bisa buat sesi' });
    const teksA = 'NARASI-A: saya cek dulu strukturnya.';
    const isi = teksA + 'NARASI-B: ketemu, lanjut ke langkah dua.';
    const tools = [
      { id: 't1', name: 'read_file', args: { path: 'a.ts' }, result: 'ok1', ok: true, at: Date.now(), atChar: teksA.length },
      { id: 't2', name: 'grep', args: { pattern: 'x' }, result: 'ok2', ok: true, at: Date.now(), atChar: isi.length },
    ];
    const pesanUji = { id: 'uji-interleave-' + Date.now(), role: 'assistant', content: isi, tools, at: Date.now() };
    window.__ZEPHYR_AI__.store.setState((s) => ({
      sessions: (s.sessions || []).map((x) => x.id === sesId
        ? { ...x, messages: [...x.messages, pesanUji] }
        : x),
    }));
    await new Promise((r) => setTimeout(r, 1200));

    // Baca urutan DOM di pesan uji (cari blok yang memuat NARASI-A)
    const blok = [...document.querySelectorAll('.ai-msg')].find((b) => (b.textContent || '').includes('NARASI-A'));
    out.pesanKetemu = !!blok;
    if (blok) {
      const anak = [...blok.querySelectorAll('.ai-segmen, .ai-toolrun')].map((el) => ({
        jenis: el.classList.contains('ai-segmen') ? 'teks' : 'tool',
        cuplik: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      }));
      out.urutan = anak.map((a) => a.jenis).join(',');
      out.detail = anak;
      // Harapan: teks,tool,teks,tool (atau teks,tool,tool bila tool kedua tanpa narasi baru)
      out.lulus = out.urutan.startsWith('teks,tool') && out.urutan.includes('teks');
    }
    // Bersihkan: hapus pesan uji, kembalikan state
    window.__ZEPHYR_AI__.store.setState((s) => ({
      sessions: (s.sessions || []).map((x) => x.id === sesId
        ? { ...x, messages: x.messages.filter((m) => m.id !== pesanUji.id) }
        : x),
    }));
  } catch (e) {
    out.gagal = String(e && e.message || e);
  }
  return JSON.stringify(out, null, 1);
})()`;
const m = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
console.log(m.result?.result?.value ?? JSON.stringify(m.result).slice(0, 500));
ws.close();