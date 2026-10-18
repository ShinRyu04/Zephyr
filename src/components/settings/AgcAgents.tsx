/*
 * Agents — the TRAE-shaped page inside Agent Customizations.
 *
 * WHY a new file rather than another block inside `AgcSections.tsx`: that file
 * is already 2000+ lines and holds six unrelated panes. The Agents page has its
 * own three-state flow (list -> details -> editor) and its own layout, and
 * bolting it onto the existing file would have made both harder to read.
 *
 * The shape, taken from the reference the reader supplied:
 *
 *   Agents                              [+ Create]
 *   Custom Agents
 *     (empty: "No custom agents available. Create")
 *   Built-In Agents
 *     Chat    Chat about your codebase                       [⋮]
 *     Agent   End-to-end execution of development tasks       [⋮]
 *
 * Clicking a row's `⋮` opens "View Details", which shows the tools that agent
 * may use. Clicking Create opens the editor: avatar, name, prompt, delegation
 * fields, and the tool checklist.
 *
 * The data is NOT invented here: custom agents are `useSubagentCustom` (the
 * same list the orchestrator reads), and the two built-ins are the two modes the
 * app already ships (`agentMode`). This page is a face on existing state, not a
 * second source of truth.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useSubagentCustom, kosongkanSubagent, type SubagentCustom, type AlatId } from '../../lib/subagentCustom';
import { ikonSubagent, IKON_SUBAGENT } from '../../lib/subagentIcons';

/* ── Tool labels, in the words the reader sees ──────────────────────────────
 *
 * The stored ids are tool names (`read_file`, `bash_run`); the page shows what
 * the tool DOES. Keeping the mapping here rather than in the store means a new
 * tool appears in the checklist as soon as it is added below, and a tool that is
 * removed from the app cannot leave a dead row behind.
 */
const ALAT_TAMPIL: { id: AlatId; label: string; ikon: string }[] = [
  { id: 'read_file', label: 'Read', ikon: 'doc' },
  { id: 'multi_edit', label: 'Edit', ikon: 'wrench' },
  { id: 'bash_run', label: 'Terminal', ikon: 'terminal' },
  { id: 'browser', label: 'Preview', ikon: 'eye' },
  { id: 'web_search', label: 'Web search', ikon: 'globe' },
];

/* The two built-in agents, described in the same words the reference uses. */
const BAWAAN = [
  {
    id: 'chat',
    nama: 'Chat',
    deskripsi: 'Chat about your codebase',
    ikon: 'robot',
    alat: ['read_file', 'browser', 'web_search'] as AlatId[],
  },
  {
    id: 'agent',
    nama: 'Agent',
    deskripsi: 'End-to-end execution of development tasks, efficiently',
    ikon: 'robot',
    alat: ['read_file', 'multi_edit', 'bash_run', 'browser', 'web_search'] as AlatId[],
  },
];

type Tampilan = { jenis: 'daftar' } | { jenis: 'detail'; id: string } | { jenis: 'sunting'; id: string | null };

