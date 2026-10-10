import { useEffect, useState } from 'react';
import { useT, useTf } from '../../lib/i18n';
import {
  useAgentExtras,
  HOOK_EVENTS,
  type Hook,
  type HookEvent,
} from '../../lib/agentExtrasStore';
import AiIkon from '../ai/AiIkon';
import { useSkills } from '../../lib/skillsStore';
import { buatDraft, type DraftKind, type DraftHasil } from '../../lib/agentDraft';
import {
  ccCatalogList,
  ccCatalogBody,
  instructionCatalogList,
  instructionInstall,
  type SkillInfo,
  type CatalogItem,
  type InstructionInfo,
  type CatalogInstruction,
} from '../../lib/commands';
import { useInstructions } from '../../lib/instructionsStore';

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

/*
 * The catalog browser: 650-odd skills that ship with Zephyr, ready to install.
 *
 * ## Why this is not the Claude Code browser
 *
 * `CliSlashPanel` has its own `CatalogBrowser`, and it installs into
 * `~/.claude/skills/` — that is the point of THAT one, because the live `claude`
 * CLI reads from there. This pane is for ZEPHYR's agent, which reads
 * `<workspace>/.zephyr/skills/` and the app data folder. Reusing that component
 * would have installed every skill where this pane's own list could not see it,
 * which is the exact class of bug this whole change set exists to remove.
 *
 * The body is written through `useSkills().simpan`, the same path a hand-typed
 * skill takes, so an installed skill is an ordinary skill afterwards.
 *
 * ## Why the list is filtered to skills
 *
 * The catalog carries agents too. They belong to the subagent system, which
 * takes a different shape (roles, tool allowlists) — offering them here would
 * put a thing called "agent" in a pane called "Skills" and store it as a
 * `.md` file nothing would read as an agent.
 */
