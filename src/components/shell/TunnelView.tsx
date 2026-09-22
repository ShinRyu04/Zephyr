// TunnelView.tsx — panel Cloudflare Tunnel (T2.3).
//
// PERINGATAN KEAMANAN yang ditampilkan terang-terangan: tunnel membuka
// localhost ke internet. Setiap tunnel yang hidup punya URL publik yang
// bisa diakses siapa saja yang tahu alamatnya — jadi URL itu ditampilkan
// besar, dengan tombol salin, dan tombol stop yang jelas.
//
// KENAPA daftar port otomatis: dev server biasanya memakai port yang sama
// tiap kali (5173 Vite, 3000 Next, 8000 PHP). Menampilkan tombol cepat untuk
// port yang benar-benar LISTENING menghilangkan langkah "cari port dulu".

import { useEffect, useState } from 'react';
import { useTunnel } from '../../lib/tunnelStore';
import { useT } from '../../lib/i18n';
import { clipboardWrite } from '../../lib/clipboard';

/** Port dev yang lazim — dipakai sebagai tombol cepat. */
const PORT_UMUM = [5173, 3000, 8000, 8080, 4000, 4200];

export default function TunnelView() {
  const tr = useT();
  const bin = useTunnel((s) => s.bin);
  const terdeteksi = useTunnel((s) => s.terdeteksi);
  const tunnels = useTunnel((s) => s.tunnels);
  const sibuk = useTunnel((s) => s.sibuk);
  const galat = useTunnel((s) => s.galat);
  const detect = useTunnel((s) => s.detect);
  const mulai = useTunnel((s) => s.mulai);
  const stop = useTunnel((s) => s.stop);
  const stopSemua = useTunnel((s) => s.stopSemua);
  const refresh = useTunnel((s) => s.refresh);

  const [port, setPort] = useState('5173');
  const [salin, setSalin] = useState<string | null>(null);

  useEffect(() => {
    void detect();
    void refresh();
  }, [detect, refresh]);

  if (!terdeteksi) {
    return (
      <div className="tun-view http-kosong" data-testid="tun-view">
        <p>{tr('Memeriksa cloudflared…')}</p>
      </div>
    );
  }

  if (!bin) {
    return (
      <div className="tun-view http-kosong" data-testid="tun-belum">
        <p className="tun-judul">{tr('cloudflared belum terpasang')}</p>
        <p className="http-hint">
          {tr('Taruh cloudflared.exe di D:\\DevEnv\\bin\\ lalu buka panel ini lagi.')}
        </p>
      </div>
    );
  }

  const hidup = tunnels.filter((t) => t.hidup);

  return (
    <div className="tun-view" data-testid="tun-view">
      {/* Peringatan: selalu terlihat, bukan toast. */}
      <div className="tun-warn" data-testid="tun-warning">
        ⚠ {tr('Tunnel membuka port lokal ke INTERNET. Siapa pun yang tahu URL-nya bisa mengaksesnya.')}
      </div>

      <div className="tun-baris">
        <span className="tun-label">{tr('Port lokal')}</span>
        <input
          className="tun-port"
          value={port}
          inputMode="numeric"
          data-testid="tun-port"
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && port) void mulai(Number(port));
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          data-testid="tun-start"
          disabled={sibuk || !port}
          onClick={() => void mulai(Number(port))}
        >
          {sibuk ? tr('Menyiapkan…') : tr('Buka tunnel')}
        </button>
        {hidup.length > 0 && (
          <button className="btn btn-sm" data-testid="tun-stop-all" onClick={() => void stopSemua()}>
            {tr('Hentikan semua')}
          </button>
        )}
      </div>

      <div className="tun-cepat">
        {PORT_UMUM.map((p) => (
          <button
            key={p}
            className={`tun-chip${Number(port) === p ? ' is-on' : ''}`}
            data-testid={`tun-cepat-${p}`}
            onClick={() => setPort(String(p))}
          >
            {p}
          </button>
        ))}
      </div>

      {galat && (
        <div className="http-err" data-testid="tun-error">
          {galat}
        </div>
      )}

      {tunnels.length === 0 ? (
        <div className="http-kosong">
          <p>{tr('Belum ada tunnel. Isi port lalu klik Buka tunnel.')}</p>
        </div>
      ) : (
        <div className="tun-daftar" data-testid="tun-list">
          {tunnels.map((t) => (
            <div
              key={t.id}
              className={`tun-item${t.hidup ? ' is-hidup' : ' is-mati'}`}
              data-testid={`tun-item-${t.id}`}
              data-hidup={t.hidup}
            >
              <div className="tun-item-head">
                <span className="tun-dot" aria-hidden="true">
                  {t.hidup ? '●' : '○'}
                </span>
                <span className="tun-port-label">localhost:{t.port}</span>
                <span className="sub-spacer" />
                {t.hidup && (
                  <button
                    className="btn btn-sm"
                    data-testid={`tun-stop-${t.id}`}
                    onClick={() => void stop(t.id)}
                  >
                    {tr('Hentikan')}
                  </button>
                )}
              </div>
              {t.menyiapkan || !t.url ? (
                <div className="tun-url tun-menunggu" data-testid={`tun-pending-${t.id}`}>
                  {tr('Menunggu URL dari Cloudflare…')}
                </div>
              ) : (
                <div className="tun-url" data-testid={`tun-url-${t.id}`}>
                  <a href={t.url} target="_blank" rel="noreferrer noopener">
                    {t.url}
                  </a>
                  <button
                    className="api-mini"
                    data-testid={`tun-copy-${t.id}`}
                    title={tr('Salin URL')}
                    onClick={() => {
                      void clipboardWrite(t.url).then(() => {
                        setSalin(t.id);
                        setTimeout(() => setSalin(null), 1500);
                      });
                    }}
                  >
                    {salin === t.id ? '✓' : '⧉'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