export default function AgcAgents() {
  const tr = useT();
  const daftar = useSubagentCustom((s) => s.daftar);
  const muat = useSubagentCustom((s) => s.muat);
  const simpan = useSubagentCustom((s) => s.simpan);
  const hapus = useSubagentCustom((s) => s.hapus);
  const setAktif = useSubagentCustom((s) => s.setAktif);

  const [tampilan, setTampilan] = useState<Tampilan>({ jenis: 'daftar' });
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    muat();
  }, [muat]);

  /* ── Editor state ─────────────────────────────────────────────────────── */
  const [draft, setDraft] = useState<Omit<SubagentCustom, 'id'>>(kosongkanSubagent);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const bukaEditor = (id: string | null) => {
    setGalat(null);
    if (id) {
      const ada = daftar.find((d) => d.id === id);
      if (ada) {
        const { id: _abaikan, ...sisa } = ada;
        setDraft(sisa);
      }
    } else {
      setDraft(kosongkanSubagent());
    }
    setTampilan({ jenis: 'sunting', id });
  };

  const simpanDraft = async () => {
    if (!draft.nama.trim()) {
      setGalat(tr('A name is required.'));
      return;
    }
    setSibuk(true);
    try {
      await simpan(draft);
      setTampilan({ jenis: 'daftar' });
    } catch (e) {
      setGalat(String(e));
    } finally {
      setSibuk(false);
    }
  };

  /* The agent shown by the details view: a built-in or a custom one. */
  const detail = useMemo(() => {
    if (tampilan.jenis !== 'detail') return null;
    const b = BAWAAN.find((x) => x.id === tampilan.id);
    if (b) return { ...b, custom: false as const };
    const c = daftar.find((x) => x.id === tampilan.id);
    if (!c) return null;
    return {
      id: c.id,
      nama: c.nama,
      deskripsi: c.deskripsi,
      ikon: c.ikon,
      alat: c.alat,
      custom: true as const,
      bisaDipanggil: c.bisaDipanggil,
      idInggris: c.idInggris,
      kapanDipanggil: c.kapanDipanggil,
    };
  }, [tampilan, daftar]);

  /* ── List ─────────────────────────────────────────────────────────────── */
  if (tampilan.jenis === 'daftar') {
    return (
      <div className="agc-pane agx-pane">
        <div className="agx-head">
          <h2 className="agc-pane-title">
            {tr('Agents')}{' '}
            <span className="agx-tanya" title={tr('An agent is a reusable role with its own prompt and tools.')}>
              ?
            </span>
          </h2>
          <button
            type="button"
            className="agx-btn-utama"
            data-testid="agx-create"
            onClick={() => bukaEditor(null)}
          >
            + {tr('Create')}
          </button>
        </div>

        <h3 className="agx-seksi">{tr('Custom Agents')}</h3>
        {daftar.length === 0 ? (
          <div className="agx-kosong" data-testid="agx-kosong">
            {tr('No custom agents available.')}{' '}
            <button type="button" className="agx-tautan" onClick={() => bukaEditor(null)}>
              {tr('Create')}
            </button>
          </div>
        ) : (
          <div className="agx-daftar" data-testid="agx-custom">
            {daftar.map((a) => (
              <BarisAgen
                key={a.id}
                nama={a.nama}
                deskripsi={a.deskripsi}
                ikon={a.ikon}
                aktif={a.aktif}
                menuBuka={menu === a.id}
                onMenu={() => setMenu(menu === a.id ? null : a.id)}
                onDetail={() => {
                  setMenu(null);
                  setTampilan({ jenis: 'detail', id: a.id });
                }}
                onSunting={() => {
                  setMenu(null);
                  bukaEditor(a.id);
                }}
                onHapus={() => {
                  setMenu(null);
                  void hapus(a.id);
                }}
                onToggle={(v) => void setAktif(a.id, v)}
                tr={tr}
              />
            ))}
          </div>
        )}

        <h3 className="agx-seksi">{tr('Built-In Agents')}</h3>
        <div className="agx-daftar" data-testid="agx-bawaan">
          {BAWAAN.map((a) => (
            <BarisAgen
              key={a.id}
              nama={a.nama}
              deskripsi={a.deskripsi}
              ikon={a.ikon}
              aktif
              menuBuka={menu === `b-${a.id}`}
              onMenu={() => setMenu(menu === `b-${a.id}` ? null : `b-${a.id}`)}
              onDetail={() => {
                setMenu(null);
                setTampilan({ jenis: 'detail', id: a.id });
              }}
              tr={tr}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── Details ──────────────────────────────────────────────────────────── */
  if (tampilan.jenis === 'detail') {
    if (!detail) {
      return (
        <div className="agc-pane agx-pane">
          <button type="button" className="agx-kembali" onClick={() => setTampilan({ jenis: 'daftar' })}>
            ← {tr('Agents')}
          </button>
          <p className="agc-pane-desc">{tr('That agent no longer exists.')}</p>
        </div>
      );
    }
    return (
      <div className="agc-pane agx-pane" data-testid="agx-detail">
        <button type="button" className="agx-kembali" onClick={() => setTampilan({ jenis: 'daftar' })}>
          ← {tr('Agents')}
        </button>

        <div className="agx-detail-head">
          <span className="agx-avatar" aria-hidden="true">
            <AiIkon name="robot" size={22} />
          </span>
          <div>
            <h2 className="agc-pane-title" style={{ marginBottom: 2 }}>
              {detail.nama}
            </h2>
            <p className="agc-pane-desc" style={{ marginBottom: 0 }}>
              {detail.deskripsi}
            </p>
          </div>
        </div>

        {detail.custom && detail.bisaDipanggil && (
          <>
            <h3 className="agx-seksi">{tr('Callable Agents')}</h3>
            <div className="agx-kotak">
              <div className="agx-tool-baris">
                <span className="agx-tool-ikon">
                  <AiIkon name="search" size={13} />
                </span>
                <span className="agx-tool-nama">{detail.idInggris || detail.nama}</span>
                {detail.kapanDipanggil && (
                  <span className="agx-tool-ket">{detail.kapanDipanggil}</span>
                )}
              </div>
            </div>
          </>
        )}

        <h3 className="agx-seksi">{tr('Tools')}</h3>
        <div className="agx-kotak">
          <div className="agx-kotak-head">{tr('MCP')}</div>
          <div className="agx-kotak-isi">
            <span className="agx-muted">{tr('No MCP servers configured for this agent.')}</span>
          </div>
          <div className="agx-kotak-head">{tr('Built-In')}</div>
          <div className="agx-kotak-isi">
            {detail.alat.length === 0 ? (
              <span className="agx-muted">{tr('No tools selected.')}</span>
            ) : (
              detail.alat.map((id) => {
                const info = ALAT_TAMPIL.find((x) => x.id === id);
                if (!info) return null;
                return (
                  <div className="agx-tool-baris" key={id} data-testid={`agx-detail-alat-${id}`}>
                    <span className="agx-tool-ikon">
                      <AiIkon name={info.ikon as never} size={13} />
                    </span>
                    <span className="agx-tool-nama">{tr(info.label)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Editor ───────────────────────────────────────────────────────────── */
  const idSunting = tampilan.id;
  return (
    <div className="agc-pane agx-pane" data-testid="agx-editor">
      <div className="agx-head">
        <button type="button" className="agx-kembali" onClick={() => setTampilan({ jenis: 'daftar' })}>
          ← {tr('Agents')}
        </button>
        <button type="button" className="agx-btn-utama" data-testid="agx-smart">
          ✨ {tr('Smart Generate')}
        </button>
      </div>

      <h2 className="agc-pane-title">{idSunting ? tr('Edit Agent') : tr('Create Agent')}</h2>

      <div className="agx-avatar-baris">
        <span className="agx-avatar agx-avatar-besar" aria-hidden="true">
          <AiIkon name={(draft.ikon as never) ?? 'robot'} size={30} />
        </span>
        <div className="agx-avatar-pilih" data-testid="agx-ikon-pilih">
          {IKON_SUBAGENT.slice(0, 10).map((ik) => (
            <button
              key={ik.id}
              type="button"
              className={`agx-ikon-pil${draft.ikon === ik.id ? ' is-on' : ''}`}
              title={ik.id}
              onClick={() => setDraft({ ...draft, ikon: ik.id })}
            >
              <AiIkon name={ikonSubagent(ik.id).id as never} size={13} />
            </button>
          ))}
        </div>
      </div>

      <label className="agx-field">
        <span className="agx-field-label">
          {tr('Name')} <b>*</b>
          <em>
            {draft.nama.length}/20
          </em>
        </span>
        <input
          data-testid="agx-nama"
          maxLength={20}
          value={draft.nama}
          placeholder={tr('Name your agent')}
          onChange={(e) => setDraft({ ...draft, nama: e.target.value })}
        />
      </label>

      <label className="agx-field">
        <span className="agx-field-label">
          {tr('Prompt')}
          <em>{draft.prompt.length}/10000</em>
        </span>
        <textarea
          data-testid="agx-prompt"
          rows={5}
          maxLength={10000}
          value={draft.prompt}
          placeholder={tr('Describe the role, the tone, and what this agent should always do.')}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        />
      </label>

      <div className="agx-field">
        <span className="agx-field-label">{tr('Callable by other agents')}</span>
        <label className="agx-toggle">
          <input
            type="checkbox"
            data-testid="agx-bisa-dipanggil"
            checked={Boolean(draft.bisaDipanggil)}
            onChange={(e) => setDraft({ ...draft, bisaDipanggil: e.target.checked })}
          />
          <span>{tr('Other agents may delegate tasks to this one.')}</span>
        </label>
      </div>

      {draft.bisaDipanggil && (
        <>
          <label className="agx-field">
            <span className="agx-field-label">
              {tr('English Identifier')} <b>*</b>
              <em>{(draft.idInggris ?? '').length}/50</em>
            </span>
            <input
              data-testid="agx-id-inggris"
              maxLength={50}
              value={draft.idInggris ?? ''}
              placeholder="project-analyzer"
              onChange={(e) => setDraft({ ...draft, idInggris: e.target.value })}
            />
          </label>
          <label className="agx-field">
            <span className="agx-field-label">
              {tr('When to Call')} <b>*</b>
              <em>{(draft.kapanDipanggil ?? '').length}/5000</em>
            </span>
            <textarea
              data-testid="agx-kapan"
              rows={3}
              maxLength={5000}
              value={draft.kapanDipanggil ?? ''}
              placeholder={tr('Describe the situations in which another agent should call this one.')}
              onChange={(e) => setDraft({ ...draft, kapanDipanggil: e.target.value })}
            />
          </label>
        </>
      )}

      <h3 className="agx-seksi">{tr('Tools')}</h3>
      <div className="agx-kotak">
        <div className="agx-kotak-head">
          {tr('MCP')}
          <span className="agx-muted">{tr('No MCP servers')}</span>
        </div>
        <div className="agx-kotak-head">{tr('Built-In')}</div>
        <div className="agx-kotak-isi">
          {ALAT_TAMPIL.map((a) => {
            const aktif = draft.alat.includes(a.id);
            return (
              <label className="agx-tool-baris agx-tool-pil" key={a.id}>
                <input
                  type="checkbox"
                  data-testid={`agx-alat-${a.id}`}
                  checked={aktif}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alat: e.target.checked
                        ? [...draft.alat, a.id]
                        : draft.alat.filter((x) => x !== a.id),
                    })
                  }
                />
                <span className="agx-tool-ikon">
                  <AiIkon name={a.ikon as never} size={13} />
                </span>
                <span className="agx-tool-nama">{tr(a.label)}</span>
              </label>
            );
          })}
        </div>
      </div>

      {galat && (
        <p className="agx-galat" data-testid="agx-galat">
          {galat}
        </p>
      )}

      <div className="agx-aksi">
        <button
          type="button"
          className="agx-btn-utama"
          data-testid="agx-simpan"
          disabled={sibuk || !draft.nama.trim()}
          onClick={() => void simpanDraft()}
        >
          {sibuk ? tr('Saving…') : idSunting ? tr('Save') : tr('Create')}
        </button>
        <button
          type="button"
          className="agx-btn-batal"
          data-testid="agx-batal"
          onClick={() => setTampilan({ jenis: 'daftar' })}
        >
          {tr('Cancel')}
        </button>
      </div>
    </div>
  );
}

/* ── One row in the list ──────────────────────────────────────────────────── */
function BarisAgen({
  nama,
  deskripsi,
  ikon,
  aktif,
  menuBuka,
  onMenu,
  onDetail,
  onSunting,
  onHapus,
  onToggle,
  tr,
}: {
  nama: string;
  deskripsi: string;
  ikon: string;
  aktif: boolean;
  menuBuka: boolean;
  onMenu: () => void;
  onDetail: () => void;
  onSunting?: () => void;
  onHapus?: () => void;
  onToggle?: (v: boolean) => void;
  tr: (s: string) => string;
}) {
  return (
    <div className={`agx-baris${aktif ? '' : ' is-mati'}`} data-testid={`agx-baris-${nama}`}>
      <span className="agx-avatar" aria-hidden="true">
        <AiIkon name={(ikon as never) ?? 'robot'} size={17} />
      </span>
      <div className="agx-baris-teks">
        <span className="agx-baris-nama">{nama}</span>
        <span className="agx-baris-desk">{deskripsi}</span>
      </div>
      <div className="agx-baris-aksi">
        {onToggle && (
          <label className="agx-switch" title={tr('Enabled')}>
            <input type="checkbox" checked={aktif} onChange={(e) => onToggle(e.target.checked)} />
            <span />
          </label>
        )}
        <div className="agx-menu-wrap">
          <button
            type="button"
            className="agx-menu-btn"
            aria-label={tr('More')}
            data-testid={`agx-menu-${nama}`}
            onClick={onMenu}
          >
            ⋮
          </button>
          {menuBuka && (
            <div className="agx-menu" role="menu">
              <button type="button" role="menuitem" data-testid="agx-menu-detail" onClick={onDetail}>
                {tr('View Details')}
              </button>
              {onSunting && (
                <button type="button" role="menuitem" onClick={onSunting}>
                  {tr('Edit')}
                </button>
              )}
              {onHapus && (
                <button type="button" role="menuitem" className="is-hapus" onClick={onHapus}>
                  {tr('Delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
