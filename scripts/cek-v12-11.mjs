// cek-v12-11.mjs — print every value V12 checks.
//
// V12 asserts a batch of MCP security contracts at once, so a failure only
// says "something is off". This prints each condition separately.

const PORT = Number(process.argv[2] ?? 9222);
const TOKEN = process.env.ZEPHYR_MCP_TOKEN ?? '';

const rpc = async (method, params, id) => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    return { status: r.status, body: await r.json() };
  } catch (e) {
    return { status: 0, body: { error: { message: String(e.message ?? e) } } };
  }
};

const main = async () => {
  const setBoleh = await rpc('set_setting', { key: 'editor.tabSize', value: 8 }, 30);
  const setTolak = await rpc('set_setting', { key: 'mcp.enabled', value: false }, 31);
  const setTolak2 = await rpc('set_setting', { key: 'git.github.clientId', value: 'x' }, 32);
  const getS = await rpc('get_settings', {}, 33);
  const getTok = await rpc('get_setting', { key: 'mcp.token' }, 34);

  console.log('setBoleh  status:', setBoleh.status, JSON.stringify(setBoleh.body?.result ?? setBoleh.body?.error));
  console.log('setTolak  status:', setTolak.status, 'msg:', JSON.stringify(setTolak.body?.error?.message ?? null));
  console.log('setTolak2 status:', setTolak2.status, 'msg:', JSON.stringify(setTolak2.body?.error?.message ?? null));
  console.log('getS mcp.token:', JSON.stringify(getS.body?.result?.mcp?.token ?? null));
  console.log('getS git.github:', JSON.stringify(getS.body?.result?.git?.github ?? null));
  console.log('getTok    status:', getTok.status, 'code:', getTok.body?.error?.code ?? null);
  console.log('');
  console.log('kondisi:');
  console.log('  setBoleh 200                :', setBoleh.status === 200);
  console.log('  setTolak "tidak boleh diubah":', String(setTolak.body?.error?.message ?? '').includes('tidak boleh diubah'));
  console.log('  setTolak2 "tidak boleh diubah":', String(setTolak2.body?.error?.message ?? '').includes('tidak boleh diubah'));
  console.log('  mcp.token === "***"          :', getS.body?.result?.mcp?.token === '***');
  console.log('  git.github undefined         :', getS.body?.result?.git?.github === undefined);
  console.log('  getTok ada code              :', getTok.body?.error?.code !== undefined);
};

main().catch((e) => {
  console.error('cek-v12-11 error:', e.message ?? e);
  process.exitCode = 2;
});
