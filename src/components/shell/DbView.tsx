// DbView.tsx — Database browser (T3.2).
//
// KENAPA SQLite lebih dulu: file SQLite ada di mana-mana (proyek mobile, cache
// aplikasi, data uji) dan membukanya tidak butuh server. MySQL/Postgres butuh
// server hidup + kredensial; kalau servernya mati, panel memberi tahu — bukan
// menggantung menunggu koneksi.
//
// BATAS KEAMANAN yang terlihat di UI: query yang bukan SELECT ditolak kecuali
// mode tulis dinyalakan. Tombolnya ada, tapi statusnya selalu terlihat.

import { useState } from 'react';
import * as cmd from '../../lib/commands';
import { useT } from '../../lib/i18n';

/** Satu tabel dari Rust. */
interface TabelInfo {
  nama: string;
  jenis: string;
  baris: number;
}

/** Hasil query. */
interface HasilQuery {
  kolom: string[];
  baris: string[][];
  dipotong: boolean;
  ms: number;
  terpengaruh: number;
}

export default function DbView() {
  const tr = useT();
  const [path, setPath] = useState('');
  const [tabel, setTabel] = useState<TabelInfo[]>([]);
  const [sql, setSql] = useState('SELECT * FROM ');
  const [hasil, setHasil] = useState<HasilQuery | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tulis, setTulis] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [dimuat, setDimuat] = useState(false);

  const buka = async () => {
    if (!path.trim()) return;
    setSibuk(true);
    setGalat(null);
    try {
      const t = await cmd.dbSqliteTabel(path.trim());
      setTabel(t);
      if (t.length > 0) setSql(`SELECT * FROM "${t[0].nama}" LIMIT 100`);
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
      setTabel([]);
    } finally {
      setSibuk(false);
      setDimuat(true);
    }
  };

  const jalankan = async () => {
    if (!sql.trim() || !path.trim()) return;
    setSibuk(true);
    setGalat(null);
    try {
      const h = await cmd.dbSqliteQuery(path.trim(), sql.trim(), tulis);
      setHasil(h);
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
      setHasil(null);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="db-view" data-testid="db-view">
      <div className="db-head">
        <span className="db-judul">{tr('Database')}</span>
        <input
          className="db-path"
          data-testid="db-path"
          placeholder={tr('Path file SQLite (.db / .sqlite)')}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void buka();
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          data-testid="db-open"
          disabled={sibuk || !path.trim()}
          onClick={() => void buka()}
        >
          {tr('Buka')}
        </button>
        <label className="db-tulis" title={tr('Izinkan query yang mengubah data')}>
          <input
            type="checkbox"
            data-testid="db-write"
            checked={tulis}
            onChange={(e) => setTulis(e.target.checked)}
          />
          {tr('Mode tulis')}
        </label>
      </div>

      {galat && (
        <div className="http-err" data-testid="db-error">
          {galat}
        </div>
      )}

      <div className="db-grid">
        {/* Kiri: daftar tabel */}
        <div className="db-kolom">
          <div className="devenv-kolom-judul">{tr('Tabel')}</div>
          {tabel.length === 0 ? (
            <div className="devenv-kosong" data-testid="db-empty">
              {dimuat ? tr('Tidak ada tabel.') : tr('Buka file database dulu.')}
            </div>
          ) : (
            <div className="db-tabel" data-testid="db-tables">
              {tabel.map((t) => (
                <button
                  key={t.nama}
                  className="db-tabel-item"
                  data-testid={`db-t-${t.nama}`}
                  onClick={() => setSql(`SELECT * FROM "${t.nama}" LIMIT 100`)}
                  title={t.jenis}
                >
                  <span className="db-tabel-nama">{t.nama}</span>
                  <span className="db-tabel-n">{t.baris < 0 ? '?' : t.baris}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kanan: SQL + hasil */}
        <div className="db-kolom db-kanan">
          <div className="db-sql-bar">
            <textarea
              className="db-sql"
              data-testid="db-sql"
              rows={3}
              spellCheck={false}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary db-run"
              data-testid="db-run"
              disabled={sibuk || !path.trim() || !sql.trim()}
              onClick={() => void jalankan()}
            >
              ▶ {tr('Jalankan')}
            </button>
          </div>

          {hasil && (
            <div className="db-hasil" data-testid="db-result">
              <div className="db-meta">
                <span>
                  {hasil.baris.length} {tr('baris data')} · {hasil.ms}ms
                </span>
                {hasil.terpengaruh > 0 && (
                  <span className="db-terpengaruh">
                    {hasil.terpengaruh} {tr('terpengaruh')}
                  </span>
                )}
                {hasil.dipotong && (
                  <span className="db-potong">
                    {tr('dipotong — tambahkan LIMIT')}
                  </span>
                )}
              </div>
              {hasil.kolom.length > 0 && (
                <div className="db-tabel-scroll">
                  <table className="db-table">
                    <thead>
                      <tr>
                        {hasil.kolom.map((k) => (
                          <th key={k}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hasil.baris.map((b, i) => (
                        <tr key={i}>
                          {b.map((v, j) => (
                            <td key={j} title={v}>
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
