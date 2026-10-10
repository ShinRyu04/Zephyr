import { useEffect, useState } from 'react';
import { useT, useTf } from '../../lib/i18n';
import {
  useAgentExtras,
  HOOK_EVENTS,
  type Hook,
} from '../../lib/agentExtrasStore';
import AiIkon from '../ai/AiIkon';
import { useSkills } from '../../lib/skillsStore';
import { buatDraft, type DraftKind, type DraftHasil } from '../../lib/agentDraft';
import type { SkillInfo } from '../../lib/commands';

/*
 * The real content for Agent Customizations' Skills, Hooks, Plugins and
 * Migrations sections. These used to be four "Nothing here yet." shells; they
 * are now editable lists backed by `agentExtrasStore`, grouped by scope the way
 * Copilot splits Workspace vs User.
 */

/* ── Skills ──────────────────────────────────────────────────────────────── */

/*
 * Skills, backed by FILES rather than by localStorage.
 *
 * The pane used to edit `agentExtrasStore`, which keeps everything in a browser
 * key. The agent reads skills from DISK (`skills.rs` walks the workspace's
 * `.zephyr/skills/` and the app data folder and injects them into the system
 * prompt), so a skill created here was written where nothing could read it: the
 * row appeared, the agent never saw it.
 *
 * Every control below therefore goes through `useSkills`, which calls the same
 * backend the prompt is built from. There is no Save button per row: the disk
 * IS the state, the reader edits one skill at a time in the pane under the
 * list, and closing it without saving leaves the file untouched.
 */
function SkillRow({ skill, aktif, onBuka }: { skill: SkillInfo; aktif: boolean; onBuka: () => void }) {
  const tr = useT();
  const hapus = useSkills((s) => s.hapus);
  const [konfirmasi, setKonfirmasi] = useState(false);

  return (
    <div className={`agc-item${aktif ? ' is-open' : ''}`} data-testid={`agc-skill-${skill.name}`}>
      <div className="agc-item-head">
        <button className="agc-item-toggle" aria-expanded={aktif} onClick={onBuka}>
          <AiIkon name={aktif ? 'chev-down' : 'chev-right'} size={11} />
          <AiIkon name="thought" size={14} />
          <span className="agc-item-name">{skill.name}</span>
          <span className="agc-item-scope">{skill.scope}</span>
        </button>
        {konfirmasi ? (
          <>
            {/*
              * Deleting a skill removes a real file. Two clicks rather than one:
              * an accidental press on a trash icon next to a list row is easy,
              * and the file is gone from disk, not from a key that could be
              * reloaded.
              */}
            <button
              className="btn btn-sm btn-danger"
              data-testid={`agc-skill-del-yes-${skill.name}`}
              onClick={() => void hapus(skill.name)}
            >
              {tr('Delete')}
            </button>
            <button className="btn btn-sm" onClick={() => setKonfirmasi(false)}>
              {tr('Cancel')}
            </button>
          </>
        ) : (
          <button
            className="agc-item-del"
            data-testid={`agc-skill-del-${skill.name}`}
            title={tr('Delete')}
            aria-label={tr('Delete')}
            onClick={() => setKonfirmasi(true)}
          >
            <AiIkon name="trash" size={13} />
          </button>
        )}
      </div>
      <div className="agc-item-meta">
        {skill.description || tr('(no description)')}
        <span className="agc-item-bytes">{Math.round(skill.bytes / 1024 * 10) / 10} KB</span>
      </div>
      {/* Only the open row mounts an editor: one reader edits one skill, and a
          list of ten skills should not hold ten textareas with ten bodies. */}
      {aktif && <SkillEditor skill={skill} />}
    </div>
  );
}

