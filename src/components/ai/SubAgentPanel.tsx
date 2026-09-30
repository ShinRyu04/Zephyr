import { useEffect, useState } from 'react';
import { useSubAgent, batasParalel, type SubAgent, type SubStep } from '../../lib/subagentStore';
import { useStore } from '../../lib/store';
import { infoAksi, sasaranAksi, KELAS_JENIS } from '../../lib/labelAksi';
import { infoPeran } from '../../lib/subagentRoles';
import { pathIkonPeran } from '../../lib/peranIcons';
import { findModel } from '../../lib/modelCatalog';
import ModelMenu from './ModelMenu';
import { useT, useTf } from '../../lib/i18n';
import SubSummary from './SubSummary';

/*
 * The robot mark for an agent row.
 *
 * A head with an antenna and two eyes. It is drawn once and coloured by CSS
 * from the row's status, so the same glyph means "working" or "done" depending
 * on where it sits — see .sub-robot in ai-icons.css. The eyes and antenna only
 * animate while the agent runs.
 */
function Robot({ status }: { status: SubAgent['status'] }) {
  return (
    <span className={`sub-robot is-${status}`} aria-hidden="true">
      {/*
       * Drawn edge to edge on the 16px grid.
       *
       * The previous art occupied x=2.5..12 and y=2.6..12 — about 60% of the
       * box — so a 26px container still rendered a ~15px robot. The mark is the
       * row's face and its status light, so it fills the grid it is given; the
       * CSS decides the final size and nothing is lost to padding.
       */}
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Antenna */}
        <path className="robot-antenna" d="M8 3.4V1.6" />
        <circle className="robot-antenna" cx="8" cy="1.3" r="1" fill="currentColor" stroke="none" />
        {/* Head */}
        <rect x="0.9" y="3.4" width="14.2" height="11.2" rx="2.6" />
        {/* Eyes */}
        <circle className="robot-eye" cx="5.6" cy="8.2" r="1.5" fill="currentColor" stroke="none" />
        <circle className="robot-eye" cx="10.4" cy="8.2" r="1.5" fill="currentColor" stroke="none" />
        {/* Mouth */}
        <path d="M6.4 11.4h3.2" />
      </svg>
    </span>
  );
}

