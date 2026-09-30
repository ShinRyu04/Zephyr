import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import {
  httpRequest,
  graphqlBody,
  graphqlErrors,
  credentialsList,
  type HttpJawaban,
  type CredentialInfo,
} from '../../lib/commands';

type Mode = 'rest' | 'graphql';

interface Riwayat {
  method: string;
  url: string;
  status: number;
  ms: number;
}

/**
 * The API client panel.
 *
 * One surface for REST and GraphQL: the mode only changes how the body is
 * built. Everything else (method, headers, auth, response, history) is shared,
 * because a request is a request.
 */
export default function ApiClientView() {
  const tr = useT();

  const [mode, setMode] = useState<Mode>('rest');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://');
  const [headers, setHeaders] = useState('Content-Type: application/json');
  const [body, setBody] = useState('');
  const [variables, setVariables] = useState('{\n  \n}');
  const [cred, setCred] = useState('');
  const [credKind, setCredKind] = useState<'none' | 'bearer' | 'apikey'>('none');

  const [jalan, setJalan] = useState(false);
  const [jawaban, setJawaban] = useState<HttpJawaban | null>(null);
  const [gqlErr, setGqlErr] = useState<string[]>([]);
  const [pesan, setPesan] = useState('');
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [kredensial, setKredensial] = useState<CredentialInfo[]>([]);

  const abortRef = useRef(false);

  useEffect(() => {
    void credentialsList()
      .then((k) => setKredensial(k ?? []))
      .catch(() => setKredensial([]));
  }, []);

  const barisHeader = useMemo(
    () =>
      headers
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes(':') && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf(':');
          return { nama: l.slice(0, i).trim(), nilai: l.slice(i + 1).trim() };
        })
        .filter((h) => h.nama.length > 0),
    [headers],
  );

  const kirim = useCallback(async () => {
    if (jalan) return;
    if (!/^https?:\/\//.test(url.trim())) {
      setPesan(tr('A URL must start with http:// or https://'));
      return;
    }
    setPesan('');
    setGqlErr([]);
    setJawaban(null);
    setJalan(true);
    abortRef.current = false;
    try {
      const bodi =
        mode === 'graphql'
          ? await graphqlBody(body || '{ __typename }', variables)
          : body.trim() || null;

      const isiHeader = [...barisHeader];
      if (mode === 'graphql' && !isiHeader.some((h) => h.nama.toLowerCase() === 'content-type')) {
        isiHeader.push({ nama: 'Content-Type', nilai: 'application/json' });
      }

      const hasil = await httpRequest({
        method: mode === 'graphql' ? 'POST' : method,
        url: url.trim(),
        headers: isiHeader,
        body: bodi,
        bearerCredential: credKind === 'bearer' ? cred : null,
        apiKeyCredential: credKind === 'apikey' ? cred : null,
      });

      if (abortRef.current) return;
      setJawaban(hasil);
      if (mode === 'graphql') setGqlErr((await graphqlErrors(hasil.body)) ?? []);
      setRiwayat((r) =>
        [
          { method: mode === 'graphql' ? 'POST' : method, url: url.trim(), status: hasil.status, ms: hasil.ms },
          ...r,
        ].slice(0, 12),
      );
    } catch (e) {
      if (!abortRef.current) setPesan(e instanceof Error ? e.message : String(e));
    } finally {
      if (!abortRef.current) setJalan(false);
    }
  }, [jalan, url, mode, body, variables, method, barisHeader, cred, credKind, tr]);

  const cantik = useMemo(() => {
    if (!jawaban) return '';
    try {
      return JSON.stringify(JSON.parse(jawaban.body), null, 2).slice(0, 200_000);
    } catch {
      return jawaban.body;
    }
  }, [jawaban]);

  const kelasStatus = jawaban
    ? jawaban.status < 300
      ? 'is-ok'
      : jawaban.status < 400
        ? 'is-redirect'
        : 'is-err'
    : '';

  return (
    <div className="api" data-testid="api-root">
      <header className="api-head">
        <h1 className="api-title">{tr('API Client')}</h1>
        <div className="api-mode" role="tablist" aria-label={tr('Request kind')}>
          <button
            role="tab"
            aria-selected={mode === 'rest'}
            className={`api-mode-btn${mode === 'rest' ? ' is-on' : ''}`}
            data-testid="api-mode-rest"
            onClick={() => setMode('rest')}
          >
            REST
          </button>
          <button
            role="tab"
            aria-selected={mode === 'graphql'}
            className={`api-mode-btn${mode === 'graphql' ? ' is-on' : ''}`}
            data-testid="api-mode-graphql"
            onClick={() => setMode('graphql')}
          >
            GraphQL
          </button>
        </div>
      </header>

      <div className="api-row">
        {mode === 'rest' ? (
          <select
            className="api-method"
            data-testid="api-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <span className="api-method is-fixed">POST</span>
        )}
        <input
          className="api-url"
          data-testid="api-url"
          spellCheck={false}
          placeholder={tr('https://api.example.com/endpoint')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void kirim();
          }}
        />
        <button className="btn btn-primary" data-testid="api-send" disabled={jalan} onClick={() => void kirim()}>
          {jalan ? tr('Sending…') : tr('Send')}
        </button>
      </div>

      <div className="api-auth">
        <span className="api-label">{tr('Auth')}</span>
        <select
          className="api-select"
          data-testid="api-auth-kind"
          value={credKind}
          onChange={(e) => setCredKind(e.target.value as typeof credKind)}
        >
          <option value="none">{tr('none')}</option>
          <option value="bearer">Bearer</option>
          <option value="apikey">X-API-Key</option>
        </select>
        {credKind !== 'none' && (
          <select
            className="api-select"
            data-testid="api-auth-cred"
            value={cred}
            onChange={(e) => setCred(e.target.value)}
          >
            <option value="">{tr('pick a credential')}</option>
            {kredensial.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        )}
        {credKind !== 'none' && kredensial.length === 0 && (
          <span className="api-hint">{tr('Add one in Settings, Dev Environment.')}</span>
        )}
      </div>

      <div className="api-panes">
        <div className="api-pane">
          <div className="api-pane-head">
            <span>{mode === 'graphql' ? tr('Query') : tr('Body')}</span>
            <span className="api-hint">Ctrl+Enter {tr('to send')}</span>
          </div>
          <textarea
            className="api-edit"
            data-testid="api-body"
            spellCheck={false}
            placeholder={mode === 'graphql' ? 'query { hello }' : '{ }'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {mode === 'graphql' && (
            <>
              <div className="api-pane-head">
                <span>{tr('Variables')}</span>
              </div>
              <textarea
                className="api-edit is-small"
                data-testid="api-vars"
                spellCheck={false}
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
              />
            </>
          )}
        </div>

        <div className="api-pane">
          <div className="api-pane-head">
            <span>{tr('Headers')}</span>
            <span className="api-hint">{tr('one per line, Name: value')}</span>
          </div>
          <textarea
            className="api-edit is-small"
            data-testid="api-headers"
            spellCheck={false}
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
          />
        </div>
      </div>

      {pesan && (
        <p className="api-pesan is-err" data-testid="api-pesan" role="alert">
          {pesan}
        </p>
      )}

      {jawaban && (
        <section className="api-jawaban" data-testid="api-response">
          <div className="api-jawaban-head">
            <span className={`api-status ${kelasStatus}`} data-testid="api-status">
              {jawaban.status} {jawaban.statusText}
            </span>
            <span className="api-hint" data-testid="api-ms">
              {jawaban.ms} ms
            </span>
            {jawaban.dipotong && <span className="api-hint">({tr('truncated')})</span>}
          </div>

          {gqlErr.length > 0 && (
            <ul className="api-gql-err" data-testid="api-gql-errors">
              {gqlErr.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          <pre className="api-body-out" data-testid="api-body-out">
            {cantik}
          </pre>

          <details className="api-hdr-out">
            <summary>
              {tr('Response headers')} ({jawaban.headers.length})
            </summary>
            <pre>
              {jawaban.headers.map((h) => `${h.nama}: ${h.nilai}`).join('\n')}
            </pre>
          </details>
        </section>
      )}

      {riwayat.length > 0 && (
        <section className="api-riwayat" data-testid="api-history">
          <h2 className="api-seksi">{tr('History')}</h2>
          {riwayat.map((h, i) => (
            <button
              key={i}
              className="api-riwayat-item"
              data-testid={`api-history-${i}`}
              title={h.url}
              onClick={() => {
                setMethod(h.method === 'POST' && mode === 'graphql' ? 'GET' : h.method);
                setUrl(h.url);
              }}
            >
              <span className="api-riwayat-method">{h.method}</span>
              <span className="api-riwayat-url">{h.url}</span>
              <span className={`api-status ${h.status < 300 ? 'is-ok' : 'is-err'}`}>{h.status}</span>
              <span className="api-hint">{h.ms} ms</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
