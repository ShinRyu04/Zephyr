// DebugView.tsx — sidebar Run & Debug (fase 22).
//
// Lima section yang bisa dilipat (BREAKPOINTS, CALL STACK, VARIABLES, WATCH,
// LOADED SCRIPTS) + dropdown konfigurasi & tombol Start/Restart/Stop di atas.
//
// Semua warna dari CSS variable (AGENTS.md §4). Ikon = bentuk literal, bukan
// garis memancar (preferensi user: gear = gerigi sungguhan).

import { useEffect, useState } from 'react';
import { useDebug, type Variable } from '../../lib/debugStore';
import { useStore } from '../../lib/store';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/** Section yang bisa dilipat. */
function Section({
  id,
  judul,
  jml,
  children,
  awalTerbuka = true,
}: {
  id: string;
  judul: string;
  jml?: number;
  children: React.ReactNode;
  awalTerbuka?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(awalTerbuka);
  return (
    <div className="dbg-sec" data-testid={`dbg-sec-${id}`} data-terbuka={terbuka}>
      <button
        className="dbg-sec-head"
        aria-expanded={terbuka}
        data-testid={`dbg-toggle-${id}`}
        onClick={() => setTerbuka((v) => !v)}
      >
        <span className="dbg-caret">{terbuka ? '▾' : '▸'}</span>
        {judul}
        {jml != null && jml > 0 && <span className="dbg-count">{jml}</span>}
      </button>
      {terbuka && <div className="dbg-sec-body">{children}</div>}
    </div>
  );
}

/** Satu baris variabel; bisa di-expand kalau punya variablesReference. */
function BarisVar({ v, depth }: { v: Variable; depth: number }) {
  const [terbuka, setTerbuka] = useState(false);
  const anak = useDebug((s) => s.variables[v.variablesReference]);
  const expandVariable = useDebug((s) => s.expandVariable);
  const setVariable = useDebug((s) => s.setVariable);
  const caps = useDebug((s) => s.caps);
  const [edit, setEdit] = useState<string | null>(null);
  const bisaExpand = v.variablesReference > 0;
  const bisaSet = Boolean(caps.supportsSetVariable);

  return (
    <>
      <div className="dbg-var" style={{ paddingLeft: 8 + depth * 12 }} data-testid="dbg-var">
        {bisaExpand ? (
          <button
            className="dbg-caret-btn"
            aria-expanded={terbuka}
            title={terbuka ? 'Lipat' : 'Buka'}
            onClick={() => {
              const next = !terbuka;
              setTerbuka(next);
              if (next) void expandVariable(v.variablesReference);
            }}
          >
            {terbuka ? '▾' : '▸'}
          </button>
        ) : (
          <span className="dbg-caret-btn" aria-hidden="true" />
        )}
        <span className="dbg-var-nama" title={v.type}>
          {v.name}
        </span>
        {edit == null ? (
          <button
            className="dbg-var-nilai"
            title={
              bisaSet
                ? 'Klik untuk mengubah nilai'
                : 'Adapter ini tidak mendukung Set Value'
            }
            data-testid="dbg-var-nilai"
            onClick={() => bisaSet && setEdit(v.value)}
          >
            {v.value}
          </button>
        ) : (
          <input
            className="dbg-var-input"
            data-testid="dbg-var-input"
            autoFocus
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void setVariable(v.variablesReference || 0, v.name, edit);
                setEdit(null);
              } else if (e.key === 'Escape') setEdit(null);
            }}
            onBlur={() => setEdit(null)}
          />
        )}
        <button
          className="dbg-var-copy"
          title="Salin nilai"
          data-testid="dbg-var-copy"
          onClick={() => void navigator.clipboard?.writeText(v.value).catch(() => {})}
        >
          ⧉
        </button>
      </div>
      {terbuka &&
        (anak ?? []).map((c, i) => (
          <BarisVar key={`${c.name}-${i}`} v={c} depth={depth + 1} />
        ))}
    </>
  );
}

