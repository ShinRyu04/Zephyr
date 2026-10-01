import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import {
  sftpAvailable,
  sftpList,
  sftpDownload,
  sftpUpload,
  sftpTunnelStart,
  sftpTunnelStop,
  sftpTunnelList,
  type SftpEntry,
} from '../../lib/commands';

interface TunnelAktif {
  id: string;
  localPort: number;
  target: string;
  host: string;
}

/**
 * SFTP browser and port forwarding.
 *
 * Both go through the OpenSSH client Windows already ships, so a host in
 * `known_hosts` behaves the same here as in the terminal, and no SSH library is
 * linked in. A password cannot be supplied to `ssh` non-interactively, so this
 * uses a key or ssh-agent; the panel says so instead of failing vaguely.
 */
export default function SftpView() {
  const tr = useT();

  const [ada, setAda] = useState<boolean | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [path, setPath] = useState('.');
  const [entri, setEntri] = useState<SftpEntry[]>([]);
  const [pesan, setPesan] = useState('');
  const [jalan, setJalan] = useState(false);

  const [tunnel, setTunnel] = useState<TunnelAktif[]>([]);
  const [tLocal, setTLocal] = useState('8081');
  const [tTarget, setTTarget] = useState('127.0.0.1');
  const [tPort, setTPort] = useState('3306');

  const [lokal, setLokal] = useState('');
  const [remote, setRemote] = useState('');

  useEffect(() => {
    void sftpAvailable()
      .then(setAda)
      .catch(() => setAda(false));
    void sftpTunnelList()
      .then((ids) => setTunnel((t) => t.filter((x) => ids.includes(x.id))))
      .catch(() => undefined);
  }, []);

  const portNum = useMemo(() => {
    const n = Number(port);
    return Number.isFinite(n) && n > 0 && n < 65536 ? n : 22;
  }, [port]);

  const buka = useCallback(async () => {
    if (!host.trim()) {
      setPesan(tr('A host is required.'));
      return;
    }
    setJalan(true);
    setPesan('');
    try {
      setEntri((await sftpList(host.trim(), portNum, user.trim(), path.trim() || '.')) ?? []);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
      setEntri([]);
    } finally {
      setJalan(false);
    }
  }, [host, portNum, user, path, tr]);

  const turun = async (nama: string) => {
    setPesan('');
    try {
      await sftpDownload(host.trim(), portNum, user.trim(), nama, lokal || nama);
      setPesan(`${tr('Downloaded')}: ${nama}`);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
    }
  };

  const naik = async () => {
    if (!lokal.trim() || !remote.trim()) {
      setPesan(tr('Both a local and a remote path are needed.'));
      return;
    }
    setPesan('');
    try {
      await sftpUpload(host.trim(), portNum, user.trim(), lokal.trim(), remote.trim());
      setPesan(`${tr('Uploaded')}: ${lokal.trim()}`);
      await buka();
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
    }
  };

  const bukaTunnel = async () => {
    const l = Number(tLocal);
    const r = Number(tPort);
    if (!host.trim() || !Number.isFinite(l) || !Number.isFinite(r)) {
      setPesan(tr('A host, a local port and a target port are needed.'));
      return;
    }
    setPesan('');
    try {
      const id = `${host.trim()}:${l}->${tTarget}:${r}`;
      const pid = await sftpTunnelStart({
        id,
        host: host.trim(),
        port: portNum,
        user: user.trim(),
        localPort: l,
        targetHost: tTarget.trim() || '127.0.0.1',
        targetPort: r,
      });
      void pid;
      setTunnel((t) => [{ id, localPort: l, target: `${tTarget.trim()}:${r}`, host: host.trim() }, ...t]);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
    }
  };

  const tutupTunnel = async (id: string) => {
    try {
      await sftpTunnelStop(id);
      setTunnel((t) => t.filter((x) => x.id !== id));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
    }
  };

  if (ada === false) {
    return (
      <div className="sftp" data-testid="sftp-root">
        <h1 className="sftp-title">{tr('SFTP')}</h1>
        <p className="sftp-pesan is-err" data-testid="sftp-tidak-ada">
          {tr(
            'The OpenSSH client is not installed. Add it from Settings > Apps > Optional features > OpenSSH Client, then reopen this panel.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="sftp" data-testid="sftp-root">
      <header className="sftp-head">
        <h1 className="sftp-title">{tr('SFTP')}</h1>
        <span className="sftp-hint">{tr('Uses the OpenSSH client; a key or ssh-agent is required.')}</span>
      </header>

      <div className="sftp-row">
        <input
          className="sftp-in"
          data-testid="sftp-host"
          placeholder={tr('host')}
          spellCheck={false}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <input
          className="sftp-in is-small"
          data-testid="sftp-port"
          placeholder="22"
          value={port}
          onChange={(e) => setPort(e.target.value)}
        />
        <input
          className="sftp-in is-small"
          data-testid="sftp-user"
          placeholder={tr('user')}
          spellCheck={false}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <button className="btn btn-primary" data-testid="sftp-open" disabled={jalan} onClick={() => void buka()}>
          {jalan ? tr('Connecting…') : tr('Connect')}
        </button>
      </div>

      <div className="sftp-row">
        <input
          className="sftp-in"
          data-testid="sftp-path"
          placeholder="."
          spellCheck={false}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void buka();
          }}
        />
        <button className="btn btn-sm" data-testid="sftp-up" onClick={() => setPath((p) => p.replace(/\/?[^/]+$/, '') || '.')}>
          ..
        </button>
      </div>

      {pesan && (
        <p className="sftp-pesan" data-testid="sftp-pesan" role="status">
          {pesan}
        </p>
      )}

      {entri.length > 0 && (
        <section className="sftp-list" data-testid="sftp-list">
          {entri.map((e) => (
            <div className="sftp-item" key={e.nama} data-testid={`sftp-item-${e.nama}`}>
              <span className="sftp-mode">{e.direktori ? '/' : '-'}</span>
              <button
                className="sftp-nama"
                data-testid={`sftp-name-${e.nama}`}
                onClick={() => {
                  if (e.direktori) {
                    setPath((p) => `${p.replace(/\/$/, '')}/${e.nama}`);
                    void buka();
                  }
                }}
              >
                {e.nama}
              </button>
              <span className="sftp-size">{e.direktori ? '' : `${e.ukuran} B`}</span>
              {!e.direktori && (
                <button className="btn btn-sm" data-testid={`sftp-get-${e.nama}`} onClick={() => void turun(e.nama)}>
                  {tr('Download')}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="sftp-upload">
        <h2 className="sftp-seksi">{tr('Upload')}</h2>
        <div className="sftp-row">
          <input
            className="sftp-in"
            data-testid="sftp-local"
            placeholder={tr('local path')}
            spellCheck={false}
            value={lokal}
            onChange={(e) => setLokal(e.target.value)}
          />
          <input
            className="sftp-in"
            data-testid="sftp-remote"
            placeholder={tr('remote path')}
            spellCheck={false}
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
          />
          <button className="btn btn-sm" data-testid="sftp-put" onClick={() => void naik()}>
            {tr('Upload')}
          </button>
        </div>
      </section>

      <section className="sftp-tunnel">
        <h2 className="sftp-seksi">{tr('Port forwarding')}</h2>
        <div className="sftp-row">
          <input
            className="sftp-in is-small"
            data-testid="sftp-tlocal"
            placeholder={tr('local port')}
            value={tLocal}
            onChange={(e) => setTLocal(e.target.value)}
          />
          <input
            className="sftp-in"
            data-testid="sftp-ttarget"
            placeholder="127.0.0.1"
            spellCheck={false}
            value={tTarget}
            onChange={(e) => setTTarget(e.target.value)}
          />
          <input
            className="sftp-in is-small"
            data-testid="sftp-tport"
            placeholder={tr('target port')}
            value={tPort}
            onChange={(e) => setTPort(e.target.value)}
          />
          <button className="btn btn-sm" data-testid="sftp-tstart" onClick={() => void bukaTunnel()}>
            {tr('Start tunnel')}
          </button>
        </div>

        {tunnel.length === 0 && <p className="sftp-hint">{tr('No tunnels running.')}</p>}
        {tunnel.map((t) => (
          <div className="sftp-item" key={t.id} data-testid={`sftp-tunnel-${t.localPort}`}>
            <span className="sftp-mode">-L</span>
            <span className="sftp-nama">
              {t.localPort} → {t.target} ({t.host})
            </span>
            <button className="btn btn-sm" data-testid={`sftp-tstop-${t.localPort}`} onClick={() => void tutupTunnel(t.id)}>
              {tr('Stop')}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
