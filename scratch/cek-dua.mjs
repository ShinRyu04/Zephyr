import { cdp } from './cdp2.mjs';

/*
 * Read BOTH targets and print which root each one is rendering.
 *
 * The URL alone cannot tell them apart here: the Agents window was opened as
 * `index.html#agents` and the main window is `/`. But the app is a hash router,
 * so `/` with a `#agents` appended later ALSO reports `#agents` — which is exactly
 * what made two earlier probes attach to the wrong one and "prove" the editor was
 * rendering the Agents layout.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();

for (const t of list) {
  const c = await cdp(9223, t.url);
  const v = await c.eval(`JSON.stringify({
    href: location.href,
    root: document.querySelector('#root')?.firstElementChild?.className,
    agMenubar: !!document.querySelector('.ag-menubar'),
    editorArea: !!document.querySelector('.editor-area'),
    activitybar: !!document.querySelector('.activitybar'),
    aiPanel: !!document.querySelector('.ai-panel'),
  })`);
  console.log(t.url + '\n  ' + v);
  c.close();
}
process.exit(0);