export default function DebugView() {
  const workspace = useStore((s) => s.workspace);
  const launch = useDebug((s) => s.launch);
  const adapters = useDebug((s) => s.adapters);
  const configTerpilih = useDebug((s) => s.configTerpilih);
  const state = useDebug((s) => s.state);
  const alasanStop = useDebug((s) => s.alasanStop);
  const error = useDebug((s) => s.error);
  const breakpoints = useDebug((s) => s.breakpoints);
  const frames = useDebug((s) => s.frames);
  const frameTerpilih = useDebug((s) => s.frameTerpilih);
  const scopes = useDebug((s) => s.scopes);
  const variables = useDebug((s) => s.variables);
  const watch = useDebug((s) => s.watch);
  const loadedSources = useDebug((s) => s.loadedSources);

  const muatLaunch = useDebug((s) => s.muatLaunch);
  const muatAdapters = useDebug((s) => s.muatAdapters);
  const pilihConfig = useDebug((s) => s.pilihConfig);
  const start = useDebug((s) => s.start);
  const stop = useDebug((s) => s.stop);
  const restart = useDebug((s) => s.restart);
  const pilihFrame = useDebug((s) => s.pilihFrame);
  const expandVariable = useDebug((s) => s.expandVariable);
  const hapusBreakpoint = useDebug((s) => s.hapusBreakpoint);
  const hapusSemuaBreakpoint = useDebug((s) => s.hapusSemuaBreakpoint);
  const tambahWatch = useDebug((s) => s.tambahWatch);
  const hapusWatch = useDebug((s) => s.hapusWatch);

  const [watchBaru, setWatchBaru] = useState('');

  useEffect(() => {
    void muatLaunch();
    void muatAdapters();
  }, [muatLaunch, muatAdapters, workspace]);

  const aktif = state !== 'inactive';
  const paused = state === 'stopped';
  const adapterKurang = adapters.filter((a) => a.missing);

  return (
    <div className="side-panel dbg-root" data-testid="debug-view">
      <div className="side-section">
        <div className="side-title">Run &amp; Debug</div>

        {!workspace && <p className="side-muted">Buka folder dulu untuk debug.</p>}

        <div className="dbg-bar">
          <select
            className="dbg-select"
            aria-label="Konfigurasi debug"
            data-testid="dbg-config"
            value={configTerpilih}
            disabled={aktif}
            onChange={(e) => pilihConfig(e.target.value)}
          >
            {(launch?.configurations ?? []).length === 0 ? (
              <option value="">(tidak ada launch.json)</option>
            ) : (
              (launch?.configurations ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))
            )}
          </select>

          {!aktif ? (
            <button
              className="dbg-btn is-start"
              title="Start Debugging (F5)"
              data-testid="dbg-start"
              disabled={!configTerpilih}
              onClick={() => void start()}
            >
              ▶
            </button>
          ) : (
            <>
              <button
                className="dbg-btn"
                title="Restart (Ctrl+Shift+F5)"
                data-testid="dbg-restart"
                onClick={() => void restart()}
              >
                ⟳
              </button>
              <button
                className="dbg-btn is-stop"
                title="Stop (Shift+F5)"
                data-testid="dbg-stop"
                onClick={() => void stop()}
              >
                ■
              </button>
            </>
          )}
        </div>

        <div className="dbg-status" data-testid="dbg-status" data-state={state}>
          {state === 'inactive' && 'tidak aktif'}
          {state === 'starting' && 'menyiapkan adapter…'}
          {state === 'running' && 'berjalan'}
          {paused && `berhenti (${alasanStop})`}
        </div>

        {error && (
          <p className="dbg-error" data-testid="dbg-error">
            {error}
          </p>
        )}

        {/* Adapter yang belum terpasang: instruksi install, bukan diam (brief V5). */}
        {adapterKurang.length > 0 && (
          <div className="dbg-hint" data-testid="dbg-adapter-hint">
            {adapterKurang.map((a) => (
              <p key={a.id} data-testid={`dbg-missing-${a.id}`}>
                <b>{a.id}</b>: {a.missing}
              </p>
            ))}
          </div>
        )}

        {launch && launch.invalid.length > 0 && (
          <div className="dbg-hint" data-testid="dbg-invalid">
            {launch.invalid.map((i) => (
              <p key={i.index}>
                #{i.index} {i.name || '(tanpa nama)'}: {i.reason}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="dbg-sections">
        <Section id="bp" judul="BREAKPOINTS" jml={breakpoints.length}>
          {breakpoints.length === 0 ? (
            <p className="side-muted dbg-kosong">Klik gutter editor untuk memasang breakpoint.</p>
          ) : (
            breakpoints.map((b) => (
              <div className="dbg-bp" data-testid="dbg-bp" key={`${b.path}:${b.line}`}>
                <span
                  className={`dbg-bp-dot${b.verified ? ' is-verified' : ''}`}
                  title={b.verified ? 'diverifikasi adapter' : 'belum diverifikasi'}
                  data-testid="dbg-bp-dot"
                >
                  {b.verified ? '●' : '○'}
                </span>
                <button
                  className="dbg-bp-nama"
                  title={`${b.path}:${b.line}`}
                  onClick={() => {
                    void useStore
                      .getState()
                      .openPath(b.path)
                      .then(async () => {
                        const { revealPosition } = await import('../../lib/editorRegistry');
                        revealPosition(b.line, 1);
                      });
                  }}
                >
                  {baseOf(b.path)} <span className="dbg-bp-line">{b.line}</span>
                </button>
                <button
                  className="dbg-x"
                  title="Hapus breakpoint"
                  data-testid="dbg-bp-hapus"
                  onClick={() => void hapusBreakpoint(b.path, b.line)}
                >
                  ×
                </button>
              </div>
            ))
          )}
          {breakpoints.length > 0 && (
            <button
              className="dbg-link"
              data-testid="dbg-bp-hapus-semua"
              onClick={() => void hapusSemuaBreakpoint()}
            >
              hapus semua
            </button>
          )}
        </Section>

        <Section id="stack" judul="CALL STACK" jml={frames.length}>
          {frames.length === 0 ? (
            <p className="side-muted dbg-kosong">
              {aktif ? 'Program berjalan — belum berhenti.' : 'Belum ada sesi.'}
            </p>
          ) : (
            frames.map((f) => (
              <button
                className={`dbg-frame${frameTerpilih === f.id ? ' is-active' : ''}`}
                data-testid="dbg-frame"
                data-frame-id={f.id}
                key={f.id}
                title={`${f.path}:${f.line}:${f.column}`}
                onClick={() => void pilihFrame(f.id)}
              >
                <span className="dbg-frame-nama">{f.name}</span>
                <span className="dbg-frame-lok">
                  {baseOf(f.path)}:{f.line}
                </span>
              </button>
            ))
          )}
        </Section>

        <Section id="vars" judul="VARIABLES" jml={scopes.length}>
          {scopes.length === 0 ? (
            <p className="side-muted dbg-kosong">Tersedia saat program berhenti.</p>
          ) : (
            scopes.map((sc) => (
              <div className="dbg-scope" key={sc.variablesReference} data-testid="dbg-scope">
                <button
                  className="dbg-scope-head"
                  data-testid="dbg-scope-head"
                  onClick={() => void expandVariable(sc.variablesReference)}
                >
                  {sc.name}
                  {sc.expensive && <span className="dbg-mahal">(besar)</span>}
                </button>
                {(variables[sc.variablesReference] ?? []).map((v, i) => (
                  <BarisVar key={`${v.name}-${i}`} v={v} depth={1} />
                ))}
              </div>
            ))
          )}
        </Section>

        <Section id="watch" judul="WATCH" jml={watch.length}>
          <div className="dbg-watch-add">
            <input
              className="dbg-watch-input"
              data-testid="dbg-watch-input"
              placeholder="Ekspresi watch…"
              value={watchBaru}
              onChange={(e) => setWatchBaru(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && watchBaru.trim()) {
                  void tambahWatch(watchBaru);
                  setWatchBaru('');
                }
              }}
            />
          </div>
          {watch.map((w) => (
            <div className="dbg-watch" data-testid="dbg-watch" key={w.expr}>
              <span className="dbg-watch-expr">{w.expr}</span>
              <span className={`dbg-watch-nilai${w.error ? ' is-error' : ''}`}>{w.value}</span>
              <button className="dbg-x" title="Hapus" onClick={() => hapusWatch(w.expr)}>
                ×
              </button>
            </div>
          ))}
        </Section>

        <Section id="scripts" judul="LOADED SCRIPTS" jml={loadedSources.length} awalTerbuka={false}>
          {loadedSources.length === 0 ? (
            <p className="side-muted dbg-kosong">
              Tersedia bila adapter mendukung loadedSources.
            </p>
          ) : (
            loadedSources.map((s) => (
              <button
                className="dbg-src"
                data-testid="dbg-src"
                key={s.path || s.name}
                title={s.path}
                onClick={() => s.path && void useStore.getState().openPath(s.path)}
              >
                {s.name || baseOf(s.path)}
              </button>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
