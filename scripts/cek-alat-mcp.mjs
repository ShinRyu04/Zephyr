/*
 * Apa saja yang bisa dilakukan MCP Zephyr - dibaca dari servernya sendiri.
 *
 * Dibaca dari /tools (bukan dari kode), karena yang dipakai nanti adalah server
 * yang SEDANG hidup: kalau himpunan toolnya berbeda dari yang saya kira, saya
 * ingin tahu sebelum menulis apa pun.
 */
const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;

const rpc = async (method, params) => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await r.text();
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: e.message };
  }
};

const tools = await rpc('tools/list', {});
console.log('status:', tools.status);
try {
  const j = JSON.parse(tools.body);
  const list = j.result?.tools ?? [];
  console.log(`\n${list.length} tool:\n`);
  for (const t of list) {
    console.log(`  ${t.name}`);
    if (t.description) console.log(`      ${String(t.description).split('\n')[0].slice(0, 110)}`);
  }
} catch {
  console.log('body:', tools.body.slice(0, 900));
}
