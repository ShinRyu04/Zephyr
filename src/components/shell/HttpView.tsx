// HttpView.tsx — penjalan file `.http` ala ekstensi REST Client (T1.3).
//
// ALUR: file `.http` yang sedang terbuka di editor diurai jadi daftar request
// (lewat Rust, `http_parse`), ditampilkan sebagai daftar yang bisa diklik.
// Klik satu -> request dikirim (`http_send`) -> response tampil di bawah.
//
// KENAPA parse di Rust, bukan di JS: aturan format `.http` (komentar, header,
// body, `###`, `@name`) sudah dikunci uji unit di sana. Menyalinnya ke JS
// berarti dua implementasi yang bisa berbeda diam-diam.
//
// VARIABEL: dibaca dari environment aktif di file `.http` (`@nama = nilai`)
// — bentuk yang sama dipakai REST Client, jadi file yang sudah ada di repo
// user langsung jalan tanpa diubah.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import * as cmd from '../../lib/commands';
import type { HttpRequestDef, HttpRunResult } from '../../lib/commands';
import { useT } from '../../lib/i18n';

/** Ambil definisi variabel `@nama = nilai` dari isi file. */
function ambilVariabel(isi: string): [string, string][] {
  const hasil: [string, string][] = [];
  for (const baris of isi.split('\n')) {
    const m = /^\s*@([A-Za-z_][\w-]*)\s*=\s*(.*)$/.exec(baris);
    if (m) hasil.push([m[1], m[2].trim()]);
  }
  return hasil;
}

export default function HttpView() {
  const tr = useT();
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  const [daftar, setDaftar] = useState<HttpRequestDef[]>([]);
  const [hasil, setHasil] = useState<HttpRunResult | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const tabAktif = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const fileHttp = useMemo(() => {
    if (!tabAktif) return null;
    const isHttp = tabAktif.name.toLowerCase().endsWith('.http') ||
      tabAktif.name.toLowerCase().endsWith('.rest');
    return isHttp ? tabAktif : null;
  }, [tabAktif]);

  // Urai ulang setiap kali isi file berubah — daftar request harus selalu
  // sinkron dengan apa yang user lihat di editor.
  useEffect(() => {
    if (!fileHttp) {
      setDaftar([]);
      return;
    }
    let batal = false;
    void (async () => {
      try {
        const vars = ambilVariabel(fileHttp.content);
        const r = await cmd.httpParse(fileHttp.content, vars);
        if (!batal) {
          setDaftar(r);
          setGalat(null);
        }
      } catch (e) {
        if (!batal) setGalat(cmd.asZephyrError(e).message);
      }
    })();
    return () => {
      batal = true;
    };
  }, [fileHttp?.id, fileHttp?.content]);

  const kirim = async (req: HttpRequestDef) => {
    if (sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const vars = fileHttp ? ambilVariabel(fileHttp.content) : [];
      const r = await cmd.httpSend({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body || undefined,
        variabel: vars,
      });
      setHasil({ ...r, nama: req.nama });
    } catch (e) {
      setGalat(cmd.asZephyrError(e).message);
      setHasil(null);
    } finally {
      setSibuk(false);
    }
  };

  if (!fileHttp) {
    return (
      <div className="http-view http-kosong" data-testid="http-empty">
        <p>{tr('Buka file .http untuk menjalankan request.')}</p>
        <p className="http-hint">
          {tr('Format: ### pemisah · METHOD URL · header: nilai · baris kosong lalu body')}
        </p>
      </div>
    );
  }

  return (
    <div className="http-view" data-testid="http-view">
      <div className="http-head">
        <span className="http-file" title={fileHttp.path ?? fileHttp.name}>
          {fileHttp.name}
        </span>
        <span className="http-count">
          {daftar.length} {tr('request')}
        </span>
      </div>

      {galat && (
        <div className="http-err" data-testid="http-error">
          {galat}
        </div>
      )}

      {daftar.length === 0 ? (
        <div className="http-kosong">
          <p>{tr('Tidak ada request terbaca di file ini.')}</p>
        </div>
      ) : (
        <div className="http-split">
          <ul className="http-list" data-testid="http-list">
            {daftar.map((r, i) => (
              <li key={i}>
                <button
                  className="http-item"
                  data-testid={`http-req-${i}`}
                  disabled={sibuk}
                  title={`${r.method} ${r.url}`}
                  onClick={() => void kirim(r)}
                >
                  <span className={`http-method is-${r.method.toLowerCase()}`}>
                    {r.method}
                  </span>
                  <span className="http-name">{r.nama}</span>
                  <span className="http-line">{tr('baris')} {r.baris}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="http-resp" data-testid="http-response">
            {sibuk && <div className="http-status">{tr('Mengirim…')}</div>}
            {!sibuk && !hasil && (
              <div className="http-kosong">
                <p>{tr('Klik satu request untuk menjalankannya.')}</p>
              </div>
            )}
            {!sibuk && hasil && (
              <>
                <div className="http-status" data-testid="http-status">
                  <span
                    className={`http-code${hasil.ok && hasil.status < 400 ? ' is-ok' : ' is-err'}`}
                  >
                    {hasil.ok ? hasil.status : '—'}
                  </span>
                  <span className="http-status-text">
                    {hasil.error ?? hasil.statusText}
                  </span>
                  <span className="http-ms">{hasil.ms} ms</span>
                  {hasil.terpotong && (
                    <span className="http-warn">{tr('dipotong')}</span>
                  )}
                </div>
                {hasil.headers.length > 0 && (
                  <details className="http-headers">
                    <summary>
                      {tr('Header')} ({hasil.headers.length})
                    </summary>
                    <pre>
                      {hasil.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}
                    </pre>
                  </details>
                )}
                <pre className="http-body" data-testid="http-body">
                  {hasil.body || tr('(body kosong)')}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