/** Compact duration: "16.8s" under a minute, "2m 18s" above it. */
function durasiRingkas(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function Langkah({ l }: { l: SubStep }) {
  const tr = useT();
  const [buka, setBuka] = useState(false);

  if (l.kind === 'pikir') {
    const teks = l.teks ?? '';
    const panjang = teks.length > 180;
    return (
      <li className="sub-step is-pikir" data-step="pikir">
        <button
          className="sub-pikir-toggle"
          data-testid="sub-reasoned-toggle"
          aria-expanded={panjang ? buka : true}
          onClick={() => panjang && setBuka((v) => !v)}
        >
          <span className="sub-step-label">{tr('Reasoned')}</span>
          {panjang && <span className="sub-caret">{buka ? '▾' : '▸'}</span>}
        </button>
        {(!panjang || buka) && <p className="sub-step-teks">{teks}</p>}
        {panjang && !buka && <p className="sub-step-teks is-ringkas">{teks.slice(0, 150)}…</p>}
      </li>
    );
  }

  const info = infoAksi(l.nama);
  const sasaran = sasaranAksi(l.args);

  return (
    <li
      className={`sub-step is-tool ${KELAS_JENIS[info.jenis]}${l.ok === false ? ' is-err' : ''}`}
      data-step="tool"
      data-aksi={info.label}
      data-jenis={info.jenis}
    >
      <span className="sub-aksi-ikon" aria-hidden="true">
        {info.ikon}
      </span>
      <span className="sub-aksi-label">{info.label}</span>
      {sasaran && (
        <span className="sub-aksi-sasaran" title={sasaran}>
          {sasaran}
        </span>
      )}
      {l.ok === false && <span className="sub-aksi-gagal">{tr('failed')}</span>}
      {l.hasil && (
        <details className="sub-aksi-hasil">
          <summary>{tr('result')}</summary>
          <pre>{l.hasil}</pre>
        </details>
      )}
    </li>
  );
}

/**
 * One agent on the timeline.
 *
 * Layout: the node column (number + connector) is fixed on the left and the
 * row content is a grid with aligned columns — name, status, time — so four
 * agents can be compared by scanning down instead of reading each card.
 *
 * The row is compact by default and expands in place for the step list. Cards
 * used to be ~270px tall each, which meant a 250px panel showed one agent.
 */
function Baris({
  a,
  nomor,
  terakhir,
  modelMenu,
  setModelMenu,
  modelRect,
  setModelRect,
  gantiModel,
}: {
  a: SubAgent;
  nomor: number;
  terakhir: boolean;
  modelMenu: string | null;
  setModelMenu: (v: string | null) => void;
  modelRect: { left: number; top: number; bottom: number } | null;
  setModelRect: (v: { left: number; top: number; bottom: number } | null) => void;
  gantiModel: (id: string, model: string, provider: string) => void;
}) {
  const tr = useT();
  const tf = useTf();
  const batal = useSubAgent((s) => s.batal);
  const lanjutkan = useSubAgent((s) => s.lanjutkan);
  const ulangi = useSubAgent((s) => s.ulangi);
  const sibukGlobal = useSubAgent((s) => s.sibuk);

  const autoCollapse = useStore((s) => s.settings.subagent?.autoCollapse !== false);

  const [buka, setBuka] = useState(!autoCollapse);
  const [teksLanjut, setTeksLanjut] = useState('');

  const [, detak] = useState(0);

  useEffect(() => {
    if (a.status !== 'jalan') return;
    const t = setInterval(() => detak((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [a.status]);

  const kirimLanjutan = () => {
    const teks = teksLanjut.trim();
    if (!teks || sibukGlobal) return;
    void lanjutkan(a.id, teks).then((ok) => {
      if (ok) setTeksLanjut('');
    });
  };

  const ms = (a.selesai ?? Date.now()) - a.mulai;
  const hidup = a.status === 'jalan' || a.status === 'menunggu';
  const langkahTerakhir = a.langkah[a.langkah.length - 1];
  const nLangkah = a.langkah.length;
  const pr = infoPeran(a.peran);

  /*
   * The one line that says what the agent is doing right now. Falls back to the
   * task text so a queued agent is not blank.
   */
  const statusHidup = (() => {
    if (!langkahTerakhir) return a.status === 'menunggu' ? tr('Waiting for a slot') : tr('Preparing…');
    if (langkahTerakhir.kind === 'pikir') return tr('Thinking…');
    const info = infoAksi(langkahTerakhir.nama);
    const sasaran = sasaranAksi(langkahTerakhir.args);
    const namaFile = sasaran.split(/[/\\]/).pop() || sasaran;
    return `${info.label} ${namaFile}`.trim();
  })();

  /* The last finished step, shown as the row's second line for a done agent. */
  const langkahBeres = [...a.langkah].reverse().find((l) => l.kind === 'tool' && l.ok !== false);

  const barisKedua = (() => {
    if (hidup) return statusHidup;
    if (a.error) return a.error;
    if (a.hasil) return (a.hasil.split(String.fromCharCode(10)).find((l) => l.trim()) || '').trim();
    if (langkahBeres) {
      const info = infoAksi(langkahBeres.nama);
      const sasaran = sasaranAksi(langkahBeres.args);
      return `${info.label} ${sasaran}`.trim();
    }
    return '';
  })();

  return (
    <div
      className={`sub-baris is-${a.status}${terakhir ? ' is-akhir' : ''}`}
      data-testid={`sub-card-${a.id}`}
      data-status={a.status}
      data-nama={a.nama}
      data-nomor={nomor}
    >
      {/* ── Node column: number + the rail that links the agents ── */}
      <div className="sub-node-col" aria-hidden="true">
        <span className="sub-node" data-testid={`sub-node-${a.id}`} data-nomor={nomor}>
          {nomor}
        </span>
        {!terakhir && <span className="sub-rail" />}
      </div>

      {/* ── Content ── */}
      <div className="sub-isi">
        <div className="sub-head">
          {/* The robot replaces the bare status glyph: it carries the same
              state in its colour, and it gives the panel a face — every row is
              an agent, not a bullet point. */}
          <Robot status={a.status} />
          {/*
           * The task text is the row's headline, not a tooltip.
           *
           * "Comet" alone says nothing about what the agent is doing; the task
           * is the one thing a reader scans for when several run at once. The
           * agent name becomes a monospace chip in front of it, the way a tool
           * name is set apart from prose.
           */}
          <span className="sub-agent-chip" data-testid={`sub-nama-${a.id}`}>
            {a.nama}
          </span>
          <span className="sub-tugas" title={a.tugas}>
            {a.tugas}
          </span>
          {pr && (
            <span
              className={`sub-peran${pr.butuhTulis ? ' is-tulis' : ''}${
                a.customId ? ' is-kustom' : ''
              }`}
              data-testid={`sub-peran-${a.id}`}
              data-peran={a.peran}
              data-kustom={a.customId ?? undefined}
              title={a.customId ? (a.customNama ?? a.nama) : tr(pr.hint)}
            >
              {/*
               * A custom worker shows the robot and its author's name, not the
               * role mark.
               *
               * `peran` still points at the nearest built-in role because the
               * tool gate and the write badge are keyed on it, but that role's
               * silhouette is a claim about what the worker does — a magnifier
               * on a worker that only writes tests is actively misleading. The
               * robot says the one thing that is always true of it: it is an
               * agent the user defined.
               */}
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={pathIkonPeran(a.customId ? 'custom' : pr.ikon)} />
              </svg>
              {a.customId ? (a.customNama ?? a.nama) : tr(pr.label)}
            </span>
          )}

          <span className="sub-spacer" />

          {/*
            * Model badge, now a picker.
            *
            * It was a read-only chip: the model is resolved when the batch
            * launches, so changing it meant cancelling the batch and retyping
            * every task with a `@model` prefix. Clicking it opens the same
            * model list the spawn form uses, and the pin survives a retry or a
            * follow-up. A running agent keeps the model it started with; the
            * title says so.
            */}
          {(a.model || a.provider) && (
            <div className="sub-model-wrap">
              <button
                className="sub-model-badge"
                data-testid={`sub-model-badge-${a.id}`}
                data-model={a.model}
                data-provider={a.provider}
                aria-haspopup="listbox"
                aria-expanded={modelMenu === a.id}
                title={
                  hidup
                    ? tr('Model the subagent uses. A running agent keeps the model it started with.')
                    : tr('Model the subagent uses. Click to change it for the next run.')
                }
                onClick={(e) => {
                  if (modelMenu === a.id) {
                    setModelMenu(null);
                    return;
                  }
                  /*
                   * Measure before opening.
                   *
                   * The menu is `position: fixed` so no ancestor can clip it,
                   * which means it no longer inherits its position from the
                   * badge — the rect is read here and used as inline
                   * coordinates. `bottom` is preferred over `top` so a badge
                   * near the bottom of the window grows upward instead of
                   * running off the edge.
                   */
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setModelRect({ left: r.left, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4 });
                  setModelMenu(a.id);
                }}
              >
                {findModel(a.model, a.provider || undefined).label}
              </button>

              {/*
                * The shared model menu, not a local list.
                *
                * This picker was a flat column of labels with no provider
                * heading and no model mark; the chat header's version had both.
                * They now render the same component, so a model looks the same
                * wherever it is chosen.
                */}
              {modelMenu === a.id && (
                <ModelMenu
                  rect={modelRect}
                  nilai={{ provider: a.provider, model: a.model }}
                  pilih={(v) => gantiModel(a.id, v.model, v.provider)}
                  tutup={() => setModelMenu(null)}
                  pfx={`sub-model-${a.id}`}
                />
              )}
            </div>
          )}

          {!hidup && (
            <span
              className={`sub-verdict is-${a.verdict}`}
              data-testid={`sub-verdict-${a.id}`}
              data-verdict={a.verdict}
              title={
                a.verdict === 'terbukti'
                  ? tr('Every tool step succeeded')
                  : a.verdict === 'sebagian'
                    ? tr('Some tool steps failed — check the result')
                    : tr('No tool step succeeded — the result is unproven')
              }
            >
              {a.verdict === 'terbukti' ? '✓' : a.verdict === 'sebagian' ? '⚠' : '?'}
            </span>
          )}

          <span className={`sub-badge is-${a.status}`} data-testid={`sub-status-${a.id}`}>
            <span className="sub-badge-dot" aria-hidden="true" />
            {tr(a.status)}
          </span>

          {/* Time: fixed width + tabular figures so the column reads as a column. */}
          <span className="sub-waktu" data-testid={`sub-meta-${a.id}`}>
            {/* "1 steps" reads as a bug; the singular form is its own key. */}
            {tf(nLangkah === 1 ? '{n} step' : '{n} steps', { n: nLangkah })} ·{' '}
            {a.status === 'menunggu' ? '--' : durasiRingkas(ms)}
          </span>

          {hidup ? (
            <button
              className="sub-aksi-btn"
              data-testid={`sub-batal-${a.id}`}
              title={tr('Cancel this subagent')}
              onClick={() => batal(a.id)}
            >
              ✕
            </button>
          ) : (
            <button
              className="sub-aksi-btn"
              data-testid={`sub-ulang-${a.id}`}
              title={tr('Run this task again')}
              disabled={sibukGlobal}
              onClick={() => ulangi(a.id)}
            >
              ↻
            </button>
          )}
        </div>

        {/* Second line: what it is doing, or what it produced. */}
        {barisKedua && (
          <div className={`sub-ket is-${a.status}`} data-testid={`sub-now-${a.id}`} title={barisKedua}>
            <span className="sub-ket-mark" aria-hidden="true">
              {hidup ? '›' : a.error ? '✕' : '✓'}
            </span>
            <span className="sub-ket-teks">{barisKedua}</span>
          </div>
        )}

        {/* Steps: collapsed by default, expanded in place. */}
        {nLangkah > 0 && (
          <>
            <button
              className="sub-toggle"
              data-testid={`sub-toggle-${a.id}`}
              aria-expanded={buka}
              onClick={() => setBuka((v) => !v)}
            >
              <span className="sub-caret">{buka ? '▾' : '▸'}</span>
              {tf(nLangkah === 1 ? '{n} step' : '{n} steps', { n: nLangkah })}
            </button>
            {buka && (
              <ol className="sub-langkah" data-testid={`sub-langkah-${a.id}`}>
                {a.langkah.map((l, i) => (
                  <Langkah key={i} l={l} />
                ))}
              </ol>
            )}
          </>
        )}

        {/* Follow-up: only for a finished top-level agent with history. */}
        {(a.status === 'selesai' || a.status === 'gagal' || a.status === 'batal') &&
          (a.kedalaman ?? 0) === 0 &&
          !!a.riwayat?.length && (
            <div className="sub-lanjut" data-testid={`sub-lanjut-${a.id}`}>
              <input
                className="sub-lanjut-input"
                data-testid={`sub-lanjut-input-${a.id}`}
                placeholder={tr('Kirim pesan lanjutan…')}
                value={teksLanjut}
                disabled={sibukGlobal}
                onChange={(e) => setTeksLanjut(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    kirimLanjutan();
                  }
                }}
              />
              <button
                className="btn btn-sm"
                data-testid={`sub-lanjut-kirim-${a.id}`}
                disabled={sibukGlobal || !teksLanjut.trim()}
                onClick={() => kirimLanjutan()}
              >
                {tr('Subagent: kirim lanjutan')}
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

export default function SubAgentPanel({ polos = false }: { polos?: boolean } = {}) {
  const tr = useT();
  const tf = useTf();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const bersihkan = useSubAgent((s) => s.bersihkan);
  const gantiModel = useSubAgent((s) => s.gantiModel);

  /* Which row's model menu is open, if any, and where to draw it. */
  const [modelMenu, setModelMenu] = useState<string | null>(null);
  const [modelRect, setModelRect] = useState<{ left: number; top: number; bottom: number } | null>(null);

  /*
   * A click elsewhere closes the menu.
   *
   * Without this the list stayed open until the same badge was clicked again,
   * so scrolling the panel or pressing a row button left it floating over the
   * next agent's row.
   */
  useEffect(() => {
    if (!modelMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.sub-model-wrap')) return;
      setModelMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [modelMenu]);

  const showPanel = useStore((s) => s.settings.subagent?.showPanel !== false);
  if (!showPanel || agents.length === 0) return null;

  const jalan = agents.filter((a) => a.status === 'jalan').length;
  const antri = agents.filter((a) => a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;
  const total = agents.length;

  const judul = sibuk
    ? tf('{n} parallel tasks', { n: jalan + antri })
    : `${total} ${tr('subagent')} · ${beres} ${tr('done')}${gagal ? ` · ${gagal} ${tr('failed')}` : ''}`;

  return (
    <div className="sub-panel" data-testid="sub-panel">
      {!polos && (
        <div className="sub-bar">
          <span className="sub-judul" data-testid="sub-title">
            {judul}
          </span>
          <span className="sub-maks">{tf('max {n}', { n: batasParalel() })}</span>
          <span className="sub-spacer" />
          {sibuk ? (
            <button className="btn btn-sm" data-testid="sub-stop-all" onClick={batalSemua}>
              {tr('Stop all')}
            </button>
          ) : (
            <button className="btn btn-sm" data-testid="sub-clear" onClick={bersihkan}>
              {tr('Clear')}
            </button>
          )}
        </div>
      )}

      {/*
       * Segmented progress: one block per agent, coloured by its own status.
       *
       * A single bar filled to "done / total" was misleading — with four agents
       * where one finished and one failed it showed 25%, which says nothing
       * about the two still running. The segments show all four states at once.
       */}
      {total > 0 && (
        <div className="sub-progress" data-testid="sub-progress">
          <div className="sub-segmen" role="img" aria-label={tf('{a} done · {b} running · {c} waiting · {d} failed', { a: beres, b: jalan, c: antri, d: gagal })}>
            {agents.map((a) => (
              <span key={a.id} className={`sub-segmen-blok is-${a.status}`} title={a.nama} />
            ))}
          </div>
          <span className="sub-progress-label" data-testid="sub-progress-label">
            {beres}/{total}
          </span>
        </div>
      )}

      {/* Column headings: what the four fields below mean, so the rows can be
          compared by scanning down instead of reading each one. */}
      <div className="sub-tabel-head" aria-hidden="true">
        <span className="sub-th-nomor">#</span>
        <span className="sub-th-agent">{tr('Agent')}</span>
        <span className="sub-th-status">{tr('Status')}</span>
        <span className="sub-th-waktu">{tr('Time')}</span>
      </div>

      <div className="sub-timeline" data-testid="sub-grid">
        {agents.map((a, i) => (
          <Baris
              key={a.id}
              a={a}
              nomor={i + 1}
              terakhir={i === agents.length - 1}
              modelMenu={modelMenu}
              setModelMenu={setModelMenu}
              modelRect={modelRect}
              setModelRect={setModelRect}
              gantiModel={gantiModel}
            />
        ))}
      </div>

      {!polos && <SubSummary />}
    </div>
  );
}
