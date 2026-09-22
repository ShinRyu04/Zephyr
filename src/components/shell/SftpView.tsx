// SftpView.tsx — SFTP explorer + SSH port forwarding (T3.3).
//
// DUA HAL DALAM SATU PANEL, sengaja dipisah jadi dua tab kecil:
//   * "File" — jelajahi file remote, unduh, hapus.
//   * "Port" — tunnel port (lokal/remote/SOCKS).
// Keduanya butuh host yang sama, jadi menaruhnya berdampingan menghindari
// user memilih host dua kali.
//
// PERINGATAN yang terlihat: tunnel membuka port lokal. Setiap tunnel yang hidup
// ditampilkan dengan label tujuannya, dan Zephyr mematikannya saat keluar.

import { useEffect, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useT } from '../../lib/i18n';

/** Host SSH (bentuk yang dikirim Rust — tanpa password). */
interface SshHost {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: string;
  keyPath?: string;
}

/** Satu entri file remote. */
interface FileRemote {
  nama: string;
  dir: boolean;
  ukuran: number;
  izin: string;
  waktu: string;
}

/** Satu tunnel hidup. */
interface TunnelPort {
  id: string;
  hostId: string;
  jenis: string;
  portLokal: number;
  tujuan: string;
  pid: number;
  label: string;
}

