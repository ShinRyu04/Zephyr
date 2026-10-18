/*
 * Rules & Memories — the TRAE-shaped page inside Agent Customizations.
 *
 * Three blocks, in this order, because that is the order the reader reasons
 * about them:
 *
 *   1. IMPORT SETTINGS  - which files the agent should read from the project.
 *   2. RULES            - the rules themselves, Global vs Project, each one a
 *                         free-text document the reader writes.
 *   3. MEMORY (Beta)    - what the agent may remember across sessions.
 *
 * WHY RULES ARE FREE TEXT, not a list of toggles:
 *
 * The reference opens an editor when you press Create, and that is the right
 * shape - a rule is a SENTENCE the reader writes ("always use tabs in Rust"),
 * not a checkbox from a fixed menu. The previous version could only display a
 * single `customInstructions` string and had a Create button that did nothing.
 *
 * Rules are stored as instruction FILES through `useInstructions` (the same
 * store the Instructions section used), so a rule written here is a real file
 * on disk that the prompt builder reads - not a browser key.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useAgentExtras } from '../../lib/agentExtrasStore';
import { useInstructions } from '../../lib/instructionsStore';

/* The two context files the reference exposes. */
const BERKAS_KONTEKS = [
  {
    kunci: 'bacaAgentsMd' as const,
    nama: 'AGENTS.md',
    ket: 'Include AGENTS.md in context',
    detail: 'Repository-wide instructions at the workspace root, read on every turn.',
  },
  {
    kunci: 'bacaClaudeMd' as const,
    nama: 'CLAUDE.md',
    ket: 'Include CLAUDE.md in context',
    detail: 'Also reads CLAUDE.md and CLAUDE.local.md when they exist.',
  },
];

type Lingkup = 'global' | 'proyek';

