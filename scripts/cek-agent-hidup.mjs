/* Membaca state agent yang SEDANG jalan di jendela hidup: apakah elapsed
 * terhitung, tool think terpakai, dan apakah label "fallback" itu berasal
 * dari kode fallback kita atau dari hal lain. */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const js = String.raw`(() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  const now = Date.now();
  const secs = (t) => (t ? Math.round((now - t) / 1000) : null);
  const el = document.querySelector('.ai-send-wrap');
  return JSON.stringify({
    phase: s.agentPhase,
    step: s.agentStepIndex + '/' + s.agentStepLimit,
    toolSekarang: s.agentCurrentTool,
    elapsedSinceStart: secs(s.agentStartedAt),
    sejakProgress: secs(s.agentLastProgressAt),
    adaCheckpoint: s.agentResume != null,
    // Label "fallback" di header subagent: dari mana?
    labelSubagent: [...document.querySelectorAll('.subagent-row, .sa-row, [class*="subagent"]')]
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70))
      .filter((t) => /fallback|mr-vip/.test(t))
      .slice(0, 4),
    // Teks tool think yang tampil di transkrip = bukti tool dipakai
    adaThink: /Thought briefly|pemikiran tercatat|berpikir/i.test(document.body.innerText),
    // Badge konteks
    badge: [...document.querySelectorAll('[class*="token"], [class*="ctx"]')]
      .map((e) => (e.textContent || '').trim()).filter((t) => /\d+\/\d+/.test(t)).slice(0, 3),
    adaPanel: !!el,
  }, null, 1);
})()`;
const m = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(m.result?.result?.value ?? JSON.stringify(m.result).slice(0, 300));
ws.close();