function KatalogSkills({ scope }: { scope: 'workspace' | 'global' }) {
  const tr = useT();
  const tf = useTf();
  const daftar = useSkills((s) => s.daftar);
  const simpan = useSkills((s) => s.simpan);
  const [buka, setBuka] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [muat, setMuat] = useState(false);
  const [q, setQ] = useState('');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!buka || items.length > 0) return;
    setMuat(true);
    ccCatalogList()
      .then((all) => setItems(all.filter((i) => i.kind === 'skill')))
      .catch((e) => setGalat(String(e)))
      .finally(() => setMuat(false));
  }, [buka, items.length]);

  /* Skills already on disk, so the row can say "Installed" instead of offering
     a button that would overwrite the reader's own edits. */
  const ada = new Set(daftar.map((d) => d.name.toLowerCase()));

  const needle = q.trim().toLowerCase();
  const tampil = needle
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          i.title.toLowerCase().includes(needle) ||
          i.description.toLowerCase().includes(needle) ||
          i.category.toLowerCase().includes(needle),
      )
    : items;

  const pasang = async (it: CatalogItem) => {
    setSibuk(it.id);
    setGalat(null);
    try {
      const body = await ccCatalogBody(it.id);
      const ok = await simpan({
        name: it.name,
        description: it.description,
        content: body,
        scope,
      });
      if (!ok) setGalat(tr('Could not save the skill. See the message above.'));
    } catch (e) {
      setGalat(String(e));
    } finally {
      setSibuk(null);
    }
  };

  if (!buka) {
    return (
      <div className="agc-ai-aksi">
        <button
          className="btn btn-sm"
          data-testid={`agc-katalog-${scope}`}
          onClick={() => setBuka(true)}
        >
          <AiIkon name="link" size={12} /> {tr('Browse catalog')}
        </button>
      </div>
    );
  }

  return (
    <div className="agc-katalog" data-testid={`agc-katalog-panel-${scope}`}>
      <div className="agc-katalog-head">
        <input
          className="agc-field"
          data-testid="agc-katalog-cari"
          placeholder={tr('Search the catalog…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="agc-katalog-count">
          {tf('{n} skills', { n: tampil.length })}
        </span>
        <button className="btn btn-sm" onClick={() => setBuka(false)}>
          {tr('Close')}
        </button>
      </div>
      {galat && (
        <p className="agc-error" role="alert">
          {galat}
        </p>
      )}
      {muat && <p className="agc-group-empty">{tr('Loading catalog…')}</p>}
      {/*
        * Capped on purpose. The catalog holds 427 skills and rendering them all
        * puts 427 rows in the DOM every keystroke — the search box becomes
        * unusable exactly when the reader is trying to narrow the list. The
        * count above still reports the true total, so nothing is hidden without
        * saying so.
      */}
      <div className="agc-katalog-list">
        {tampil.slice(0, 40).map((it) => {
          const sudah = ada.has(it.name.toLowerCase());
          return (
            <div className="agc-katalog-row" key={it.id} data-testid={`agc-katalog-${it.name}`}>
              <div className="agc-katalog-main">
                <span className="agc-katalog-name">{it.name}</span>
                <span className="agc-katalog-desc">{it.description}</span>
              </div>
              <button
                className="btn btn-sm"
                disabled={sudah || sibuk === it.id}
                data-testid={`agc-katalog-pasang-${it.name}`}
                onClick={() => void pasang(it)}
              >
                {sudah ? tr('Installed') : sibuk === it.id ? tr('Installing…') : tr('Install')}
              </button>
            </div>
          );
        })}
        {!muat && tampil.length === 0 && (
          <p className="agc-group-empty">{tr('Nothing matches that search.')}</p>
        )}
        {tampil.length > 40 && (
          <p className="agc-group-empty">
            {tf('{n} more - narrow the search to see them', { n: tampil.length - 40 })}
          </p>
        )}
      </div>
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
            <KatalogSkills scope={g.scope === 'global' ? 'global' : 'workspace'} />
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

/*
 * The hook draft a model produced, laid out so the reader can judge it.
 *
 * The EVENT and the COMMAND are shown as their own labelled fields, above the
 * explanation, because those two are what would run and when. A hook draft that
 * buried the command inside a paragraph of prose would be asking the reader to
 * approve something they have to hunt for.
 *
 * The default event is validated against the real list: a model that invents
 * "before-commit" would otherwise store a hook on an event nothing fires.
 */
function DraftHook({
  draft,
  onSimpan,
  onBatal,
}: {
  draft: DraftHasil;
  onSimpan: (patch: { name: string; event: HookEvent; command: string }) => void;
  onBatal: () => void;
}) {
  const tr = useT();
  const eventValid = HOOK_EVENTS.some((e) => e.id === draft.event);
  const [nama, setNama] = useState(draft.name);
  const [event, setEvent] = useState<HookEvent>(
    eventValid ? (draft.event as HookEvent) : 'session-end',
  );
  const [command, setCommand] = useState(draft.command ?? '');

  const bisa = nama.trim() !== '' && command.trim() !== '';

  return (
    <div className="agc-editor agc-editor-draft" data-testid="agc-draft-hook">
      <p className="agc-draft-note">
        {tr('This is a draft from the model. Read the command before saving - it is stored disabled and will not run.')}
      </p>
      <label className="agc-label" htmlFor="agc-dh-nama">
        {tr('Name')}
      </label>
      <input
        id="agc-dh-nama"
        className="agc-field"
        data-testid="agc-dh-nama"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-dh-event">
        {tr('Runs when')}
      </label>
      <select
        id="agc-dh-event"
        className="agc-field"
        data-testid="agc-dh-event"
        value={event}
        onChange={(e) => setEvent(e.target.value as HookEvent)}
      >
        {HOOK_EVENTS.map((e) => (
          <option key={e.id} value={e.id}>
            {tr(e.label)}
          </option>
        ))}
      </select>
      <label className="agc-label" htmlFor="agc-dh-cmd">
        {tr('Command')}
      </label>
      <input
        id="agc-dh-cmd"
        className="agc-field agc-field-mono"
        data-testid="agc-dh-cmd"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-dh-body">
        {tr('What it does')}
      </label>
      <textarea
        id="agc-dh-body"
        className="agc-field agc-field-area"
        data-testid="agc-dh-body"
        rows={6}
        value={draft.body}
        readOnly
      />
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={onBatal}>
          {tr('Discard draft')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid="agc-dh-simpan"
          disabled={!bisa}
          onClick={() => onSimpan({ name: nama.trim(), event, command: command.trim() })}
        >
          {tr('Save (disabled)')}
        </button>
      </div>
    </div>
  );
}

/* ── Instructions ────────────────────────────────────────────────────────── */

/*
 * Instructions: coding standards attached to a file PATTERN.
 *
 * The pane this replaces showed the global rules editor — always-on guidance
 * for the whole repository. That is a different thing: an instruction applies
 * to the files its `applyTo` glob matches, so TypeScript conventions fire when
 * a `.ts` file is open and stay out of the way otherwise. Loading all of them
 * unconditionally would make this feature indistinguishable from the rules it
 * sits next to.
 *
 * The pattern is shown on every row, because that is the whole point of the
 * entry — a reader scanning the list needs to see WHAT it applies to before
 * deciding whether it belongs.
 */
function InstructionRow({ ins, aktif, onBuka }: { ins: InstructionInfo; aktif: boolean; onBuka: () => void }) {
  const tr = useT();
  const hapus = useInstructions((s) => s.hapus);
  const [konfirmasi, setKonfirmasi] = useState(false);

  return (
    <div className={`agc-item${aktif ? ' is-open' : ''}`} data-testid={`agc-ins-${ins.name}`}>
      <div className="agc-item-head">
        <button className="agc-item-toggle" aria-expanded={aktif} onClick={onBuka}>
          <AiIkon name={aktif ? 'chev-down' : 'chev-right'} size={11} />
          <AiIkon name="check" size={14} />
          <span className="agc-item-name">{ins.name}</span>
          <span className="agc-item-scope">{ins.scope}</span>
        </button>
        {konfirmasi ? (
          <>
            <button
              className="btn btn-sm btn-danger"
              data-testid={`agc-ins-del-yes-${ins.name}`}
              onClick={() => void hapus(ins.name)}
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
            data-testid={`agc-ins-del-${ins.name}`}
            title={tr('Delete')}
            aria-label={tr('Delete')}
            onClick={() => setKonfirmasi(true)}
          >
            <AiIkon name="trash" size={13} />
          </button>
        )}
      </div>
      <div className="agc-item-meta">
        <code className="agc-ins-pola">{ins.apply_to || tr('(no pattern set)')}</code>
        <span className="agc-item-bytes">{Math.round((ins.bytes / 1024) * 10) / 10} KB</span>
      </div>
      {aktif && <InstructionEditor ins={ins} />}
    </div>
  );
}

function InstructionEditor({ ins }: { ins: InstructionInfo }) {
  const tr = useT();
  const { isi, memuatIsi, simpan, buka, sibuk } = useInstructions();
  const [pola, setPola] = useState(ins.apply_to);
  const [desc, setDesc] = useState(ins.description);
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    if (memuatIsi) return;
    setBody((lama) => lama ?? isi);
  }, [isi, memuatIsi]);

  useEffect(() => {
    setPola(ins.apply_to);
    setDesc(ins.description);
    setBody(null);
  }, [ins.name, ins.apply_to, ins.description]);

  const kotor =
    body !== null && (pola !== ins.apply_to || desc !== ins.description || body !== isi);

  return (
    <div className="agc-editor" data-testid={`agc-ins-editor-${ins.name}`}>
      {memuatIsi || body === null ? (
        <p className="agc-group-empty">{tr('Loading…')}</p>
      ) : (
        <>
          <label className="agc-label" htmlFor="agc-ins-pola">
            {tr('Applies to (glob)')}
          </label>
          <input
            id="agc-ins-pola"
            className="agc-field agc-field-mono"
            data-testid="agc-ins-pola"
            placeholder="**/*.{ts,tsx}"
            value={pola}
            onChange={(e) => setPola(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-ins-desc">
            {tr('Description')}
          </label>
          <input
            id="agc-ins-desc"
            className="agc-field"
            data-testid="agc-ins-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <label className="agc-label" htmlFor="agc-ins-body">
            {tr('Rules')}
          </label>
          <textarea
            id="agc-ins-body"
            className="agc-field agc-field-area"
            data-testid="agc-ins-body"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="agc-editor-actions">
            <span className="agc-item-path" title={ins.path}>
              {ins.path}
            </span>
            <button className="btn btn-sm" disabled={!kotor || sibuk} onClick={() => buka(ins.name)}>
              {tr('Revert')}
            </button>
            <button
              className="btn btn-sm btn-primary"
              data-testid="agc-ins-simpan"
              disabled={!kotor || sibuk}
              onClick={() =>
                void simpan({
                  name: ins.name,
                  description: desc,
                  applyTo: pola,
                  body,
                  scope: ins.scope,
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

/** The browser for the shipped instruction corpus. */
function KatalogInstructions({ scope }: { scope: 'workspace' | 'global' }) {
  const tr = useT();
  const tf = useTf();
  const daftar = useInstructions((s) => s.daftar);
  const muat = useInstructions((s) => s.muat);
  const [buka, setBuka] = useState(false);
  const [items, setItems] = useState<CatalogInstruction[]>([]);
  const [cari, setCari] = useState('');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!buka || items.length > 0) return;
    instructionCatalogList()
      .then(setItems)
      .catch((e) => setGalat(String(e)));
  }, [buka, items.length]);

  const ada = new Set(daftar.map((d) => d.name.toLowerCase()));
  const q = cari.trim().toLowerCase();
  const tampil = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.applyTo.toLowerCase().includes(q),
      )
    : items;

  const pasang = async (it: CatalogInstruction) => {
    setSibuk(it.id);
    setGalat(null);
    try {
      await instructionInstall(it.id, scope);
      await muat();
    } catch (e) {
      setGalat(String(e));
    } finally {
      setSibuk(null);
    }
  };

  if (!buka) {
    return (
      <div className="agc-ai-aksi">
        <button
          className="btn btn-sm"
          data-testid={`agc-ins-katalog-${scope}`}
          onClick={() => setBuka(true)}
        >
          <AiIkon name="link" size={12} /> {tr('Browse catalog')}
        </button>
      </div>
    );
  }

  return (
    <div className="agc-katalog" data-testid={`agc-ins-katalog-panel-${scope}`}>
      <div className="agc-katalog-head">
        <input
          className="agc-field"
          data-testid="agc-ins-katalog-cari"
          placeholder={tr('Search the catalog…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <span className="agc-katalog-count">{tf('{n} available', { n: tampil.length })}</span>
        <button className="btn btn-sm" onClick={() => setBuka(false)}>
          {tr('Close')}
        </button>
      </div>
      {galat && (
        <p className="agc-error" role="alert">
          {galat}
        </p>
      )}
      <div className="agc-katalog-list">
        {tampil.map((it) => {
          const sudah = ada.has(it.name.toLowerCase());
          return (
            <div className="agc-katalog-row" key={it.id} data-testid={`agc-ins-kat-${it.name}`}>
              <div className="agc-katalog-main">
                <span className="agc-katalog-name">{it.name}</span>
                <code className="agc-ins-pola">{it.applyTo || '(no pattern)'}</code>
                <span className="agc-katalog-desc">{it.description}</span>
              </div>
              <button
                className="btn btn-sm"
                disabled={sudah || sibuk === it.id}
                data-testid={`agc-ins-pasang-${it.name}`}
                onClick={() => void pasang(it)}
              >
                {sudah ? tr('Installed') : sibuk === it.id ? tr('Installing…') : tr('Install')}
              </button>
            </div>
          );
        })}
        {tampil.length === 0 && <p className="agc-group-empty">{tr('Nothing matches that search.')}</p>}
      </div>
    </div>
  );
}

export function AgcInstructions() {
  const tr = useT();
  const { daftar, galat, dibuka, buka, muat, bersihkanGalat } = useInstructions();
  const [baru, setBaru] = useState<'workspace' | 'global' | null>(null);

  useEffect(() => {
    void muat();
  }, [muat]);

  const kelompok: { scope: 'workspace' | 'global'; label: string }[] = [
    { scope: 'workspace', label: 'Workspace' },
    { scope: 'global', label: 'User' },
  ];

  return (
    <div className="agc-pane">
      <h2 className="agc-pane-title">{tr('Instructions')}</h2>
      <p className="agc-pane-desc">
        {tr('Rules that apply to files matching a pattern. Only the ones matching a file you have open are sent to the agent.')}
      </p>

      {galat && (
        <p className="agc-error" data-testid="agc-ins-error" role="alert">
          {galat}
          <button className="btn btn-sm" onClick={bersihkanGalat}>
            {tr('Dismiss')}
          </button>
        </p>
      )}

      {kelompok.map((g) => {
        const list = daftar.filter((x) => x.scope === g.scope);
        return (
          <section className="agc-group" key={g.scope} data-testid={`agc-ins-${g.scope}`}>
            <div className="agc-group-head">
              <span className="agc-group-title">
                {tr(g.label)} <span className="agc-group-count">{list.length}</span>
              </span>
              <button
                className="btn btn-sm"
                data-testid={`agc-ins-add-${g.scope}`}
                onClick={() => setBaru(g.scope)}
              >
                <AiIkon name="plus" size={12} /> {tr('New instruction')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No instructions yet.')}</p>
            ) : (
              list.map((x) => (
                <InstructionRow
                  key={`${x.scope}-${x.name}`}
                  ins={x}
                  aktif={dibuka === x.name}
                  onBuka={() => void buka(dibuka === x.name ? null : x.name)}
                />
              ))
            )}
            <KatalogInstructions scope={g.scope} />
          </section>
        );
      })}

      {baru !== null && <InstructionBaru scope={baru} onSelesai={() => setBaru(null)} />}
    </div>
  );
}

function InstructionBaru({
  scope,
  onSelesai,
}: {
  scope: 'workspace' | 'global';
  onSelesai: () => void;
}) {
  const tr = useT();
  const simpan = useInstructions((s) => s.simpan);
  const sibuk = useInstructions((s) => s.sibuk);
  const [nama, setNama] = useState('');
  const [pola, setPola] = useState('');
  const [desc, setDesc] = useState('');
  const [body, setBody] = useState('');

  const bisa = nama.trim() !== '' && pola.trim() !== '' && body.trim() !== '';

  return (
    <div className="agc-editor" data-testid="agc-ins-baru">
      <label className="agc-label" htmlFor="agc-insb-nama">
        {tr('Name')}
      </label>
      <input
        id="agc-insb-nama"
        className="agc-field"
        data-testid="agc-insb-nama"
        placeholder="typescript-conventions"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-insb-pola">
        {tr('Applies to (glob)')}
      </label>
      <input
        id="agc-insb-pola"
        className="agc-field agc-field-mono"
        data-testid="agc-insb-pola"
        placeholder="**/*.{ts,tsx}"
        value={pola}
        onChange={(e) => setPola(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-insb-desc">
        {tr('Description')}
      </label>
      <input
        id="agc-insb-desc"
        className="agc-field"
        data-testid="agc-insb-desc"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <label className="agc-label" htmlFor="agc-insb-body">
        {tr('Rules')}
      </label>
      <textarea
        id="agc-insb-body"
        className="agc-field agc-field-area"
        data-testid="agc-insb-body"
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="agc-editor-actions">
        <button className="btn btn-sm" onClick={onSelesai} disabled={sibuk}>
          {tr('Cancel')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          data-testid="agc-insb-simpan"
          disabled={!bisa || sibuk}
          onClick={() =>
            void simpan({
              name: nama.trim(),
              description: desc,
              applyTo: pola.trim(),
              body,
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
  const update = useAgentExtras((s) => s.updateHook);
  const [aiHook, setAiHook] = useState<'workspace' | 'user' | null>(null);
  const [draftHook, setDraftHook] = useState<DraftHasil | null>(null);

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

      {/*
        * What actually runs, said before the list rather than under it.
        *
        * The runner exists now, but only for the two SESSION events — see
        * `hookRuntime.ts` for why the other three are deliberately unwired. The
        * note therefore states which are live instead of claiming the whole
        * feature is off, because a reader who sets a `before-tool` hook and sees
        * nothing happen needs to know that is expected rather than broken.
        */}
      <p className="agc-warn" data-testid="agc-hooks-status" role="note">
        {tr('Only “Session starts” and “Session ends” run. The other events are stored but not fired yet, because running a command between your approval and the action it approved would defeat the gate.')}
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
                data-testid={`agc-hook-ai-${g.scope}`}
                title={tr('Draft a hook from a description')}
                onClick={() => {
                  setAiHook(g.scope);
                  setDraftHook(null);
                }}
              >
                <AiIkon name="thought" size={12} /> {tr('Create with AI')}
              </button>
              <button
                className="btn btn-sm"
                data-testid={`agc-hook-add-${g.scope}`}
                onClick={() => {
                  add(g.scope);
                  setAiHook(null);
                }}
              >
                <AiIkon name="plus" size={12} /> {tr('New Hook')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="agc-group-empty">{tr('No hooks yet.')}</p>
            ) : (
              list.map((h) => <HookRow key={h.id} hook={h} />)
            )}
            {aiHook === g.scope && (
              <PanelAi
                kind="hook"
                onDraft={setDraftHook}
                onBatal={() => {
                  setAiHook(null);
                  setDraftHook(null);
                }}
              />
            )}
            {aiHook === g.scope && draftHook && (
              <DraftHook
                draft={draftHook}
                onSimpan={(patch) => {
                  /*
                   * Saved DISABLED, always. A hook is a command that runs on the
                   * reader's machine, and one that arrived from a model must be
                   * read before it is armed — so this writes the draft with
                   * `enabled: false` and the reader turns it on themselves after
                   * seeing the event and the command. Nothing here executes it
                   * either way: there is no runner.
                   */
                  const id = add(g.scope);
                  update(id, { ...patch, enabled: false });
                  setAiHook(null);
                  setDraftHook(null);
                }}
                onBatal={() => setDraftHook(null)}
              />
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
