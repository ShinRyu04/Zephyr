import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shell/ErrorBoundary';

if (import.meta.env.DEV) {
  void import('./lib/devBridge').then((m) => m.installDevBridge());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary nama="Zephyr">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
