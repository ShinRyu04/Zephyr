// PortsView.tsx — tabel port forward (fase 20).
//
// Sumber otomatis (SSH, task fase 23) memanggil `usePorts.add()`.
// Di fase ini hanya "Add Port" manual yang bisa membuat entri, dan itu memang
// scope-nya — tabel + aksinya yang harus benar sekarang.

import { useState } from 'react';
import { usePorts, type ForwardedPort } from '../../lib/portsStore';
import { useTerminal } from '../../lib/terminalStore';
import { notifyError, notifyInfo } from '../../lib/notificationStore';
import { clipboardWrite } from '../../lib/clipboard';

export default function PortsView() {
  const ports = usePorts((s) => s.ports);
  const add = usePorts((s) => s.add);
  const remove = usePorts((s) => s.remove);
  const update = usePorts((s) => s.update);
  const addPane = useTerminal((s) => s.addPane);

  const [hostPort, setHostPort] = useState('');
  /** id baris yang port lokalnya sedang diedit */
  const [edit, setEdit] = useState<string | null>(null);
  const [nilaiEdit, setNilaiEdit] = useState('');

  const tambah = () => {
    const n = Number(hostPort);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      notifyError('Port harus angka 1–65535', { source: 'ports' });
      return;
    }
    add({
      hostPort: n,
      privatePort: n,
      protocol: 'http',
      process: '—',
      source: 'manual',
      forwarder: 'lokal',
      status: 'running',
    });
    setHostPort('');
    notifyInfo(`Port ${n} ditambahkan`, { source: 'ports' });
  };

  const bukaDiBrowser = async (p: ForwardedPort) => {
    // Pakai browser pane fase 12 — bukan browser sistem. Itu gunanya pane
    // browser ada: preview tanpa keluar dari editor.
    const url = `${p.protocol}://localhost:${p.hostPort}`;
    try {
      await addPane('browser', { url });
    } catch (e) {
      notifyError(`Tidak bisa membuka ${url}`, {
        source: 'ports',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const salin = async (p: ForwardedPort) => {
    const url = `${p.protocol}://localhost:${p.hostPort}`;
    try {
      await clipboardWrite(url);
      notifyInfo(`URL disalin: ${url}`, { source: 'ports' });
    } catch {
      notifyError('Gagal menyalin URL', { source: 'ports' });
    }
  };

  return (
    <div className="ports-root" data-testid="ports-view">
      <div className="ports-toolbar">
        <input
          className="ports-input"
          data-testid="ports-add-input"
          placeholder="Port lokal (mis. 3000)"
          value={hostPort}
          onChange={(e) => setHostPort(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tambah()}
          aria-label="Nomor port untuk diteruskan"
        />
        <button className="btn btn-sm" data-testid="ports-add" onClick={tambah}>
          Add Port
        </button>
        <span className="ports-spacer" />
        <span className="ports-count" data-testid="ports-count">
          {ports.length}
        </span>
      </div>

      {ports.length === 0 ? (
        <p className="ports-empty" data-testid="ports-empty">
          Belum ada port yang diteruskan. Sesi SSH dan task yang membuka
          port (fase 23) akan otomatis muncul di sini.
        </p>
      ) : (
        <div className="ports-table-wrap">
          <table className="ports-table" data-testid="ports-table">
            <thead>
              <tr>
                <th>Forwarded</th>
                <th>Local</th>
                <th>Protokol</th>
                <th>Proses</th>
                <th>Sumber</th>
                <th>Forwarder</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => (
                <tr key={p.id} data-port-row={p.id} data-testid="ports-row">
                  <td className="ports-mono">
                    {p.protocol}://localhost:{p.hostPort}
                  </td>
                  <td className="ports-mono">
                    {edit === p.id ? (
                      <input
                        className="ports-edit"
                        data-testid="ports-edit-input"
                        value={nilaiEdit}
                        autoFocus
                        onChange={(e) => setNilaiEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const n = Number(nilaiEdit);
                            if (Number.isInteger(n) && n >= 1 && n <= 65535) {
                              update(p.id, { hostPort: n });
                              setEdit(null);
                            } else {
                              notifyError('Port harus angka 1–65535', { source: 'ports' });
                            }
                          } else if (e.key === 'Escape') setEdit(null);
                        }}
                        onBlur={() => setEdit(null)}
                      />
                    ) : (
                      <button
                        className="ports-link"
                        data-testid="ports-edit"
                        title="Ubah port lokal"
                        onClick={() => {
                          setEdit(p.id);
                          setNilaiEdit(String(p.hostPort));
                        }}
                      >
                        {p.privatePort}
                      </button>
                    )}
                  </td>
                  <td>{p.protocol}</td>
                  <td className="ports-proc">{p.process}</td>
                  <td>{p.source}</td>
                  <td>{p.forwarder}</td>
                  <td className="ports-status" data-status={p.status}>
                    {p.status}
                  </td>
                  <td className="ports-ops">
                    <button
                      className="btn btn-sm"
                      data-testid="ports-open"
                      title="Buka di browser pane"
                      onClick={() => void bukaDiBrowser(p)}
                    >
                      Buka
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-copy"
                      title="Salin URL"
                      onClick={() => void salin(p)}
                    >
                      Salin
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-toggle"
                      title={p.status === 'running' ? 'Hentikan forward' : 'Mulai forward'}
                      onClick={() =>
                        update(p.id, { status: p.status === 'running' ? 'stopped' : 'running' })
                      }
                    >
                      {p.status === 'running' ? 'Stop' : 'Start'}
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-remove"
                      title="Hapus dari daftar"
                      onClick={() => remove(p.id)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
