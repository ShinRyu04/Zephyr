/* Buktikan nama subagent baru tampil di app hidup (store + panel). */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));

// Baca array NAMA dari sumber yang dipakai app (fetch, bukan import ganda)
const r = await fetch('http://localhost:5173/src/lib/subagentStore.ts');
const src = await r.text();
const baris = src.split('\n').find((l) => l.includes('Nakroth'));
console.log('sumber vite:', baris ? baris.trim().slice(0, 80) : 'TIDAK ADA Nakroth');

// Cek tidak ada sisa nama lama di sumber
const lama = ['Comet', 'Odyssey', 'Nova', 'Atlas', 'Orion', 'Vega', 'Lyra', 'Pulsar', 'Zenith', 'Quasar', 'Helix', 'Cobalt'];
const sisa = lama.filter((n) => new RegExp(`'${n}'`).test(src));
console.log('sisa nama lama:', sisa.length ? sisa.join(',') : 'bersih');
ws.close();