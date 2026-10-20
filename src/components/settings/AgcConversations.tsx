/*
 * Conversations â€” the page TRAE calls "Conversation", inside Agent Customizations.
 *
 * WHAT IT IS: a page of SETTINGS about how a conversation behaves, not a list of
 * past chats. That distinction was the single most expensive misunderstanding in
 * this file's history â€” an earlier version was a two-column history browser,
 * which is a different feature. The evidence that settled it: TRAE registers this
 * page as `AIConversationSettings`, its content is a stack of `*Enabled` flags,
 * and the six sections below are what its own screenshots show.
 *
 * THE SIX SECTIONS, in TRAE's order:
 *
 *   1. To-Do List                    [IDE] [Agent]
 *   2. Auto Fix Lints                [IDE] [Agent]
 *   3. Agent Questioning Proactively [IDE] [Agent]
 *   4. Code Review                   Review Scope + Jump to next change
 *   5. Terminal Tool Preferences     Terminal Environment + Auto Open
 *   6. Task Status Notification      Banner + Sound + Volume + 3 sounds
 *
 * WHY EVERY FEATURE CARRIES TWO SWITCHES: a conversation runs in two different
 * places - the EDITOR (the AI panel in the main window) and the AGENTS window
 * (an external agent CLI in a pane). They are separate execution paths, so
 * enabling auto-fix for the editor must not silently enable it for an external
 * agent's pane. One switch for both would be a promise the app cannot keep.
 *
 * The right-hand column is labelled "Agent", not TRAE's "SOLO": Zephyr has no
 * separate SOLO mode, only the editor and the Agents window. The settings keys
 * still say `*Solo` for compatibility with saved data - the label is the only
 * thing that changed.
 *
 * WHY HISTORY IS A SECOND TAB: the old page showed the reader's past sessions and
 * the notifications Zephyr sent. That is genuinely useful, and deleting it to make
 * room for settings would trade one missing feature for another. It is kept, as
 * the second tab, with the actions TRAE's own history list offers (clear all,
 * rename, export, delete).
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { riwayatNotifikasi } from '../../lib/notifikasiAi';

type Tab = 'setelan' | 'riwayat' | 'notifikasi';

/* â”€â”€ Small building blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/*
 * One section: heading and description on the LEFT, controls in a RIGHT column.
 *
 * TRAE's own layout, measured from its screenshots (855px page):
 *   heading x=17, description x=33 wrapping before ~580px
 *   IDE switch label x=725, Agent x=709 and 38px BELOW it
 *
 * So the controls sit BESIDE the text and are STACKED, not side by side under it.
 *
 * Every section keeps its controls in that right-hand column - there is no
 * per-section escape hatch. A select simply stacks its label above it inside
 * the column instead of forcing the section into a different shape.
 */
function Bagian({
  judul,
  ket,
  children,
  testid,
  kiriBawah,
}: {
  judul: string;
  ket?: string;
  children: React.ReactNode;
  testid: string;
  /*
   * Extra content under the description, in the LEFT column.
   *
   * The Volume slider lives here rather than in the control column: it is a value
   * with a range, not an on/off state, and putting it beside two switches made that
   * column read as three unrelated things. Under the description it stays with the
   * text that explains it.
   */
  kiriBawah?: React.ReactNode;
}) {
  return (
    <section className="conv-set" data-testid={testid}>
      <div className="conv-set-teks">
        <h3 className="conv-set-judul">{judul}</h3>
        {ket && <p className="conv-set-ket">{ket}</p>}
        {kiriBawah && <div className="conv-set-kiri-bawah">{kiriBawah}</div>}
      </div>
      <div className="conv-set-kontrol">{children}</div>
    </section>
  );
}

/*
 * A labelled on/off switch.
 *
 * A real <button role="switch"> rather than a styled checkbox: the accessible
 * name, the checked state and the keyboard behaviour all come for free, and this
 * page has thirteen of them â€” a hand-rolled version would get one of those wrong
 * thirteen times.
 */
