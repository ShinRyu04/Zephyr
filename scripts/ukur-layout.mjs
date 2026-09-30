// Why do the API client / SFTP views stay short? Report the computed box chain
// from .editor-area down to the view root.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

const r = await cdp.runAsync(
  `
  const st = S.getState();
  st.setSettingsOpen(false);
  st.setActivity('api');
  st.setSidebarVisible(true);
  await wait(2000);

  const ea = document.querySelector('.editor-area');
  const host = document.querySelector('.editor-area > .editor-host');
  const api = document.querySelector('[data-testid="api-root"]');
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      cls: el.className,
      display: cs.display,
      flex: cs.flex,
      height: cs.height,
      h: Math.round(b.height),
      offsetParent: el.offsetParent ? el.offsetParent.className : null,
    };
  };
  return JSON.stringify({
    parentDariArea: ea ? ea.parentElement.className : null,
    parentDisplay: ea ? getComputedStyle(ea.parentElement).display : null,
    parentFlexDir: ea ? getComputedStyle(ea.parentElement).flexDirection : null,
    parentH: ea ? Math.round(ea.parentElement.getBoundingClientRect().height) : -1,
    editorArea: box(ea),
    host: box(host),
    api: box(api),
    hostParent: host ? host.parentElement.className : null,
  });
`,
  40000,
);

console.log(r);
process.exit(0);
