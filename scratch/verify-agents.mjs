/*
 * Verify the "Open in Agents" window end to end, against the LIVE app.
 *
 * The point is not that a window object exists — it is that the three columns
 * have real content. The risk flagged in the plan was that the pop-out is a
 * separate WebView with its own stores, so if `useGit`/workspace were not
 * bootstrapped there, Changes and Files would render EMPTY while everything
 * else looked fine. So this asserts on content, not on the window alone.
 */
import CDP from 'chrome-remote-interface';

const PORT = Number(process.argv[2] || 9223);
const hasil = [];
const check = (nama, lulus, detail = '') => {
  hasil.push({ nama, lulus, detail });
  console.log(`${lulus ? 'PASS' : 'FAIL'}  ${nama}${detail ? ` — ${detail}` : ''}`);
};

/* Runtime.evaluate with awaitPromise is flaky in WebView2 ("Promise was
   collected"), so promises are parked on window and polled — the same helper
   the existing harnesses use. */
async function runAsync(Runtime, expr, timeoutMs = 8000) {
  const key = `__v_${Math.random().toString(36).slice(2)}`;
  /*
   * Results are written to a PLAIN string variable by a `.then`, never read
   * back off the promise.
   *
   * WebView2's Runtime.evaluate renders any promise as `{}` — even after it has
   * settled, and even with `returnByValue`. Awaiting it in a second call does
   * not help (`(async () => await window.p)()` also comes back `{}`). The value
   * has to be flattened into a string the moment it exists, and then polled as
   * a plain value, which is what this does.
   */
  const set = await Runtime.evaluate({
    expression:
      `window.${key} = undefined;(async () => {\n${expr}\n})().then(` +
      `function(v){ window.${key} = JSON.stringify({__ok: v}); },` +
      `function(e){ window.${key} = JSON.stringify({__err: String((e && e.stack) || e)}); });`,
    returnByValue: true,
  });
  if (set.exceptionDetails) {
    return { __err: set.exceptionDetails.exception?.description ?? 'eval error' };
  }
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await Runtime.evaluate({ expression: `window.${key}`, returnByValue: true });
    const v = r.result?.value;
    if (typeof v === 'string') {
      await Runtime.evaluate({ expression: `delete window.${key}` });
      try {
        const parsed = JSON.parse(v);
        return parsed.__err !== undefined ? { __err: parsed.__err } : parsed.__ok;
      } catch {
        return { __err: `unparseable: ${String(v).slice(0, 200)}` };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { __err: 'timeout' };
}

const targets = await CDP.List({ port: PORT });
const utama = targets.find((t) => t.type === 'page' && !t.url.includes('#agents') && !t.url.includes('#ai'));
if (!utama) {
  console.error('Tidak menemukan window utama.');
  process.exit(1);
}

const c = await CDP({ port: PORT, target: utama });
const { Runtime } = c;
await Runtime.enable();

/* Open the Agents window through the same command the button and the chord
   use, so this exercises the real path rather than a synthetic one. */
const buka = await runAsync(Runtime, `
  const m = await import('/src/lib/agentsWindow.ts');
  await m.bukaAgentsWindow();
  return 'ok';
`);
check('window Agents bisa dibuka lewat bukaAgentsWindow()', buka === 'ok', JSON.stringify(buka));

/* Let it mount, then find it as its own CDP target. */
let targetAgents = null;
for (let i = 0; i < 40 && !targetAgents; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const list = await CDP.List({ port: PORT });
  targetAgents = list.find((t) => t.type === 'page' && t.url.includes('#agents'));
}
check('#agents muncul sebagai target WebView terpisah', !!targetAgents, targetAgents?.url ?? 'tidak ada');

if (targetAgents) {
  const ca = await CDP({ port: PORT, target: targetAgents });
  const Ra = ca.Runtime;
  await Ra.enable();

  /* Give the bootstrap (settings -> workspace -> git) time to finish. */
  await new Promise((r) => setTimeout(r, 3000));

  const dom = await runAsync(Ra, `
    const ada = (sel) => !!document.querySelector(sel);
    return {
      layout: ada('[data-testid="agents-layout"]'),
      titlebar: ada('[data-testid="agents-titlebar"]'),
      left: ada('[data-testid="agents-left"]'),
      right: ada('[data-testid="agents-right"]'),
      sessions: ada('[data-testid="ag-sessions"]'),
      customizations: ada('[data-testid="ag-customizations"]'),
      chat: ada('.ai-panel') || ada('.ai-host-tabs'),
      tabChanges: ada('[data-testid="ag-tab-changes"]'),
      tabFiles: ada('[data-testid="ag-tab-files"]'),
      jumlahSesi: document.querySelectorAll('[data-testid^="ag-sesi-"]').length,
      judul: document.title,
      hash: location.hash,
    };
  `);
  check('root window Agents ter-mount', dom?.layout === true, JSON.stringify(dom));
  check('titlebar ada', dom?.titlebar === true);
  check('kolom kiri (Sessions) ada', dom?.left === true && dom?.sessions === true);
  check('blok Customizations ada', dom?.customizations === true);
  check('kolom kanan (Changes/Files) ada', dom?.right === true && dom?.tabChanges === true && dom?.tabFiles === true);
  check('kolom tengah memuat chat Zephyr asli', dom?.chat === true);
  check('routing hash benar (#agents, bukan #ai)', dom?.hash === '#agents', dom?.hash);

  /*
   * The content checks — the ones that actually prove the bootstrap worked.
   * An empty Files/Changes column would still pass every check above.
   *
   * These read the DOM, not the stores. `import('/src/lib/store.ts')` from this
   * evaluator resolves to a DIFFERENT module instance than the one React mounted
   * (verified: `a.useStore === b.useStore` is false across the two specifiers),
   * so a store read here reports an empty store even when the window is fully
   * loaded — it produced false failures until this was switched to the DOM.
   */
  const isi = await runAsync(Ra, `
    const teks = (sel) => (document.querySelector(sel)?.innerText || '').trim();
    const kanan = teks('[data-testid="agents-right"]');
    const kiri = teks('[data-testid="agents-left"]');
    return {
      kananPanjang: kanan.length,
      kananCuplik: kanan.slice(0, 120),
      kiriPanjang: kiri.length,
      adaTabChanges: !!document.querySelector('[data-testid="ag-tab-changes"]'),
      badge: document.querySelector('.ag-tab-badge')?.textContent ?? null,
      adaTree: !!document.querySelector('.explorer, .tree, [data-testid*="tree"]'),
    };
  `);
  check(
    'kolom kanan punya isi nyata (tree Files / daftar Changes)',
    (isi?.kananPanjang ?? 0) > 20,
    `panjang=${isi?.kananPanjang} cuplik="${(isi?.kananCuplik ?? '').replace(/\n/g, ' | ')}"`,
  );
  check(
    'kolom kiri punya isi nyata (sesi + customizations)',
    (isi?.kiriPanjang ?? 0) > 40,
    `panjang=${isi?.kiriPanjang}`,
  );

  /* The Changes tab must be able to show a working tree: switching to it has to
     render the SCM panel rather than an empty box. */
  const scm = await runAsync(Ra, `
    const tab = document.querySelector('[data-testid="ag-tab-changes"]');
    tab.click();
    await new Promise((r) => setTimeout(r, 900));
    const isi = document.querySelector('[data-testid="agents-right"]')?.innerText || '';
    return { panjang: isi.trim().length, cuplik: isi.trim().slice(0, 140) };
  `);
  check(
    'tab Changes merender panel SCM',
    (scm?.panjang ?? 0) > 20,
    `panjang=${scm?.panjang} cuplik="${(scm?.cuplik ?? '').replace(/\n/g, ' | ')}"`,
  );

  await ca.close();
}

await c.close();

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
process.exit(lulus === hasil.length ? 0 : 1);
