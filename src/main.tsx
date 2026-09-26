import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shell/ErrorBoundary';

if (import.meta.env.DEV) {
  void import('./lib/devBridge').then((m) => m.installDevBridge());
}

void import('./lib/i18n').then((m) => m.muatKamusTambahan());

/*
 * Sembunyikan splash boot (lihat index.html) setelah React benar-benar
 * menaruh isi di #root — bukan sekadar setelah render() dipanggil, karena
 * komit React berjalan asinkron. Observer dipasang SEBELUM render supaya
 * tidak melewatkan mutasi pertama.
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
  // Jaring pengaman: kalau React gagal mount, splash tidak menutup selamanya.
  window.setTimeout(splashOff, 20000);
}

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <ErrorBoundary nama="Zephyr">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