export default function AgcRulesMemories() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const jumlahHook = useAgentExtras((s) => s.hooks.length);

  const daftarAturan = useInstructions((s) => s.daftar);
  const sibukAturan = useInstructions((s) => s.sibuk);
  const galatAturan = useInstructions((s) => s.galat);
  const muatAturan = useInstructions((s) => s.muat);
  const simpanAturan = useInstructions((s) => s.simpan);
  const hapusAturan = useInstructions((s) => s.hapus);
  const bersihkanGalatAturan = useInstructions((s) => s.bersihkanGalat);

  const [lingkup, setLingkup] = useState<Lingkup>('global');
  const [lingkupMemori, setLingkupMemori] = useState<Lingkup>('global');

  /*
   * The rule editor. `null` = closed. `''` as the name means "new rule": the
   * name field is empty and the reader types it, which is what makes Create a
   * genuine create rather than a rename of the one rule that already exists.
   */
  const [sunting, setSunting] = useState<{ nama: string; isi: string; baru: boolean } | null>(null);
  const [galatSunting, setGalatSunting] = useState<string | null>(null);

  useEffect(() => {
    void muatAturan();
  }, [muatAturan]);

  const agen = (settings.agents ?? {}) as Record<string, unknown>;
  const bacaAgents = agen.bacaAgentsMd === true;
  const bacaClaude = agen.bacaClaudeMd === true;
  const memoriNyala = agen.memoriAktif !== false;

  /* Rules in the selected scope. `scope` on disk is 'workspace' | 'global'. */
  const aturan = useMemo(() => {
    const scope = lingkup === 'global' ? 'global' : 'workspace';
    return daftarAturan.filter((a) => a.scope === scope);
  }, [daftarAturan, lingkup]);

  const simpan = (patch: Record<string, unknown>) => {
    void applySettings({ agents: { ...agen, ...patch } } as never);
  };

  const simpanSunting = async () => {
    if (!sunting) return;
    const nama = sunting.nama.trim();
    if (!nama) {
      setGalatSunting(tr('A name is required.'));
      return;
    }
    const ok = await simpanAturan({
      name: nama,
      description: sunting.isi.split('\n')[0]?.slice(0, 100) ?? '',
      applyTo: '**',
      body: sunting.isi,
      scope: lingkup === 'global' ? 'global' : 'workspace',
    });
    if (ok) {
      setSunting(null);
      setGalatSunting(null);
    } else {
      setGalatSunting(tr('Could not save the rule.'));
    }
  };

  return (
    <div className="agc-pane agx-pane" data-testid="agx-rules">
      <h2 className="agc-pane-title">
        {tr('Rules & Memories')}{' '}
        <span className="agx-tanya" title={tr('What the agent reads before it answers.')}>
          ?
        </span>
      </h2>
      <p className="agc-pane-desc">
        {tr('Control the context the agent loads, the rules it follows, and what it may remember.')}
      </p>

      {/* ── 1. Import settings ─────────────────────────────────────────── */}
      <h3 className="agx-seksi">{tr('Import Settings')}</h3>
      <div className="agx-kotak">
        <div className="agx-kotak-isi">
          {BERKAS_KONTEKS.map((b) => {
            const nyala = b.kunci === 'bacaAgentsMd' ? bacaAgents : bacaClaude;
            return (
              <label className="agx-tool-baris agx-tool-pil" key={b.kunci} data-testid={`agx-ctx-${b.nama}`}>
                <input
                  type="checkbox"
                  checked={nyala}
                  onChange={(e) => simpan({ [b.kunci]: e.target.checked })}
                />
                <span className="agx-tool-ikon">
                  <AiIkon name="doc" size={13} />
                </span>
                <span className="agx-baris-teks">
                  <span className="agx-baris-nama">{tr(b.ket)}</span>
                  <span className="agx-baris-desk">{tr(b.detail)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── 2. Rules ───────────────────────────────────────────────────── */}
      <div className="agx-seksi-baris">
        <h3 className="agx-seksi">{tr('Rules')}</h3>
        <div className="agx-seg" role="tablist" data-testid="agx-rules-tab">
          {(['global', 'proyek'] as Lingkup[]).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lingkup === l}
              className={`agx-seg-btn${lingkup === l ? ' is-on' : ''}`}
              data-testid={`agx-rules-${l}`}
              onClick={() => setLingkup(l)}
            >
              {l === 'global' ? tr('Global') : tr('Project')}
            </button>
          ))}
        </div>
      </div>

      {galatAturan && (
        <p className="agx-galat" data-testid="agx-rules-galat" role="alert">
          {galatAturan}
          <button type="button" className="agx-tautan" onClick={bersihkanGalatAturan}>
            {tr('Dismiss')}
          </button>
        </p>
      )}

      {aturan.length === 0 ? (
        <div className="agx-kosong" data-testid="agx-rules-kosong">
          <span className="agx-kosong-ikon" aria-hidden="true">
            <AiIkon name="doc" size={18} />
          </span>
          <span>
            {lingkup === 'global'
              ? tr('No Rules Yet. Click Create to add your first rule')
              : tr('No project rules yet. Click Create to add one for this workspace')}
          </span>
          <button
            type="button"
            className="agx-btn-utama"
            data-testid="agx-rules-create"
            onClick={() => {
              setGalatSunting(null);
              setSunting({ nama: '', isi: '', baru: true });
            }}
          >
            + {tr('Create')}
          </button>
        </div>
      ) : (
        <>
          <div className="agx-seksi-baris">
            <span className="agx-muted">
              {aturan.length} {tr('rules')}
            </span>
            <button
              type="button"
              className="agx-btn-utama"
              data-testid="agx-rules-create"
              onClick={() => {
                setGalatSunting(null);
                setSunting({ nama: '', isi: '', baru: true });
              }}
            >
              + {tr('Create')}
            </button>
          </div>
          <div className="agx-daftar" data-testid="agx-rules-daftar">
            {aturan.map((a) => (
              <div className="agx-baris" key={a.path} data-testid={`agx-rule-${a.name}`}>
                <span className="agx-avatar" aria-hidden="true">
                  <AiIkon name="doc" size={15} />
                </span>
                <div className="agx-baris-teks">
                  <span className="agx-baris-nama">{a.name}</span>
                  <span className="agx-baris-desk">{a.description || a.apply_to}</span>
                </div>
                <div className="agx-baris-aksi">
                  <button
                    type="button"
                    className="agx-btn-batal"
                    data-testid={`agx-rule-hapus-${a.name}`}
                    disabled={sibukAturan}
                    onClick={() => void hapusAturan(a.name)}
                  >
                    {tr('Delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 3. Memory ──────────────────────────────────────────────────── */}
      <div className="agx-seksi-baris">
        <h3 className="agx-seksi">
          {tr('Memory')} <span className="agx-beta">Beta</span>
        </h3>
        <div className="agx-seg" role="tablist" data-testid="agx-mem-tab">
          {(['global', 'proyek'] as Lingkup[]).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lingkupMemori === l}
              className={`agx-seg-btn${lingkupMemori === l ? ' is-on' : ''}`}
              data-testid={`agx-mem-${l}`}
              onClick={() => setLingkupMemori(l)}
            >
              {l === 'global' ? tr('Global') : tr('Project')}
            </button>
          ))}
        </div>
      </div>

      <label className="agx-tool-baris agx-tool-pil agx-mem-toggle" data-testid="agx-mem-toggle">
        <input
          type="checkbox"
          checked={memoriNyala}
          onChange={(e) => simpan({ memoriAktif: e.target.checked })}
        />
        <span className="agx-baris-teks">
          <span className="agx-baris-nama">
            {tr('Enable Zephyr to remember relevant context from your chat history')}
          </span>
          <span className="agx-baris-desk">
            {tr('Decisions and preferences are stored in a file you can read and edit.')}
          </span>
        </span>
      </label>

      <div className="agx-mem-kartu" data-testid="agx-user-memory">
        <span className="agx-mem-ikon" aria-hidden="true">
          <AiIkon name="thought" size={18} />
        </span>
        <div className="agx-baris-teks">
          <span className="agx-baris-nama">{tr('User Memory')}</span>
          <code className="agx-mem-path">%APPDATA%\zephyr\memory\user_profile.md</code>
        </div>
      </div>

      {/* ── Rule editor: a real free-text document ─────────────────────── */}
      {sunting && (
        <div className="modal-backdrop" role="presentation" data-testid="agx-rule-editor">
          <div className="modal agx-rule-modal" role="dialog" aria-modal="true" aria-label={tr('Rule')}>
            <h2 className="modal-title">{sunting.baru ? tr('New Rule') : tr('Edit Rule')}</h2>
            <p className="agx-muted" style={{ marginBottom: 10 }}>
              {lingkup === 'global'
                ? tr('This rule applies to every workspace.')
                : tr('This rule applies to the current workspace only.')}
            </p>

            <label className="agx-field">
              <span className="agx-field-label">{tr('Name')}</span>
              <input
                data-testid="agx-rule-nama"
                value={sunting.nama}
                placeholder={tr('e.g. rust-style')}
                onChange={(e) => setSunting({ ...sunting, nama: e.target.value })}
              />
            </label>

            <label className="agx-field">
              <span className="agx-field-label">
                {tr('Rule')}
                <em>
                  {sunting.isi.length}/{8000}
                </em>
              </span>
              {/*
                * A plain textarea, deliberately. A rule is prose: it may be one
                * line ("use tabs") or forty ("here is how we name migrations").
                * A rich editor would add toolbars to a field whose whole job is
                * to hold text the model reads verbatim.
                */}
              <textarea
                data-testid="agx-rule-isi"
                className="agx-rule-teks"
                rows={12}
                maxLength={8000}
                value={sunting.isi}
                placeholder={tr('Write anything the agent should always keep in mind…')}
                onChange={(e) => setSunting({ ...sunting, isi: e.target.value })}
              />
            </label>

            {galatSunting && (
              <p className="agx-galat" data-testid="agx-rule-galat">
                {galatSunting}
              </p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="agx-rule-simpan"
                disabled={sibukAturan}
                onClick={() => void simpanSunting()}
              >
                {sibukAturan ? tr('Saving…') : tr('Save')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="agx-rule-batal"
                onClick={() => {
                  setSunting(null);
                  setGalatSunting(null);
                }}
              >
                {tr('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {jumlahHook > 0 && <span hidden data-hook={jumlahHook} />}
    </div>
  );
}