/** Ukuran dalam satuan yang mudah dibaca. */
function ukuran(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export default function SftpView() {
  const tr = useT();
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [hostId, setHostId] = useState('');
  const [tab, setTab] = useState<'file' | 'port'>('file');

  // ── File remote ──
  const [path, setPath] = useState('.');
  const [file, setFile] = useState<FileRemote[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dimuat, setDimuat] = useState(false);

  // ── Tunnel port ──
  const [tunnel, setTunnel] = useState<TunnelPort[]>([]);
  const [jenis, setJenis] = useState<'lokal' | 'remote' | 'socks'>('lokal');
  const [portLokal, setPortLokal] = useState('8080');
  const [tujuan, setTujuan] = useState('localhost:3000');

  useEffect(() => {
    void (async () => {
      try {
        const h = await cmd.sshList();
        setHosts(h as never);
        if (h.length > 0) setHostId((h[0] as never as SshHost).id);
      } catch (e) {
        setGalat(cmd.asZephyrError(e).message);
      }
    })();
  }, []);

  const hostAktif = hosts.find((h) => h.id === hostId);

  const buka = async (p = path) => {
    if (!hostAktif) return;
    setSibuk(true);
    setGalat(null);
    try {
      const f = await cmd.sshSftpList(hostAktif as never, p);
      setFile(f);
      setPath(p);
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
      setFile([]);
    } finally {
      setSibuk(false);
      setDimuat(true);
    }
  };

  const nyalakan = async () => {
    if (!hostAktif) return;
    const p = parseInt(portLokal, 10);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) {
      setGalat(tr('Port tidak valid.'));
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const t = await cmd.sshForwardStart(hostAktif as never, jenis, p, tujuan);
      setTunnel((x) => [...x, t]);
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  const matikan = async (id: string) => {
    try {
      await cmd.sshForwardStop(id);
      setTunnel((x) => x.filter((t) => t.id !== id));
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
    }
  };

  return (
    <div className="sftp-view" data-testid="sftp-view">
      <div className="sftp-head">
        <span className="sftp-judul">SFTP</span>
        <select
          className="sftp-host"
          data-testid="sftp-host"
          value={hostId}
          onChange={(e) => setHostId(e.target.value)}
        >
          {hosts.length === 0 && <option value="">{tr('Belum ada host SSH')}</option>}
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.user}@{h.host})
            </option>
          ))}
        </select>
        <div className="sftp-tabs">
          <button
            className={`sftp-tab${tab === 'file' ? ' is-aktif' : ''}`}
            data-testid="sftp-tab-file"
            onClick={() => setTab('file')}
          >
            {tr('File')}
          </button>
          <button
            className={`sftp-tab${tab === 'port' ? ' is-aktif' : ''}`}
            data-testid="sftp-tab-port"
            onClick={() => setTab('port')}
          >
            {tr('Port')} {tunnel.length > 0 && <span className="sftp-badge">{tunnel.length}</span>}
          </button>
        </div>
      </div>

      {galat && (
        <div className="http-err" data-testid="sftp-error">
          {galat}
        </div>
      )}

      {!hostAktif ? (
        <div className="http-kosong" data-testid="sftp-empty">
          <p>{tr('Tambahkan host SSH dulu di panel SSH.')}</p>
        </div>
      ) : tab === 'file' ? (
        <>
          <div className="sftp-bar">
            <button
              className="btn btn-sm"
              data-testid="sftp-up"
              disabled={path === '.' || path === '/'}
              onClick={() => {
                const naik = path.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '.';
                void buka(naik);
              }}
            >
              ↑
            </button>
            <input
              className="sftp-path"
              data-testid="sftp-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void buka();
              }}
            />
            <button
              className="btn btn-sm btn-primary"
              data-testid="sftp-open"
              disabled={sibuk}
              onClick={() => void buka()}
            >
              {tr('Buka')}
            </button>
          </div>

          {file.length === 0 ? (
            <div className="devenv-kosong" data-testid="sftp-no-file">
              {dimuat ? tr('Kosong.') : tr('Muat ulang untuk membaca isi folder.')}
            </div>
          ) : (
            <div className="sftp-daftar" data-testid="sftp-list">
              {file.map((f) => (
                <div key={f.nama} className="sftp-item" data-testid={`sftp-${f.nama}`}>
                  <span className="sftp-ikon" aria-hidden="true">
                    {f.dir ? '📁' : '📄'}
                  </span>
                  {f.dir ? (
                    <button
                      className="sftp-nama is-dir"
                      onClick={() => void buka(path === '.' ? f.nama : `${path}/${f.nama}`)}
                    >
                      {f.nama}
                    </button>
                  ) : (
                    <span className="sftp-nama">{f.nama}</span>
                  )}
                  <span className="sftp-ukuran">{f.dir ? '—' : ukuran(f.ukuran)}</span>
                  <span className="sftp-waktu">{f.waktu}</span>
                  {!f.dir && (
                    <button
                      className="api-mini"
                      data-testid={`sftp-hapus-${f.nama}`}
                      title={tr('Hapus file remote')}
                      onClick={() => {
                        const p = path === '.' ? f.nama : `${path}/${f.nama}`;
                        void (async () => {
                          try {
                            await cmd.sshSftpHapus(hostAktif as never, p);
                            await buka();
                          } catch (e) {
                            setGalat(cmd.asZephyrError(e).message);
                          }
                        })();
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="sftp-bar">
            <select
              className="sftp-jenis"
              data-testid="sftp-jenis"
              value={jenis}
              onChange={(e) => setJenis(e.target.value as never)}
            >
              <option value="lokal">{tr('Lokal (-L)')}</option>
              <option value="remote">{tr('Remote (-R)')}</option>
              <option value="socks">SOCKS (-D)</option>
            </select>
            <input
              className="sftp-port"
              data-testid="sftp-port"
              placeholder={tr('Port lokal')}
              value={portLokal}
              onChange={(e) => setPortLokal(e.target.value)}
            />
            {jenis !== 'socks' && (
              <input
                className="sftp-tujuan"
                data-testid="sftp-tujuan"
                placeholder="host:port"
                value={tujuan}
                onChange={(e) => setTujuan(e.target.value)}
              />
            )}
            <button
              className="btn btn-sm btn-primary"
              data-testid="sftp-forward-start"
              disabled={sibuk}
              onClick={() => void nyalakan()}
            >
              ▶ {tr('Nyalakan tunnel')}
            </button>
          </div>

          {tunnel.length === 0 ? (
            <div className="devenv-kosong" data-testid="sftp-no-tunnel">
              {tr('Belum ada tunnel. Port yang sudah dipakai tidak akan direbut.')}
            </div>
          ) : (
            <div className="sftp-daftar" data-testid="sftp-tunnels">
              {tunnel.map((t) => (
                <div key={t.id} className="sftp-item" data-testid={`sftp-tunnel-${t.id}`}>
                  <span className="devenv-led is-on" />
                  <span className="sftp-nama">{t.label}</span>
                  <span className="sftp-ukuran">{t.jenis}</span>
                  <button
                    className="btn btn-sm btn-bahaya"
                    data-testid={`sftp-tunnel-stop-${t.id}`}
                    onClick={() => void matikan(t.id)}
                  >
                    ■
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
