import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AiWindow from './AiWindow';
import AgentsWindow from './AgentsWindow';
import { ErrorBoundary } from './components/shell/ErrorBoundary';

/*
 * Three possible roots, chosen by the URL hash.
 *
 *   #ai      -> the floating chat window (aiWindow.ts)
 *   #agents  -> the 3-column Agents workspace (agentsWindow.ts)
 *   (none)   -> the full editor
 *
 * The hash is compared EXACTLY, never with startsWith: `#ai` is a prefix of
 * `#agents`, so a prefix test would send the Agents window to the chat root and
 * the layout would silently be the wrong one.
 */
const hash = window.location.hash.replace(/^#/, '').split('?')[0];
const Root = hash === 'ai' ? AiWindow : hash === 'agents' ? AgentsWindow : App;

if (import.meta.env.DEV) {
  void import('./lib/devBridge').then((m) => m.installDevBridge());
}

void import('./lib/i18n').then((m) => m.muatKamusTambahan());

/*
 * Hide the boot splash (see index.html) once React has actually put content
 * into #root - not merely after render() is called, because React's commit
 * runs asynchronously. The observer is installed BEFORE render so the first
 * mutation is not missed.
 */
const splashOff = () => {
  document.documentElement.setAttribute('data-zephyr-ready', '1');
};
const rootEl = document.getElementById('root');
if (rootEl) {
  const obs = new MutationObserver(() => {
    if (rootEl.childElementCount > 0) {
      splashOff();
      obs.disconnect();
    }
  });
  obs.observe(rootEl, { childList: true });
  // Safety net: if React fails to mount, the splash does not stay up forever.
  window.setTimeout(splashOff, 20000);
}

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <ErrorBoundary nama="Zephyr">
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
