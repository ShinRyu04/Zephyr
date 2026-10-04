/* Membaca BUKTI dari run yang baru saja gagal di jendela hidup:
 * - apakah watchdog yang menyalakan, atau hard limit, atau user
 * - berapa lama gap antar chunk provider
 * - apakah ada step yang PARALEL (tool + provider) sehingga watchdog menganggur
 */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));

const js = String.raw`(() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  const st = s.agentSteps || [];
  // Jarak antar langkah dari jam yang tercatat
  const t = st.map((x) => x.at).filter(Boolean);
  const gaps = [];
  for (let i = 1; i < t.length; i++) gaps.push(Math.round((t[i] - t[i - 1]) / 1000));
  const teks = document.body.innerText;
  return JSON.stringify({
    phase: s.agentPhase,
    steps: st.length,
    // Gaps > 210 detik = melewati AGENT_IDLE_MS
    gapTerpanjangDetik: gaps.length ? Math.max(...gaps) : null,
    gapTerlamaLima: gaps.slice().sort((a, b) => b - a).slice(0, 5),
    // Hitung juga jarak antar chunk provider dari langkah terakhir
    jenisLangkah: [...new Set(st.map((x) => x.kind))],
    // Apakah tampil tombol lanjut (bukti checkpoint tersimpan)
    adaTombolLanjut: /lanjut|resume|continue/i.test(teks) && !!s.agentResume,
    adaCheckpoint: s.agentResume != null,
    agentResumeLangkah: s.agentResume ? s.agentResume.langkah : null,
    // Status tiap todo (gagal = in_progress nyangkut?)
    todoStatus: (s.agentTodos || []).map((x) => x.status),
    // Ada subagent yang masih jalan padahal run mati?
    subAktif: Object.values(s.subagents || {}).filter((x) => x.status === 'jalan' || x.status === 'menunggu').length,
  }, null, 1);
})()`;
const m = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(m.result?.result?.value ?? JSON.stringify(m.result).slice(0, 400));
ws.close();