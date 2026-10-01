import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { isDestructive } from '../../lib/aiStore';

/*
 * The allow-list of commands the agent may run without asking again.
 *
 * This used to live inside PromptSection.tsx, which was wrong on two counts:
 * it is not prompt text (it never reaches the model - it gates the tool call
 * before it happens), and burying a safety control inside a panel named
 * "Prompt AI" made it invisible to anyone looking for it. It now has its own
 * section so the thing that can widen what the agent may run is where you
 * would look for it.
 *
 * Destructive commands stay refused here on purpose: the check below is a
 * second gate behind `isDestructive`, and the agent asks again for anything
 * that matches. There is no way to switch that net off from this panel.
 */
export default function CommandPermissions() {
  const tr = useT();

  const daftar = useStore((s) => s.settings.allowCommands) ?? [];
  const applySettings = useStore((s) => s.applySettings);
  const [draft, setDraft] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);

  const tambah = () => {
    const v = draft.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (v.length < 3) {
      setPesan(
        tr('This command is too short - write something more specific (e.g. "npm run build", not "n").'),
      );
      return;
    }
    if (isDestructive(v)) {
      setPesan(tr('Destructive commands cannot be added to the allow list.'));
      return;
    }
    if (daftar.includes(v)) {
      setPesan(tr('Already in the list.'));
      return;
    }
    setPesan(null);
    setDraft('');
    void applySettings({ allowCommands: [...daftar, v] } as never);
  };

  const hapus = (v: string) =>
    void applySettings({ allowCommands: daftar.filter((x) => x !== v) } as never);

  return (
    <div className="sp-root" data-testid="prompt-section">
      <h2 className="set-h2">{tr('Command permissions')}</h2>
      <p className="set-note">
        {tr(
          'Commands that are always allowed without asking again. Destructive commands (recursive delete, hard reset) are STILL asked - that safety net cannot be turned off from here.',
        )}
      </p>

      <div className="sp-bagian" data-testid="sp-izin">
        <div className="sp-bagian-head">
          <span className="sp-bagian-judul">{tr('Command permissions')}</span>
          <span className="sp-spacer" />
          <span className="sp-badge" data-testid="sp-izin-jumlah">
            {daftar.length}
          </span>
        </div>

        <div className="sp-tambah">
          <input
            type="text"
            className="sp-input"
            data-testid="sp-izin-input"
            placeholder={tr('Add a command…')}
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setPesan(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') tambah();
            }}
          />
          <button className="btn btn-sm" data-testid="sp-izin-tambah" onClick={tambah}>
            {tr('Add')}
          </button>
        </div>
        {pesan && (
          <p className="sp-pesan" data-testid="sp-izin-pesan">
            {pesan}
          </p>
        )}

        {daftar.length === 0 ? (
          <p className="sp-kosong" data-testid="sp-izin-kosong">
            {tr('No allowed commands yet.')}
          </p>
        ) : (
          <div className="sp-daftar" data-testid="sp-izin-daftar">
            {daftar.map((v) => (
              <div className="sp-item" key={v} data-testid="sp-izin-item" data-izin={v}>
                <code className="sp-item-kode">{v}</code>
                <button
                  className="sp-item-x"
                  data-testid="sp-izin-hapus"
                  title={tr('Remove permission')}
                  aria-label={tr('Remove permission')}
                  onClick={() => hapus(v)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
