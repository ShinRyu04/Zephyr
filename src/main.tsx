import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Jembatan verifikasi otomatis (dev saja; hilang di build release).
if (import.meta.env.DEV) {
  void import('./lib/devBridge').then((m) => m.installDevBridge());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
