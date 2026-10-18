/*
 * Rules & Memories — the TRAE-shaped page inside Agent Customizations.
 *
 * Three blocks, in this order, because that is the order the reader reasons
 * about them:
 *
 *   1. IMPORT SETTINGS  - which files the agent should read from the project.
 *   2. RULES            - the rules themselves, Global vs Project.
 *   3. MEMORY (Beta)    - what the agent may remember across sessions.
 *
 * WHY a new page rather than another section of the old `RulesSection`: that
 * component edits pattern-based WRITE guards ("refuse a save that looks like a
 * mistake"), which is a different feature that happened to share the word
 * "rules". Keeping both on one screen made the reader wonder which one the agent
 * actually follows. Write guards stay in Settings; this page is about what the
 * agent READS.
 */
import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useAgentExtras } from '../../lib/agentExtrasStore';

/*
 * The two context files the reference exposes.
 *
 * `AGENTS.md` is the repo-wide instruction file; `CLAUDE.md` is the same idea
 * from the Claude Code ecosystem. Both are plain files at the workspace root, so
 * "include in context" is a real switch over what the prompt builder reads - not
 * a label. The stored keys live under `settings.agents` so they travel with the
 * rest of the agent configuration.
 */
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
  /*
   * Hooks are read straight from the store - it loads from localStorage when the
   * module is created, so there is no `muat()` to call. The old code called one
   * and the whole page failed to compile, which is the cheapest possible way for
   * a page to be wrong.
   */
  const jumlahHook = useAgentExtras((s) => s.hooks.length);

  const [lingkup, setLingkup] = useState<Lingkup>('global');
  const [lingkupMemori, setLingkupMemori] = useState<Lingkup>('global');

  const agen = (settings.agents ?? {}) as Record<string, unknown>;
  const bacaAgents = agen.bacaAgentsMd === true;
  const bacaClaude = agen.bacaClaudeMd === true;
  const memoriNyala = agen.memoriAktif !== false;

  /* Rules the agent reads: the custom instructions plus any project rules. */
  const aturan = useMemo(() => {
    const dariSetelan = String(agen.customInstructions ?? '').trim();
    return dariSetelan ? [{ id: 'setelan', nama: tr('Custom instructions'), isi: dariSetelan }] : [];
  }, [agen.customInstructions, tr]);

  const simpan = (patch: Record<string, unknown>) => {
    void applySettings({ agents: { ...agen, ...patch } } as never);
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
          <button type="button" className="agx-btn-utama" data-testid="agx-rules-create">
            + {tr('Create')}
          </button>
        </div>
      ) : (
        <div className="agx-daftar">
          {aturan.map((a) => (
            <div className="agx-baris" key={a.id}>
              <span className="agx-avatar" aria-hidden="true">
                <AiIkon name="doc" size={15} />
              </span>
              <div className="agx-baris-teks">
                <span className="agx-baris-nama">{a.nama}</span>
                <span className="agx-baris-desk">{a.isi.slice(0, 120)}</span>
              </div>
            </div>
          ))}
        </div>
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

      {jumlahHook > 0 && <span hidden data-hook={jumlahHook} />}
    </div>
  );
}
