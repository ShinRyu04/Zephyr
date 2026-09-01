// StatusBar.tsx — baris bawah: versi, RAM, workspace, bahasa, encoding,
// line ending, Ln/Col, pesan status. Tinggi 24px (token --statusbar-h).

import { useEffect, useState } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { getAppInfo } from '../../lib/commands';
import { onRamUsage } from '../../lib/events';
import { LANG_LABEL } from '../../lib/lang';

const ENC_LABEL: Record<string, string> = {
  utf8: 'UTF-8',
  'utf8-bom': 'UTF-8 with BOM',
  ansi: 'Windows-1252',
};

export default function StatusBar() {
  const [version, setVersion] = useState('0.5.0');
  const ramBytes = useStore((s) => s.ramBytes);
  const setRamBytes = useStore((s) => s.setRamBytes);
  const cursor = useStore((s) => s.cursor);
  const statusMessage = useStore((s) => s.statusMessage);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const tab = useActiveTab();

  useEffect(() => {
    getAppInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {
        /* tetap pakai default */
      });

    let stop: (() => void) | undefined;
    onRamUsage(setRamBytes)
      .then((un) => {
        stop = un;
      })
      .catch(() => {
        /* event RAM tidak tersedia (mis. mode browser) */
      });
    return () => stop?.();
  }, [setRamBytes]);

  const ramText = ramBytes > 0 ? `${Math.round(ramBytes / 1024 / 1024)} MB` : '--';

  return (
    <footer className="statusbar">
      <span className="sb-item sb-brand">Zephyr v{version}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item" title="Memori proses Zephyr">
        RAM: {ramText}
      </span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? ENC_LABEL[tab.encoding] ?? tab.encoding : 'UTF-8'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? (tab.lineEnding === 'crlf' ? 'CRLF' : 'LF') : 'CRLF'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">{tab ? LANG_LABEL[tab.lang] : 'Plain Text'}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">
        Ln {cursor.line}, Col {cursor.col}
      </span>

      <span className="sb-spacer" />

      {statusMessage && <span className="sb-item sb-message">{statusMessage}</span>}
      <button
        className="sb-btn"
        title="Format document — Prettier di fase berikutnya"
        disabled
        aria-disabled="true"
      >
        Format
      </button>
      <button className="sb-btn" title="Cari (Ctrl+F)" onClick={() => setFindOpen(true)}>
        Cari
      </button>
    </footer>
  );
}
