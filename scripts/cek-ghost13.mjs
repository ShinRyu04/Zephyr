import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  /*
   * Count how many listeners are attached to the ai-chunk event before and
   * after the ghost request. If the ghost module never registered one, the
   * count stays flat and that is the whole bug.
   */
  const EVT = await import('/node_modules/@tauri-apps/api/event.js');
  out.listenAda = typeof EVT.listen;

  window.__UJI_CHUNKS__ = [];
  await EVT.listen('ai-chunk', (ev) => window.__UJI_CHUNKS__.push(ev.payload.id));

  // Cek: apakah modul ghost ini instance yang sama dengan yang dipakai editor?
  const g1 = await import('/src/lib/ghostText.ts');
  const g2 = await import('/src/lib/ghostText.ts');
  out.samaInstance = g1 === g2;

  // Panggil mintaSaran lewat keymap dan lihat apakah listener ghost menembak
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');
  const pos = v.state.doc.line(700).from + 2;
  v.dispatch({ selection: { anchor: pos } });
  await wait(300);

  // Instrument: apakah dispatch setGhost pernah terjadi? patch ghostField tidak bisa,
  // jadi deteksi lewat mutasi DOM.
  const mut = [];
  const obs = new MutationObserver((recs) => {
    for (const r2 of recs) for (const n of r2.addedNodes) {
      if (n.nodeType === 1 && (n.classList?.contains('cm-ghost') || n.querySelector?.('.cm-ghost'))) mut.push('ghost');
    }
  });
  obs.observe(v.dom, { childList: true, subtree: true });

  const bindings = v.state.facet(CV.keymap);
  for (const b of bindings) for (const kb of b) if (String(kb.key).includes('Alt-\\\\')) kb.run?.(v);

  await wait(4000);
  obs.disconnect();
  out.mutasiGhost = mut.length;
  out.chunks = window.__UJI_CHUNKS__.length;
  out.ghost = !!q('.cm-ghost');
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
