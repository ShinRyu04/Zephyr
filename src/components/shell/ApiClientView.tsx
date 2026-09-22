// ApiClientView.tsx — API Client: collection + environment (T2.2).
//
// TIGA KOLOM: collection (kiri) · builder (tengah) · response (kanan).
//
// KENAPA collection di DATA APLIKASI, bukan file di repo: request pribadi
// sering memuat token/endpoint internal yang tidak boleh masuk git. File
// `.http` (T1.3) tetap ada untuk yang memang mau dibagikan.

import { useEffect, useState } from 'react';
import {
  useApiClient,
  kirimRequest,
  type SavedRequest,
} from '../../lib/apiClientStore';
import type { HttpRunResult } from '../../lib/commands';
import { useT } from '../../lib/i18n';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

export default function ApiClientView() {
  const tr = useT();
  const collections = useApiClient((s) => s.collections);
  const requests = useApiClient((s) => s.requests);
  const environments = useApiClient((s) => s.environments);
  const envAktif = useApiClient((s) => s.envAktif);
  const terpilih = useApiClient((s) => s.terpilih);
  const muat = useApiClient((s) => s.muat);
  const tambahCollection = useApiClient((s) => s.tambahCollection);
  const hapusCollection = useApiClient((s) => s.hapusCollection);
  const tambahRequest = useApiClient((s) => s.tambahRequest);
  const ubahRequest = useApiClient((s) => s.ubahRequest);
  const hapusRequest = useApiClient((s) => s.hapusRequest);
  const pilih = useApiClient((s) => s.pilih);
  const tambahEnv = useApiClient((s) => s.tambahEnv);
  const ubahEnv = useApiClient((s) => s.ubahEnv);
  const setEnvAktif = useApiClient((s) => s.setEnvAktif);

  const [hasil, setHasil] = useState<HttpRunResult | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tabKiri, setTabKiri] = useState<'collection' | 'env'>('collection');

  useEffect(() => {
    void muat();
  }, [muat]);

  const req = requests.find((r) => r.id === terpilih) ?? null;
  const env = environments.find((e) => e.id === envAktif) ?? null;

  const kirim = async () => {
    if (!req || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const vars = env?.vars ?? [];
      const r = await kirimRequest(req, vars);
      setHasil({ ...r, nama: req.nama });
    } catch (e) {
      setGalat(String((e as { message?: string })?.message ?? e));
      setHasil(null);
    } finally {
      setSibuk(false);
    }
  };

  const gantiHeader = (i: number, k: string, v: string) => {
    if (!req) return;
    const h = [...req.headers];
    h[i] = [k, v];
    ubahRequest(req.id, { headers: h });
  };

  return (
    <div className="api-view" data-testid="api-view">
      {/* ── kolom kiri: collection / environment ── */}
      <div className="api-kiri">
        <div className="api-tabs">
          <button
            className={`api-tab${tabKiri === 'collection' ? ' is-on' : ''}`}
            data-testid="api-tab-collection"
            onClick={() => setTabKiri('collection')}
          >
            {tr('Collection')}
          </button>
          <button
            className={`api-tab${tabKiri === 'env' ? ' is-on' : ''}`}
            data-testid="api-tab-env"
            onClick={() => setTabKiri('env')}
          >
            {tr('Environment')}
          </button>
        </div>

        {tabKiri === 'collection' ? (
          <div className="api-list" data-testid="api-collections">
            {collections.map((c) => (
              <div key={c.id} className="api-col">
                <div className="api-col-head">
                  <span className="api-col-nama">{c.nama}</span>
                  <button
                    className="api-mini"
                    title={tr('Request baru')}
                    data-testid={`api-add-req-${c.id}`}
                    onClick={() => tambahRequest(c.id)}
                  >
                    +
                  </button>
                  <button
                    className="api-mini"
                    title={tr('Hapus collection')}
                    data-testid={`api-del-col-${c.id}`}
                    onClick={() => hapusCollection(c.id)}
                  >
                    ✕
                  </button>
                </div>
                {requests
                  .filter((r) => r.collectionId === c.id)
                  .map((r) => (
                    <button
                      key={r.id}
                      className={`api-req${terpilih === r.id ? ' is-on' : ''}`}
                      data-testid={`api-req-${r.id}`}
                      onClick={() => pilih(r.id)}
                    >
                      <span className={`http-method is-${r.method.toLowerCase()}`}>
                        {r.method}
                      </span>
                      <span className="api-req-nama">{r.nama}</span>
                    </button>
                  ))}
              </div>
            ))}
            <button
              className="api-mini api-add-col"
              data-testid="api-add-col"
              onClick={() => tambahCollection('Collection baru')}
            >
              + {tr('Collection')}
            </button>
          </div>
        ) : (
          <div className="api-list" data-testid="api-envs">
            {environments.map((e) => (
              <div key={e.id} className="api-col">
                <div className="api-col-head">
                  <input
                    className="api-env-radio"
                    type="radio"
                    name="env-aktif"
                    checked={envAktif === e.id}
                    data-testid={`api-env-pick-${e.id}`}
                    onChange={() => setEnvAktif(e.id)}
                  />
                  <span className="api-col-nama">{e.nama}</span>
                  <button
                    className="api-mini"
                    title={tr('Tambah variabel')}
                    data-testid={`api-env-add-${e.id}`}
                    onClick={() => ubahEnv(e.id, { vars: [...e.vars, ['', '']] })}
                  >
                    +
                  </button>
                </div>
                {e.vars.map(([k, v], i) => (
                  <div key={i} className="api-var">
                    <input
                      className="api-var-k"
                      value={k}
                      placeholder="nama"
                      data-testid={`api-var-k-${e.id}-${i}`}
                      onChange={(ev) => {
                        const vs = [...e.vars];
                        vs[i] = [ev.target.value, vs[i][1]];
                        ubahEnv(e.id, { vars: vs });
                      }}
                    />
                    <input
                      className="api-var-v"
                      value={v}
                      placeholder="nilai"
                      data-testid={`api-var-v-${e.id}-${i}`}
                      onChange={(ev) => {
                        const vs = [...e.vars];
                        vs[i] = [vs[i][0], ev.target.value];
                        ubahEnv(e.id, { vars: vs });
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
            <button
              className="api-mini api-add-col"
              data-testid="api-add-env"
              onClick={() => tambahEnv('Environment baru')}
            >
              + {tr('Environment')}
            </button>
          </div>
        )}
      </div>

      {/* ── kolom tengah: builder ── */}
      <div className="api-tengah">
        {!req ? (
          <div className="http-kosong">
            <p>{tr('Pilih atau buat request untuk mulai.')}</p>
          </div>
        ) : (
          <>
            <div className="api-baris">
              <select
                className="api-method"
                value={req.method}
                data-testid="api-method"
                onChange={(e) => ubahRequest(req.id, { method: e.target.value })}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="api-url"
                value={req.url}
                placeholder="{{base}}/users"
                data-testid="api-url"
                onChange={(e) => ubahRequest(req.id, { url: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void kirim();
                }}
              />
              <button
                className="btn btn-sm btn-primary"
                data-testid="api-send"
                disabled={sibuk}
                onClick={() => void kirim()}
              >
                {sibuk ? tr('Mengirim…') : tr('Kirim')}
              </button>
            </div>

            <input
              className="api-nama"
              value={req.nama}
              placeholder={tr('Nama request')}
              data-testid="api-nama"
              onChange={(e) => ubahRequest(req.id, { nama: e.target.value })}
            />

            <div className="api-seksi">
              <div className="api-seksi-head">
                <span>{tr('Header')}</span>
                <button
                  className="api-mini"
                  data-testid="api-add-header"
                  onClick={() => ubahRequest(req.id, { headers: [...req.headers, ['', '']] })}
                >
                  +
                </button>
                <span className="api-spacer" />
                <button
                  className="api-mini"
                  data-testid="api-del-req"
                  title={tr('Hapus request')}
                  onClick={() => hapusRequest(req.id)}
                >
                  🗑
                </button>
              </div>
              {req.headers.map(([k, v], i) => (
                <div key={i} className="api-var">
                  <input
                    className="api-var-k"
                    value={k}
                    placeholder="Content-Type"
                    data-testid={`api-hk-${i}`}
                    onChange={(e) => gantiHeader(i, e.target.value, v)}
                  />
                  <input
                    className="api-var-v"
                    value={v}
                    placeholder="application/json"
                    data-testid={`api-hv-${i}`}
                    onChange={(e) => gantiHeader(i, k, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {req.method !== 'GET' && req.method !== 'HEAD' && (
              <div className="api-seksi api-seksi-grow">
                <div className="api-seksi-head">
                  <span>{tr('Body')}</span>
                </div>
                <textarea
                  className="api-body"
                  value={req.body}
                  placeholder={'{\n  "nama": "Budi"\n}'}
                  data-testid="api-body"
                  onChange={(e) => ubahRequest(req.id, { body: e.target.value })}
                />
              </div>
            )}

            {galat && (
              <div className="http-err" data-testid="api-error">
                {galat}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── kolom kanan: response ── */}
      <div className="api-kanan" data-testid="api-response">
        {!hasil && !sibuk && (
          <div className="http-kosong">
            <p>{tr('Response muncul di sini.')}</p>
          </div>
        )}
        {sibuk && <div className="http-status">{tr('Mengirim…')}</div>}
        {hasil && !sibuk && (
          <>
            <div className="http-status" data-testid="api-status">
              <span className={`http-code${hasil.ok && hasil.status < 400 ? ' is-ok' : ' is-err'}`}>
                {hasil.ok ? hasil.status : '—'}
              </span>
              <span className="http-status-text">{hasil.error ?? hasil.statusText}</span>
              <span className="http-ms">{hasil.ms} ms</span>
            </div>
            <pre className="http-body" data-testid="api-body-out">
              {hasil.body || tr('(body kosong)')}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

// Re-export kecil supaya tipe request bisa dipakai harness tanpa impor ganda.
export type { SavedRequest };
