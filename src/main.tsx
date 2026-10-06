import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AiWindow from './AiWindow';
import { ErrorBoundary } from './components/shell/ErrorBoundary';

/*
 * Two possible roots. The pop-out AI window loads with the hash `#ai`
 * (set when it is created in `aiWindow.ts`); every other window is the full
 * editor. Keeping this split at the entry point means the AI window never
 * mounts the activity bar, editor or terminal — it is just the chat.
 */
const isAiWindow = window.location.hash.replace(/^#/, '').split('?')[0] === 'ai';
const Root = isAiWindow ? AiWindow : App;

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
