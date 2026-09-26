import { useState } from 'react';
import { usePorts, type ForwardedPort } from '../../lib/portsStore';
import { useTerminal } from '../../lib/terminalStore';
import { notifyError, notifyInfo } from '../../lib/notificationStore';
import { clipboardWrite } from '../../lib/clipboard';
import { useT, tx } from '../../lib/i18n';
import * as cmd from '../../lib/commands';

export default function PortsView() {
  const tr = useT();
  const ports = usePorts((s) => s.ports);
  const add = usePorts((s) => s.add);
  const remove = usePorts((s) => s.remove);
  const update = usePorts((s) => s.update);
  const addPane = useTerminal((s) => s.addPane);

  const [hostPort, setHostPort] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [nilaiEdit, setNilaiEdit] = useState('');

  const tambah = () => {
    const n = Number(hostPort);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      notifyError(tx('Port must be a number from 1 to 65535'), { source: 'ports' });
      return;
    }
    add({
      hostPort: n,
      privatePort: n,
      protocol: 'http',
      process: '-',
      source: 'manual',
      forwarder: 'local',
      status: 'running',
    });
    setHostPort('');
    notifyInfo(`Port ${n} added`, { source: 'ports' });
  };

  const bukaDiBrowser = async (p: ForwardedPort) => {
    const url = `${p.protocol}://localhost:${p.hostPort}`;
    try {
      await addPane('browser', { url });
    } catch (e) {
      notifyError(`Could not open ${url}`, {
        source: 'ports',
        // Error dari invoke Tauri berbentuk { code, message }, bukan Error,
        // jadi cabang String(e) mencetak "[object Object]".
        detail: cmd.asZephyrError(e).message,
      });
    }
  };

  const salin = async (p: ForwardedPort) => {
    const url = `${p.protocol}://localhost:${p.hostPort}`;
    try {
      await clipboardWrite(url);
      notifyInfo(`URL copied: ${url}`, { source: 'ports' });
    } catch {
      notifyError(tx('Failed to copy the URL'), { source: 'ports' });
    }
  };

  return (
    <div className="ports-root" data-testid="ports-view">
      <div className="ports-toolbar">
        <input
          className="ports-input"
          data-testid="ports-add-input"
          placeholder="Local port (e.g. 3000)"
          value={hostPort}
          onChange={(e) => setHostPort(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tambah()}
          aria-label={tr('Port number to forward')}
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
          {tr('No forwarded ports yet. SSH sessions and tasks that open a port will appear here automatically.')}
        </p>
      ) : (
        <div className="ports-table-wrap">
          <table className="ports-table" data-testid="ports-table">
            <thead>
              <tr>
                <th>Forwarded</th>
                <th>Local</th>
                <th>Protocol</th>
                <th>Process</th>
                <th>Source</th>
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
                              notifyError(tr('Port must be a number from 1 to 65535'), { source: 'ports' });
                            }
                          } else if (e.key === 'Escape') setEdit(null);
                        }}
                        onBlur={() => setEdit(null)}
                      />
                    ) : (
                      <button
                        className="ports-link"
                        data-testid="ports-edit"
                        title={tr('Change the local port')}
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
                      title={tr('Open in a browser pane')}
                      onClick={() => void bukaDiBrowser(p)}
                    >
                      Open
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-copy"
                      title={tr('Copy URL')}
                      onClick={() => void salin(p)}
                    >
                      Copy
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-toggle"
                      title={p.status === 'running' ? tr('Stop forward') : tr('Start forward')}
                      onClick={() =>
                        update(p.id, { status: p.status === 'running' ? 'stopped' : 'running' })
                      }
                    >
                      {p.status === 'running' ? 'Stop' : 'Start'}
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="ports-remove"
                      title={tr('Remove from list')}
                      onClick={() => remove(p.id)}
                    >
                      Delete
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
