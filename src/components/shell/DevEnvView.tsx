// DevEnvView.tsx — panel Dev Environment (T3.1).
//
// KENAPA tiga kolom: pekerjaannya tiga tahap yang urutannya jelas — pilih
// layanan, pilih versi, lihat yang hidup. Menaruhnya bertumpuk membuat user
// menggulir bolak-balik.
//
// PERINGATAN yang ditampilkan: menyalakan layanan = membuka port. Port yang
// sudah dipakai TIDAK direbut (Rust menolak), dan UI menjelaskan alasannya.

import { useEffect, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useT } from '../../lib/i18n';

/** Satu versi layanan dari Rust. */
interface LayananVersi {
  layanan: string;
  versi: string;
  path: string;
  exe: string;
}

/** Layanan yang hidup. */
interface LayananHidup {
  layanan: string;
  versi: string;
  pid: number;
  port: number;
  siap: boolean;
}

/** Ikon + warna per layanan (dipakai di chip). */
const IKON: Record<string, string> = {
  php: '🐘',
  nginx: '⬢',
  mariadb: '🐬',
  redis: '◆',
};

const PORT: Record<string, number> = {
  php: 8000,
  nginx: 80,
  mariadb: 3306,
  redis: 6379,
};

export default function DevEnvView() {
  const tr = useT();
  const [versi, setVersi] = useState<LayananVersi[]>([]);
  const [hidup, setHidup] = useState<LayananHidup[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [pilih, setPilih] = useState<string>('php');
  const [sibuk, setSibuk] = useState(false);
  const [dimuat, setDimuat] = useState(false);

  const muat = async () => {
    try {
      const [v, h] = await Promise.all([cmd.devenvDetect(), cmd.devenvStatus()]);
      setVersi(v);
      setHidup(h);
      setGalat(null);
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
    } finally {
      setDimuat(true);
    }
  };

  useEffect(() => {
    void muat();
    // Polling 4 detik: layanan butuh waktu inisialisasi (mysqld ~5s), jadi
    // status "siap" harus datang sendiri tanpa user menekan refresh.
    const t = setInterval(() => void muat(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nyalakan = async (v: LayananVersi) => {
    setSibuk(true);
    setGalat(null);
    try {
      await cmd.devenvStart(v.layanan, v.path);
      await muat();
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  const matikan = async (port: number) => {
    setSibuk(true);
    try {
      await cmd.devenvStop(port);
      await muat();
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
    } finally {
      setSibuk(false);
    }
  };

  // Layanan unik yang terdeteksi (untuk kolom kiri).
  const layananUnik = Array.from(new Set(versi.map((v) => v.layanan)));
  const versiLayanan = versi.filter((v) => v.layanan === pilih);
  const hidupUntuk = (l: string) => hidup.find((h) => h.layanan === l);

  return (
    <div className="devenv-view" data-testid="devenv-view">
      <div className="devenv-head">
        <span className="devenv-judul">{tr('Dev Environment')}</span>
        <span className="devenv-jumlah">
          {versi.length} {tr('versi terdeteksi')}
        </span>
        <span className="sub-spacer" />
        <button
          className="btn btn-sm"
          data-testid="devenv-refresh"
          disabled={sibuk}
          onClick={() => void muat()}
        >
          {tr('Muat ulang')}
        </button>
      </div>

      {galat && (
        <div className="http-err" data-testid="devenv-error">
          {galat}
        </div>
      )}

      {!dimuat ? (
        <div className="http-kosong">
          <p>{tr('Memuat…')}</p>
        </div>
      ) : versi.length === 0 ? (
        <div className="http-kosong" data-testid="devenv-empty">
          <p>{tr('Tidak ada layanan di folder DevEnv.')}</p>
          <p className="http-hint">
            {tr('Letakkan PHP/Nginx/MariaDB/Redis di')} <code>D:\DevEnv\</code>
          </p>
        </div>
      ) : (
        <div className="devenv-grid">
          {/* Kolom 1: daftar layanan */}
          <div className="devenv-kolom" data-testid="devenv-layanan">
            <div className="devenv-kolom-judul">{tr('Layanan')}</div>
            {layananUnik.map((l) => {
              const h = hidupUntuk(l);
              return (
                <button
                  key={l}
                  className={`devenv-layanan${pilih === l ? ' is-aktif' : ''}${h ? ' is-hidup' : ''}`}
                  data-testid={`devenv-svc-${l}`}
                  onClick={() => setPilih(l)}
                >
                  <span className="devenv-ikon" aria-hidden="true">
                    {IKON[l] ?? '▪'}
                  </span>
                  <span className="devenv-nama">{l}</span>
                  {h && (
                    <span className="devenv-dot" title={`${tr('hidup di port')} ${h.port}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Kolom 2: versi yang tersedia */}
          <div className="devenv-kolom" data-testid="devenv-versi">
            <div className="devenv-kolom-judul">
              {tr('Versi')} · {pilih}
            </div>
            {versiLayanan.map((v) => {
              const h = hidupUntuk(v.layanan);
              const iniHidup = !!h && h.siap;
              return (
                <div key={v.path} className="devenv-versi" data-testid={`devenv-ver-${v.versi}`}>
                  <span className="devenv-ver-nama">{v.versi}</span>
                  <span className="sub-spacer" />
                  {iniHidup ? (
                    <button
                      className="btn btn-sm btn-bahaya"
                      data-testid={`devenv-stop-${v.layanan}`}
                      disabled={sibuk}
                      onClick={() => void matikan(h!.port)}
                    >
                      ■ {tr('Matikan')}
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      data-testid={`devenv-start-${v.layanan}-${v.versi}`}
                      disabled={sibuk}
                      onClick={() => void nyalakan(v)}
                    >
                      ▶ {tr('Nyalakan')}
                    </button>
                  )}
                </div>
              );
            })}
            <div className="devenv-hint">
              {tr('Port')}: <code>{PORT[pilih] ?? '—'}</code>
            </div>
          </div>

          {/* Kolom 3: yang sedang hidup */}
          <div className="devenv-kolom" data-testid="devenv-hidup">
            <div className="devenv-kolom-judul">{tr('Berjalan')}</div>
            {hidup.length === 0 ? (
              <div className="devenv-kosong">{tr('Tidak ada layanan berjalan.')}</div>
            ) : (
              hidup.map((h) => (
                <div key={h.layanan} className="devenv-hidup" data-testid={`devenv-live-${h.layanan}`}>
                  <span className={`devenv-led${h.siap ? ' is-on' : ''}`} />
                  <span className="devenv-nama">{h.layanan}</span>
                  <code className="devenv-port">:{h.port}</code>
                  {!h.siap && <span className="devenv-tunggu">{tr('menyiapkan…')}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