/** The editor for one skill: name, description, body, all read from disk. */
function SkillEditor({ skill }: { skill: SkillInfo }) {
  const tr = useT();
  const { isi, memuatIsi, simpan, buka, sibuk } = useSkills();
  const [nama, setNama] = useState(skill.name);
  const [desc, setDesc] = useState(skill.description);
  const [body, setBody] = useState<string | null>(null);

  /*
   * The body arrives asynchronously, so the local buffer starts null and is
   * filled once — and only once, so a re-render during typing cannot overwrite
   * what the reader has written with the file's older contents.
   */
  useEffect(() => {
    if (memuatIsi) return;
    setBody((lama) => lama ?? isi);
  }, [isi, memuatIsi]);

  /* Switching skills resets the buffer to the newly-read body. */
  useEffect(() => {
    setNama(skill.name);
    setDesc(skill.description);
    setBody(null);
  }, [skill.name, skill.description]);

  const kotor =
    body !== null && (nama !== skill.name || desc !== skill.description || body !== isi);

  return (
    <div className="agc-editor" data-testid={`agc-skill-editor-${skill.name}`}>
      {memuatIsi || body === null ? (
        <p className="agc-group-empty">{tr('Loading…')}</p>
      ) : (
        <>
          <label className="agc-label" htmlFor="agc-skill-nama">
            {tr('Name')}
          </label>
          <input
            id="agc-skill-nama"
            className="agc-field"
            data-testid="agc-skill-nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-skill-desc">
            {tr('When the agent should use this')}
          </label>
          <input
            id="agc-skill-desc"
            className="agc-field"
            data-testid="agc-skill-desc"
            placeholder={tr('Short description (when the agent should use it)')}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-skill-body">
            {tr('Instructions')}
          </label>
          <textarea
            id="agc-skill-body"
            className="agc-field agc-field-area"
            data-testid="agc-skill-body"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="agc-editor-actions">
            <span className="agc-item-path" title={skill.path}>
              {skill.path}
            </span>
            <button
              className="btn btn-sm"
              disabled={!kotor || sibuk}
              onClick={() => buka(skill.name)}
            >
              {tr('Revert')}
            </button>
            <button
              className="btn btn-sm btn-primary"
              data-testid="agc-skill-simpan"
              disabled={!kotor || sibuk}
              onClick={() =>
                void simpan({
                  name: nama.trim() || skill.name,
                  description: desc,
                  content: body,
                  scope: skill.scope,
                })
              }
            >
              {tr('Save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AgcSkills() {
  const tr = useT();
  const { daftar, sibuk, galat, dibuka, buka, muat, bersihkanGalat } = useSkills();
  const [namaBaru, setNamaBaru] = useState<'workspace' | 'global' | null>(null);
  /* Which scope's AI panel is open, if any. One at a time: a draft being
     written and a second one being requested is two half-finished forms. */
  const [aiKinds, setAiKinds] = useState<'workspace' | 'global' | null>(null);
  const [draft, setDraft] = useState<DraftHasil | null>(null);

  /* Loaded on mount, and re-loaded whenever a write lands (the store does that
     itself) — so a skill added by hand or by `git pull` appears without a
     restart. */
  useEffect(() => {
    void muat();
  }, [muat]);

  const kelompok: { scope: 'workspace' | 'global'; label: string }[] = [
    { scope: 'workspace', label: 'Workspace' },
    { scope: 'global', label: 'User' },
  ];

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Skills')}</h2>
      <p className="agc-pane-desc">
        {tr('Folders of instructions and workflows the agent loads when relevant to a specialized task.')}
      </p>

      {/*
        * The failure case is stated, not swallowed. Writing a skill can fail for
        * reasons localStorage could not (no workspace open, a permission error),
        * and an empty list would read as "you have no skills" when the truth is
        * "the list could not be read".
        */}
      {galat && (
        <p className="agc-error" data-testid="agc-skills-error" role="alert">
          {galat}
          <button className="btn btn-sm" onClick={bersihkanGalat}>
            {tr('Dismiss')}
          </button>
        </p>
      )}

      {daftar.length === 0 && !sibuk && !galat && (
        <p className="agc-group-empty" data-testid="agc-skills-kosong">
          {tr('No skills yet. Create one, or install from the catalog.')}
        </p>
      )}

      {kelompok.map((g) => {
        const list = daftar.filter((s) => s.scope === g.scope);
        return (
          <section className="agc-group" key={g.scope} data-testid={`agc-skills-${g.scope}`}>
            <div className="agc-group-head">
              <span className="agc-group-title">
                {tr(g.label)} <span className="agc-group-count">{list.length}</span>
              </span>
              <button
                className="btn btn-sm"
                data-testid={`agc-skill-ai-${g.scope}`}
                title={tr('Draft a skill from a description')}
                onClick={() => {
                  setAiKinds(g.scope);
                  setNamaBaru(null);
                }}
              >
                <AiIkon name="thought" size={12} /> {tr('Create with AI')}
              </button>
              <button
                className="btn btn-sm"
                data-testid={`agc-skill-add-${g.scope}`}
                onClick={() => {
                  setNamaBaru(g.scope);
                  setAiKinds(null);
                }}
              >
                <AiIkon name="plus" size={12} /> {tr('New Skill')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No skills yet.')}</p>
            ) : (
              list.map((s) => (
                <SkillRow
                  key={`${s.scope}-${s.name}`}
                  skill={s}
                  aktif={dibuka === s.name}
                  onBuka={() => void buka(dibuka === s.name ? null : s.name)}
                />
              ))
            )}
          </section>
        );
      })}

      {/*
        * A new skill is drafted in the editor below rather than written straight
        * to disk. Naming a file before its contents exist would leave an empty
        * SKILL.md in the prompt of every turn until the reader got back to it.
        */}
      {aiKinds !== null && (
        <section className="agc-group" data-testid="agc-skill-ai">
          <div className="agc-group-head">
            <span className="agc-group-title">
              {tr('Create with AI')} - {aiKinds === 'workspace' ? tr('Workspace') : tr('User')}
            </span>
          </div>
          <PanelAi
            kind="skill"
            onDraft={(d) => {
              setDraft(d);
              setNamaBaru(null);
            }}
            onBatal={() => {
              setAiKinds(null);
              setDraft(null);
            }}
          />
          {draft && (
            <DraftEditor
              draft={draft}
              scope={aiKinds}
              onSelesai={() => {
                setAiKinds(null);
                setDraft(null);
              }}
            />
          )}
        </section>
      )}

      {namaBaru !== null && (
        <section className="agc-group" data-testid="agc-skill-baru">
          <div className="agc-group-head">
            <span className="agc-group-title">{tr('New skill')}</span>
          </div>
          <EditorBaru scope={namaBaru} onSelesai={() => setNamaBaru(null)} />
        </section>
      )}
    </div>
  );
}

/*
 * "Buat dengan AI" — describe the skill, get a draft, review it, save it.
 *
 * Three deliberate properties:
 *
 *   - The result lands in the ORDINARY editor below, not straight on disk. What
 *     the model produces is a suggestion; the reader sees the name, the
 *     description and the body as fields they can change, and nothing exists as
 *     a file until Save.
 *
 *   - No tools are sent with the request (`agentDraft.ts`). The model is asked
 *     for text, so there is nothing it could run even if the prompt persuaded
 *     it to try.
 *
 *   - A failure is shown where the button is. A draft the reader is waiting on
 *     should say what went wrong rather than fail quietly.
 */
function PanelAi({
  kind,
  onDraft,
  onBatal,
}: {
  kind: DraftKind;
  onDraft: (d: DraftHasil) => void;
  onBatal: () => void;
}) {
  const tr = useT();
  const [permintaan, setPermintaan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const d = await buatDraft({ kind, permintaan });
      onDraft(d);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  const contoh =
    kind === 'skill'
      ? 'Buatkan skill untuk menjalankan test Zephyr. Pakai command sesuai jenis berkas yang berubah, jangan bilang test lulus kalau belum dijalankan, dan jelaskan kegagalannya.'
      : kind === 'agent'
        ? 'Buatkan agent untuk meninjau kode: cari bug dan masalah keamanan, jangan ubah berkas apa pun, dan mulai dari hak akses paling kecil.'
        : 'Buatkan hook yang mencatat setiap kali agent selesai mengubah berkas, tanpa mengirim data ke mana pun.';

  return (
    <div className="agc-ai" data-testid={`agc-ai-${kind}`}>
      <div className="agc-ai-head">
        <AiIkon name="thought" size={13} />
        <span>{tr('Describe it in plain language')}</span>
      </div>
      <textarea
        className="agc-field agc-field-area"
        data-testid={`agc-ai-input-${kind}`}
        rows={4}
        placeholder={tr(contoh)}
        value={permintaan}
        disabled={sibuk}
        onChange={(e) => setPermintaan(e.target.value)}
      />
      {galat && (
        <p className="agc-error" data-testid={`agc-ai-error-${kind}`} role="alert">
          {galat}
        </p>
      )}
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={onBatal} disabled={sibuk}>
          {tr('Cancel')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid={`agc-ai-generate-${kind}`}
          disabled={sibuk || permintaan.trim().length === 0}
          onClick={() => void kirim()}
        >
          {sibuk ? tr('Generating…') : tr('Generate draft')}
        </button>
      </div>
    </div>
  );
}

/*
 * The draft the model produced, in an editable form.
 *
 * Deliberately the same shape as `EditorBaru` — name, description, body, then
 * Save — so "make one myself" and "have the AI make one" end in the same place.
 * The reader is told the text is a suggestion, because a generated instruction
 * that reads confidently is exactly the kind that should be checked before it
 * becomes a file the agent follows.
 */
function DraftEditor({
  draft,
  scope,
  onSelesai,
}: {
  draft: DraftHasil;
  scope: 'workspace' | 'global';
  onSelesai: () => void;
}) {
  const tr = useT();
  const simpan = useSkills((s) => s.simpan);
  const sibuk = useSkills((s) => s.sibuk);
  const [nama, setNama] = useState(draft.name);
  const [desc, setDesc] = useState(draft.description);
  const [body, setBody] = useState(draft.body);

  const bisa = nama.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="agc-editor agc-editor-draft" data-testid="agc-draft-editor">
      <p className="agc-draft-note">
        {tr('This is a draft from the model. Check it before saving - it becomes instructions the agent follows.')}
      </p>
      <label className="agc-label" htmlFor="agc-draft-nama">
        {tr('Name')}
      </label>
      <input
        id="agc-draft-nama"
        className="agc-field"
        data-testid="agc-draft-nama"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-draft-desc">
        {tr('When the agent should use this')}
      </label>
      <input
        id="agc-draft-desc"
        className="agc-field"
        data-testid="agc-draft-desc"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-draft-body">
        {tr('Instructions')}
      </label>
      <textarea
        id="agc-draft-body"
        className="agc-field agc-field-area"
        data-testid="agc-draft-body"
        rows={12}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={onSelesai} disabled={sibuk}>
          {tr('Discard draft')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid="agc-draft-simpan"
          disabled={!bisa || sibuk}
          onClick={() =>
            void simpan({
              name: nama.trim(),
              description: desc,
              content: body,
              scope,
            }).then((ok) => {
              if (ok) onSelesai();
            })
          }
        >
          {tr('Save')}
        </button>
      </div>
    </div>
  );
}

/** The draft editor for a skill that does not exist on disk yet. */
function EditorBaru({ scope, onSelesai }: { scope: 'workspace' | 'global'; onSelesai: () => void }) {
  const tr = useT();
  const simpan = useSkills((s) => s.simpan);
  const sibuk = useSkills((s) => s.sibuk);
  const [nama, setNama] = useState('');
  const [desc, setDesc] = useState('');
  const [body, setBody] = useState('');

  const bisa = nama.trim().length > 0;

  return (
    <div className="agc-editor" data-testid="agc-skill-editor-baru">
      <label className="agc-label" htmlFor="agc-baru-nama">
        {tr('Name')}
      </label>
      <input
        id="agc-baru-nama"
        className="agc-field"
        data-testid="agc-baru-nama"
        placeholder="run-tests"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-baru-desc">
        {tr('When the agent should use this')}
      </label>
      <input
        id="agc-baru-desc"
        className="agc-field"
        data-testid="agc-baru-desc"
        placeholder={tr('Run the test suite for whatever changed.')}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-baru-body">
        {tr('Instructions')}
      </label>
      <textarea
        id="agc-baru-body"
        className="agc-field agc-field-area"
        data-testid="agc-baru-body"
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={onSelesai}>
          {tr('Cancel')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid="agc-baru-simpan"
          disabled={!bisa || sibuk}
          onClick={() =>
            void simpan({
              name: nama.trim(),
              description: desc,
              content: body,
              scope,
            }).then((ok) => {
              if (ok) onSelesai();
            })
          }
        >
          {tr('Save')}
        </button>
      </div>
    </div>
  );
}

/* ── Hooks ───────────────────────────────────────────────────────────────── */

function HookRow({ hook }: { hook: Hook }) {
  const tr = useT();
  const update = useAgentExtras((s) => s.updateHook);
  const remove = useAgentExtras((s) => s.removeHook);
  const [open, setOpen] = useState(hook.name === 'New hook');

  return (
    <div className="agc-item" data-testid={`agc-hook-${hook.id}`}>
      <div className="agc-item-head">
        <button
          className="agc-item-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <AiIkon name={open ? 'chev-down' : 'chev-right'} size={11} />
          <AiIkon name="queue" size={14} />
          <span className="agc-item-name">{hook.name || tr('Untitled hook')}</span>
          <span className="agc-item-sub">
            {tr(HOOK_EVENTS.find((e) => e.id === hook.event)?.label ?? '')}
          </span>
        </button>
        <label className="agc-item-switch">
          <input
            type="checkbox"
            data-testid={`agc-hook-on-${hook.id}`}
            checked={hook.enabled}
            onChange={(e) => update(hook.id, { enabled: e.target.checked })}
          />
          <span>{tr('Enabled')}</span>
        </label>
        <button
          className="agc-item-del"
          data-testid={`agc-hook-del-${hook.id}`}
          title={tr('Delete')}
          aria-label={tr('Delete')}
          onClick={() => remove(hook.id)}
        >
          <AiIkon name="trash" size={13} />
        </button>
      </div>
      {open && (
        <div className="agc-item-body">
          <input
            className="agc-field"
            data-testid={`agc-hook-name-${hook.id}`}
            placeholder={tr('Hook name')}
            value={hook.name}
            onChange={(e) => update(hook.id, { name: e.target.value })}
          />
          <select
            className="agc-field"
            data-testid={`agc-hook-event-${hook.id}`}
            value={hook.event}
            onChange={(e) => update(hook.id, { event: e.target.value as Hook['event'] })}
          >
            {HOOK_EVENTS.map((e) => (
              <option key={e.id} value={e.id}>
                {tr(e.label)}
              </option>
            ))}
          </select>
          <input
            className="agc-field agc-field-mono"
            data-testid={`agc-hook-cmd-${hook.id}`}
            placeholder={tr('Command to run, e.g. npm run lint')}
            value={hook.command}
            onChange={(e) => update(hook.id, { command: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function AgcHooks() {
  const tr = useT();
  const hooks = useAgentExtras((s) => s.hooks);
  const add = useAgentExtras((s) => s.addHook);

  const groups: { scope: Hook['scope']; label: string }[] = [
    { scope: 'workspace', label: 'Workspace' },
    { scope: 'user', label: 'User' },
  ];

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Hooks')}</h2>
      <p className="agc-pane-desc">
        {tr('Commands run automatically at key points in the agent lifecycle to validate, format, or coordinate work.')}
      </p>
      {groups.map((g) => {
        const list = hooks.filter((h) => h.scope === g.scope);
        return (
          <section className="agc-group" key={g.scope} data-testid={`agc-hooks-${g.scope}`}>
            <div className="agc-group-head">
              <span className="agc-group-title">
                {tr(g.label)} <span className="agc-group-count">{list.length}</span>
              </span>
              <button
                className="btn btn-sm"
                data-testid={`agc-hook-add-${g.scope}`}
                onClick={() => add(g.scope)}
              >
                <AiIkon name="plus" size={12} /> {tr('New Hook')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No hooks yet.')}</p>
            ) : (
              list.map((h) => <HookRow key={h.id} hook={h} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Plugins ─────────────────────────────────────────────────────────────── */

export function AgcPlugins() {
  const tr = useT();
  const plugins = useAgentExtras((s) => s.plugins);
  const install = useAgentExtras((s) => s.installPlugin);
  const [cari, setCari] = useState('');

  const q = cari.trim().toLowerCase();
  const match = plugins.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
  );
  const installed = match.filter((p) => p.installed);
  const available = match.filter((p) => !p.installed);

  const Card = ({ p }: { p: (typeof plugins)[number] }) => (
    <div className="agc-plugin" data-testid={`agc-plugin-${p.id}`}>
      <div className="agc-plugin-main">
        <span className="agc-plugin-name">{p.name}</span>
        <span className="agc-plugin-desc">{tr(p.description)}</span>
        <span className="agc-plugin-chips">
          {p.provides.map((c) => (
            <span className="agc-plugin-chip" key={c}>
              {c}
            </span>
          ))}
        </span>
      </div>
      <button
        className={`btn btn-sm${p.installed ? '' : ' btn-primary'}`}
        data-testid={`agc-plugin-${p.installed ? 'uninstall' : 'install'}-${p.id}`}
        onClick={() => install(p.id, !p.installed)}
      >
        {p.installed ? tr('Uninstall') : tr('Install')}
      </button>
    </div>
  );

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Plugins')}</h2>
      <p className="agc-pane-desc">
        {tr('Extend the agent with reusable packages that add commands, skills, agents, hooks, and MCP servers.')}
      </p>
      <div className="agc-tools-search agc-plugin-search">
        <AiIkon name="search" size={12} />
        <input
          data-testid="agc-plugin-cari"
          placeholder={tr('Search plugins…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      <section className="agc-group" data-testid="agc-plugins-installed">
        <div className="agc-group-head">
          <span className="agc-group-title">
            {tr('Installed')} <span className="agc-group-count">{installed.length}</span>
          </span>
        </div>
        {installed.length === 0 ? (
          <p className="agc-group-empty">{tr('Nothing installed yet.')}</p>
        ) : (
          installed.map((p) => <Card key={p.id} p={p} />)
        )}
      </section>

      <section className="agc-group" data-testid="agc-plugins-available">
        <div className="agc-group-head">
          <span className="agc-group-title">
            {tr('Available')} <span className="agc-group-count">{available.length}</span>
          </span>
        </div>
        {available.length === 0 ? (
          <p className="agc-group-empty">{tr('No plugins match.')}</p>
        ) : (
          available.map((p) => <Card key={p.id} p={p} />)
        )}
      </section>
    </div>
  );
}

/* ── Migrations ──────────────────────────────────────────────────────────── */

export function AgcMigrations() {
  const tr = useT();
  const tf = useTf();
  /*
   * Skills come from DISK here too, so an exported bundle lists what the agent
   * actually has rather than a stale browser key.
   */
  const skills = useSkills((s) => s.daftar);
  const hooks = useAgentExtras((s) => s.hooks);
  const plugins = useAgentExtras((s) => s.plugins);
  const [status, setStatus] = useState<string | null>(null);

  const exportBundle = async () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      skills,
      hooks,
      installedPlugins: plugins.filter((p) => p.installed).map((p) => p.id),
    };
    const text = JSON.stringify(bundle, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(tr('Customizations copied to the clipboard as JSON.'));
    } catch {
      /* Clipboard can be blocked when the window is not focused (WebView2);
         fall back to a download so the export is never silently lost. */
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zephyr-agent-customizations.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus(tr('Customizations exported as a download.'));
    }
  };

  const total = skills.length + hooks.length + plugins.filter((p) => p.installed).length;

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Migrations')}</h2>
      <p className="agc-pane-desc">
        {tr('Move customizations between workspaces and profiles by exporting them as a portable JSON bundle.')}
      </p>
      <div className="agc-migrate-card" data-testid="agc-migrate">
        <div className="agc-migrate-summary">
          <span>{tf('{n} skills', { n: skills.length })}</span>
          <span>{tf('{n} hooks', { n: hooks.length })}</span>
          <span>{tf('{n} plugins', { n: plugins.filter((p) => p.installed).length })}</span>
        </div>
        <button
          className="btn btn-primary"
          data-testid="agc-migrate-export"
          disabled={total === 0}
          onClick={() => void exportBundle()}
        >
          {tr('Export customizations')}
        </button>
        {total === 0 && (
          <p className="agc-group-empty">{tr('Add skills, hooks, or plugins first — then you can export them.')}</p>
        )}
        {status && (
          <p className="agc-migrate-status" data-testid="agc-migrate-status" role="status">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
