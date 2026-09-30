import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shell/ErrorBoundary';

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
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