function Saklar({
  label,
  checked,
  onChange,
  testid,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testid}
      className={`conv-saklar${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="conv-saklar-teks">{label}</span>
      <span className="conv-saklar-jalur" aria-hidden="true">
        <span className="conv-saklar-bulat" />
      </span>
    </button>
  );
}

/*
 * A select whose options can carry a second line of explanation.
 *
 * The explanation is shown under the control rather than inside the option,
 * because a native <option> cannot hold two lines â€” and the description is what
 * makes "Efficient Terminal" vs "System Terminal" a decision instead of a guess.
 */
function Pilih({
  label,
  value,
  options,
  onChange,
  testid,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; ket?: string }>;
  onChange: (v: string) => void;
  testid: string;
}) {
  const aktif = options.find((o) => o.value === value);
  return (
    <div className="conv-pilih-baris">
      <span className="conv-pilih-label">{label}</span>
      <select
        className="conv-pilih"
        data-testid={testid}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {aktif?.ket && <span className="conv-pilih-ket">{aktif.ket}</span>}
    </div>
  );
}

export default function AgcConversations() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('setelan');
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const conv = useStore((s) => s.settings.conversation);
  const apply = useStore((s) => s.applySettings);

  const sessions = useAi((s) => s.sessions);
  const aktifId = useAi((s) => s.activeIds?.[''] ?? null);
  const selectChat = useAi((s) => s.selectChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const renameChat = useAi((s) => s.renameChat);

  const [riwayat, setRiwayat] = useState(() => riwayatNotifikasi());
  useEffect(() => {
    setRiwayat(riwayatNotifikasi());
  }, [tab]);

  /*
   * One writer for every switch.
   *
   * `apply` merges into the pending settings payload, so thirteen controls that
   * each write one key still become a single disk write. Writing the whole
   * `conversation` object each time would be equivalent but would make every
   * handler depend on the current value of the other twelve.
   */
  const set = (patch: Partial<NonNullable<typeof conv>>) =>
    void apply({ conversation: { ...(conv ?? {}), ...patch } } as never);

  const daftarSesi = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (sessions ?? [])
      .filter((s) => !q || (s.title ?? '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [sessions, cari]);

  const terpilih = useMemo(() => {
    const semua = sessions ?? [];
    const id = pilih ?? aktifId;
    const langsung = semua.find((s) => s.id === id);
    if (langsung && (langsung.messages ?? []).length > 0) return langsung;
    const berisi = semua
      .filter((s) => (s.messages ?? []).length > 0)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    return langsung ?? berisi ?? null;
  }, [sessions, pilih, aktifId]);

  const waktu = (ms?: number) => {
    if (!ms) return '';
    const hari = Math.floor((Date.now() - ms) / 86_400_000);
    if (hari === 0)
      return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (hari === 1) return tr('Yesterday');
    if (hari < 7) return `${hari} ${tr('days ago')}`;
    return new Date(ms).toLocaleDateString();
  };

  const potong = (t: string, n = 180) => (t.length > n ? t.slice(0, n).trimEnd() + 'â€¦' : t);

  const c = conv ?? {
    todoListIde: false,
    todoListSolo: false,
    autoFixIde: false,
    autoFixSolo: false,
    questioningIde: false,
    questioningSolo: false,
    reviewScope: 'all' as const,
    reviewJump: true,
    terminalEnv: 'efficient' as const,
    terminalAutoOpen: 'never' as const,
    notifBanner: true,
    notifSound: false,
    notifVolume: 100,
    soundCompleted: 'default',
    soundWaiting: 'default',
    soundStopped: 'default',
  };

  return (
    <div className="agc-pane agset-pane conv" data-testid="agx-conv">
      <div className="conv-kepala">
        <h2 className="agc-pane-title" style={{ marginBottom: 0 }}>
          {tr('Conversation')}{' '}
          <span
            className="agset-tanya"
            title={tr('How a conversation behaves, in the editor and in the Agents window.')}
          >
            ?
          </span>
        </h2>
        <div className="conv-kepala-kanan">
          {tab === 'riwayat' && (sessions ?? []).length > 0 && (
            <button
              type="button"
              className="agset-btn-batal conv-clear"
              data-testid="agx-conv-clear-all"
              title={tr('Clear all conversations')}
              onClick={() => {
                if (!window.confirm(tr('Delete all conversations? This cannot be undone.'))) return;
                for (const s of sessions ?? []) deleteChat(s.id);
                setPilih(null);
                setPesan(tr('All conversations cleared.'));
              }}
            >
              {tr('Clear All')}
            </button>
          )}
          <div className="agset-seg" role="tablist" data-testid="agx-conv-tab">
            {(
              [
                ['setelan', 'Settings'],
                ['riwayat', 'History'],
                ['notifikasi', 'Notifications'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`agset-seg-btn${tab === id ? ' is-on' : ''}`}
                data-testid={`agx-conv-${id}`}
                onClick={() => setTab(id)}
              >
                {tr(label)}
                {id === 'riwayat' && (
                  <span className="agset-seg-jml">{(sessions ?? []).length}</span>
                )}
                {id === 'notifikasi' && <span className="agset-seg-jml">{riwayat.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pesan && (
        <p className="aim-pesan" data-testid="agx-conv-pesan" role="status">
          {pesan}
        </p>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â• TAB 1: SETELAN â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === 'setelan' && (
        <div className="conv-setelan" data-testid="agx-conv-setelan">
          {/*
            * IDE vs Agent is explained ONCE, at the top, instead of beside every
            * switch. Thirteen repetitions of the same two-word legend would be
            * noise; one line tells the reader what the two columns mean.
            *
            * "Agent" rather than TRAE's "SOLO": Zephyr has no SOLO mode - the two
            * columns are the editor's chat panel and the Agents window.
            */}
          <p className="conv-legend">
            <strong>IDE</strong> {tr('= the editor')} · <strong>{tr('Agent')}</strong>{' '}
            {tr('= the Agents window')}
          </p>

          <Bagian
            judul={tr('To-Do List')}
            ket={tr('Allow the agent to use lists to track progress.')}
            testid="agx-conv-todo"
          >
            <div className="conv-dua">
              <Saklar
                label="IDE"
                checked={c.todoListIde}
                onChange={(v) => set({ todoListIde: v })}
                testid="agx-conv-todo-ide"
              />
              <Saklar
                label={tr('Agent')}
                checked={c.todoListSolo}
                onChange={(v) => set({ todoListSolo: v })}
                testid="agx-conv-todo-solo"
              />
            </div>
          </Bagian>

          <Bagian
            judul={tr('Auto Fix Lints')}
            ket={tr(
              'Run the project linter on files the agent changed and fix what can be fixed automatically. Problems it cannot fix are handed back to the agent.',
            )}
            testid="agx-conv-lint"
          >
            <div className="conv-dua">
              <Saklar
                label="IDE"
                checked={c.autoFixIde}
                onChange={(v) => set({ autoFixIde: v })}
                testid="agx-conv-lint-ide"
              />
              <Saklar
                label={tr('Agent')}
                checked={c.autoFixSolo}
                onChange={(v) => set({ autoFixSolo: v })}
                testid="agx-conv-lint-solo"
              />
            </div>
          </Bagian>

          <Bagian
            judul={tr('Agent Questioning Proactively')}
            ket={tr(
              'Allows the agent to proactively ask you questions when the task is unclear, clarify requirement details, and guide execution accordingly.',
            )}
            testid="agx-conv-tanya"
          >
            <div className="conv-dua">
              <Saklar
                label="IDE"
                checked={c.questioningIde}
                onChange={(v) => set({ questioningIde: v })}
                testid="agx-conv-tanya-ide"
              />
              <Saklar
                label={tr('Agent')}
                checked={c.questioningSolo}
                onChange={(v) => set({ questioningSolo: v })}
                testid="agx-conv-tanya-solo"
              />
            </div>
          </Bagian>

          <Bagian
            judul={tr('Code Review')}
            ket={tr(
              'AI-generated code is written to disk. During review you choose to keep or undo the changes.',
            )}
            testid="agx-conv-review"
          >
            <Pilih
              label={tr('Review Scope')}
              value={c.reviewScope}
              onChange={(v) => set({ reviewScope: v as 'all' | 'latest' | 'none' })}
              testid="agx-conv-review-scope"
              options={[
                {
                  value: 'all',
                  label: tr('Review all changes'),
                  ket: tr('You can undo or keep all AI-generated code changes.'),
                },
                {
                  value: 'latest',
                  label: tr('Review latest changes'),
                  ket: tr(
                    'You can undo or keep only the changes from the latest conversation. Once you send a new message, undo is no longer available.',
                  ),
                },
                {
                  value: 'none',
                  label: tr('No Review Needed'),
                  ket: tr('Undo is not available. All AI-generated code changes are kept automatically.'),
                },
              ]}
            />
            <div className="conv-dua" style={{ marginTop: 10 }}>
              <Saklar
                label={tr('Jump to next change after review')}
                checked={c.reviewJump}
                onChange={(v) => set({ reviewJump: v })}
                testid="agx-conv-review-jump"
              />
            </div>
          </Bagian>

          <Bagian
            judul={tr('Terminal Tool Preferences')}
            ket={tr('Configure the terminal environment used when the agent executes commands.')}
            testid="agx-conv-terminal"
          >
            <Pilih
              label={tr('Terminal Environment')}
              value={c.terminalEnv}
              onChange={(v) => set({ terminalEnv: v as 'efficient' | 'system' })}
              testid="agx-conv-terminal-env"
              options={[
                {
                  value: 'efficient',
                  label: tr('Efficient Terminal'),
                  ket: tr('Faster startup, no user intervention required, more stable execution.'),
                },
                {
                  value: 'system',
                  label: tr('System Terminal'),
                  ket: tr('Suitable for scenarios where users need to interact directly.'),
                },
              ]}
            />
            <Pilih
              label={tr('Auto Open Original Terminal on Command Execution')}
              value={c.terminalAutoOpen}
              onChange={(v) =>
                set({ terminalAutoOpen: v as 'always' | 'background' | 'never' })
              }
              testid="agx-conv-terminal-open"
              options={[
                { value: 'always', label: tr('Always') },
                { value: 'background', label: tr('Only for background commands') },
                { value: 'never', label: tr('Never') },
              ]}
            />
          </Bagian>

          <Bagian
            judul={tr('Task Status Notification')}
            ket={tr(
              'Get alerted when a task is completed or fails. Turn on notifications in Windows Settings for them to appear.',
            )}
            testid="agx-conv-notif"
            kiriBawah={
              /*
               * Volume sits under the description, in the LEFT column: it is a value
               * with a range, not an on/off state, so putting it beside the Banner
               * and Sound switches made that column read as three unrelated things.
               * Here it stays with the text that explains what it controls.
               */
              <div className="conv-volume-baris">
                <span className="conv-pilih-label">{tr('Volume')}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="conv-volume"
                  data-testid="agx-conv-notif-volume"
                  aria-label={tr('Volume')}
                  value={c.notifVolume}
                  onChange={(e) => set({ notifVolume: Number(e.target.value) })}
                />
                <span className="conv-volume-angka">{c.notifVolume}%</span>
              </div>
            }
          >
            <div className="conv-dua">
              <Saklar
                label={tr('Banner')}
                checked={c.notifBanner}
                onChange={(v) => set({ notifBanner: v })}
                testid="agx-conv-notif-banner"
              />
              <Saklar
                label={tr('Sound')}
                checked={c.notifSound}
                onChange={(v) => set({ notifSound: v })}
                testid="agx-conv-notif-sound"
              />
            </div>

            {/*
              * One sound per OUTCOME, not one sound for all of them. "Finished" and
              * "stopped abnormally" must be distinguishable without looking, which
              * is the whole reason a sound is used instead of a banner.
              */}
            <Pilih
              label={tr('Task Completed')}
              value={c.soundCompleted}
              onChange={(v) => set({ soundCompleted: v })}
              testid="agx-conv-sound-completed"
              options={[
                { value: 'default', label: tr('Default') },
                { value: 'chime', label: tr('Chime') },
                { value: 'bell', label: tr('Bell') },
                { value: 'none', label: tr('None') },
              ]}
            />
            <Pilih
              label={tr('Waiting for Action')}
              value={c.soundWaiting}
              onChange={(v) => set({ soundWaiting: v })}
              testid="agx-conv-sound-waiting"
              options={[
                { value: 'default', label: tr('Default') },
                { value: 'chime', label: tr('Chime') },
                { value: 'bell', label: tr('Bell') },
                { value: 'none', label: tr('None') },
              ]}
            />
            <Pilih
              label={tr('Abnormally Stopped')}
              value={c.soundStopped}
              onChange={(v) => set({ soundStopped: v })}
              testid="agx-conv-sound-stopped"
              options={[
                { value: 'default', label: tr('Default') },
                { value: 'chime', label: tr('Chime') },
                { value: 'bell', label: tr('Bell') },
                { value: 'none', label: tr('None') },
              ]}
            />
          </Bagian>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â• TAB 2: RIWAYAT â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === 'riwayat' && (
        <div className="conv-grid">
          <div className="conv-kiri">
            <input
              className="conv-cari"
              data-testid="agx-conv-cari"
              placeholder={tr('Search conversationsâ€¦')}
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
            {daftarSesi.length === 0 ? (
              <div className="agset-kosong" data-testid="agx-conv-kosong">
                <span className="agset-kosong-ikon" aria-hidden="true">
                  <AiIkon name="comment" size={18} />
                </span>
                <span>
                  {cari.trim() ? tr('Nothing matches that search.') : tr('No conversations yet.')}
                </span>
              </div>
            ) : (
              <div className="conv-daftar" data-testid="agx-conv-daftar">
                {daftarSesi.map((s) => {
                  const iniPilih = (pilih ?? aktifId) === s.id;
                  const aktifIni = s.id === aktifId;
                  return (
                    <div
                      key={s.id}
                      className={`conv-item${iniPilih ? ' is-on' : ''}`}
                      data-testid={`agx-conv-${s.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPilih(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPilih(s.id);
                        }
                      }}
                    >
                      <span className="conv-item-teks">
                        <span className="conv-item-judul">
                          {s.title || tr('Untitled')}
                          {/*
                            * `(Active)` after the title, as TRAE does it
                            * (`description: isActive ? "(Active)" : ""`). It is the
                            * only marker saying which conversation is open now.
                            */}
                          {aktifIni && <span className="conv-item-aktif">{tr('(Active)')}</span>}
                        </span>
                        <span className="conv-item-meta">
                          {(s.messages ?? []).length} {tr('messages')} Â· {waktu(s.createdAt)}
                        </span>
                      </span>
                      {/*
                        * Per-row actions, matching TRAE's set:
                        *   active   -> [rename]
                        *   inactive -> [rename, export, delete]
                        *
                        * An active conversation gets fewer buttons because deleting
                        * or exporting the chat you are standing in from a list is a
                        * footgun; both remain available in the detail pane.
                        */}
                      <span className="conv-item-aksi" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="conv-ikon-btn"
                          data-testid={`agx-conv-ganti-nama-${s.id}`}
                          title={tr('Rename')}
                          onClick={() => {
                            const baru = window.prompt(tr('New title'), s.title || '');
                            if (baru === null) return;
                            renameChat(s.id, baru.trim());
                            setPesan(tr('Title updated.'));
                          }}
                        >
                          <AiIkon name="doc-edit" size={12} />
                        </button>
                        {!aktifIni && (
                          <>
                            <button
                              type="button"
                              className="conv-ikon-btn"
                              data-testid={`agx-conv-ekspor-baris-${s.id}`}
                              title={tr('Export as Markdown')}
                              onClick={() => {
                                const teks = [
                                  `# ${s.title || tr('Untitled')}`,
                                  '',
                                  ...(s.messages ?? []).map(
                                    (m) =>
                                      `**${m.role === 'user' ? tr('You') : tr('Assistant')}**\n\n${String(
                                        (m as { content?: string }).content ?? '',
                                      )}\n`,
                                  ),
                                ].join('\n');
                                void navigator.clipboard.writeText(teks);
                                setPesan(tr('Conversation copied to the clipboard.'));
                              }}
                            >
                              <AiIkon name="export" size={12} />
                            </button>
                            <button
                              type="button"
                              className="conv-ikon-btn is-hapus"
                              data-testid={`agx-conv-hapus-baris-${s.id}`}
                              title={tr('Delete')}
                              onClick={() => {
                                deleteChat(s.id);
                                if (pilih === s.id) setPilih(null);
                                setPesan(tr('Conversation deleted.'));
                              }}
                            >
                              <AiIkon name="trash" size={12} />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="conv-kanan" data-testid="agx-conv-detail">
            {!terpilih ? (
              <div className="agset-kosong">
                <span className="agset-kosong-ikon" aria-hidden="true">
                  <AiIkon name="comment" size={18} />
                </span>
                <span>{tr('Pick a conversation to read it.')}</span>
              </div>
            ) : (
              <>
                <div className="conv-detail-kepala">
                  <div className="conv-detail-teks">
                    <span className="conv-detail-judul">{terpilih.title || tr('Untitled')}</span>
                    <span className="conv-detail-meta">
                      {(terpilih.messages ?? []).length} {tr('messages')} Â·{' '}
                      {waktu(terpilih.createdAt)}
                      {terpilih.id === aktifId && (
                        <span className="agset-chip-kecil">{tr('open in chat')}</span>
                      )}
                    </span>
                  </div>
                  <div className="conv-detail-aksi">
                    <button
                      type="button"
                      className="agset-btn-batal"
                      data-testid={`agx-conv-ekspor-${terpilih.id}`}
                      title={tr('Copy this conversation as Markdown')}
                      onClick={() => {
                        const teks = [
                          `# ${terpilih.title || tr('Untitled')}`,
                          '',
                          ...(terpilih.messages ?? []).map(
                            (m) =>
                              `**${m.role === 'user' ? tr('You') : tr('Assistant')}**\n\n${String(
                                (m as { content?: string }).content ?? '',
                              )}\n`,
                          ),
                        ].join('\n');
                        void navigator.clipboard.writeText(teks);
                        setPesan(tr('Conversation copied to the clipboard.'));
                      }}
                    >
                      {tr('Export')}
                    </button>
                    <button
                      type="button"
                      className="agset-btn-utama"
                      data-testid={`agx-conv-buka-${terpilih.id}`}
                      onClick={() => selectChat(terpilih.id)}
                    >
                      {tr('Open')}
                    </button>
                    <button
                      type="button"
                      className="agset-btn-batal"
                      data-testid={`agx-conv-hapus-${terpilih.id}`}
                      onClick={() => {
                        deleteChat(terpilih.id);
                        setPilih(null);
                        setPesan(tr('Conversation deleted.'));
                      }}
                    >
                      {tr('Delete')}
                    </button>
                  </div>
                </div>

                <div className="conv-isi" data-testid="agx-conv-isi">
                  {(terpilih.messages ?? []).length === 0 ? (
                    <p className="aim-muted">{tr('This conversation is empty.')}</p>
                  ) : (
                    (terpilih.messages ?? []).slice(-8).map((m, i) => (
                      <div className={`conv-pesan is-${m.role}`} key={`${m.role}-${i}`}>
                        <span className="conv-pesan-peran">
                          {m.role === 'user' ? tr('You') : tr('Assistant')}
                        </span>
                        <span className="conv-pesan-isi">
                          {potong(String((m as { content?: string }).content ?? ''))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â• TAB 3: NOTIFIKASI â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === 'notifikasi' && (
        <>
          <p className="aim-muted" style={{ marginBottom: 10 }}>
            {tr(
              'Zephyr only notifies when a run took longer than 20 seconds AND this window was not focused. Both conditions are shown per row, so a missing notification is explained rather than mysterious.',
            )}
          </p>

          {riwayat.length === 0 ? (
            <div className="agset-kosong" data-testid="agx-conv-notif-kosong">
              <span className="agset-kosong-ikon" aria-hidden="true">
                <AiIkon name="warn" size={18} />
              </span>
              <span>
                {tr(
                  'No notification has been decided yet this session. Finish a run that takes over 20 seconds.',
                )}
              </span>
            </div>
          ) : (
            <div className="skc-daftar" data-testid="agx-conv-notif-daftar">
              {riwayat
                .slice()
                .reverse()
                .map((n, i) => {
                  const terkirim = n.lama >= 20_000 && !n.fokus;
                  return (
                    <div className="skc-baris" key={`${n.judul}-${i}`} data-testid="agx-conv-notif">
                      <span className="skc-ikon" aria-hidden="true">
                        <AiIkon name={terkirim ? 'check' : 'clock'} size={14} />
                      </span>
                      <div className="skc-teks">
                        <span className="skc-nama">{n.judul}</span>
                        <span className="skc-ket">{n.isi}</span>
                      </div>
                      <span className={`agset-chip-kecil${terkirim ? ' is-on' : ''}`}>
                        {terkirim
                          ? tr('sent')
                          : n.fokus
                            ? tr('skipped Â· window focused')
                            : tr('skipped Â· run too short')}
                      </span>
                      <span className="aim-ctx">{Math.round(n.lama / 1000)}s</span>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

