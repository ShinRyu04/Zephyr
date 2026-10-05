/*
 * Skema argumen tool MCP, dibaca dari server yang sedang hidup.
 *
 * Menebak bentuk argumen sudah dua kali gagal di sesi ini (editor_write dengan
 * 'path' padahal yang diminta 'tabId'; toggleServer() tanpa argumen padahal
 * butuh `on`). Skemanya tersedia - jadi ambil, jangan tebak.
 */
const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;

const r = await fetch(`http://127.0.0.1:${PORT}/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  signal: AbortSignal.timeout(5000),
});
const j = await r.json();

const minat = ['editor_open', 'editor_write', 'editor_insert', 'editor_close', 'run_command', 'list_editors'];
for (const t of j.result?.tools ?? []) {
  if (!minat.includes(t.name)) continue;
  console.log(`\n=== ${t.name} ===`);
  const skema = t.inputSchema ?? {};
  const wajib = skema.required ?? [];
  for (const [nama, def] of Object.entries(skema.properties ?? {})) {
    const tanda = wajib.includes(nama) ? 'WAJIB' : 'opsional';
    const tipe = def.type ?? (def.anyOf ? def.anyOf.map((a) => a.type).join('|') : '?');
    console.log(`  ${nama.padEnd(12)} ${String(tipe).padEnd(10)} ${tanda.padEnd(9)} ${String(def.description ?? '').slice(0, 70)}`);
  }
}
