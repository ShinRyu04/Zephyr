import { useEffect } from 'react';
import { useT } from '../../lib/i18n';
import { usePersona } from '../../lib/personaStore';
import { ikonPersona } from '../../lib/subagentIcons';

/*
 * Persona picker.
 *
 * The list is radio-like rather than a toggle list: exactly one persona is
 * active at a time, so two "on" rows would be a lie. A built-in row shows a
 * read-only tag and offers NOTHING else - it cannot be edited, duplicated, or
 * deleted.
 *
 * Editing and duplicating were removed at the user's request, and the reason the
 * removal is right goes beyond taste: a built-in persona stores its name and
 * description as i18n KEYS. Letting anyone edit one meant writing a translated
 * sentence back over that key, so the persona froze in whatever language it
 * happened to be edited in - it stopped following the app language, and the
 * loss was silent. A row you cannot edit cannot lose its translations.
 *
 * Kept in its own file so the section that hosts it does not re-render on every
 * settings write.
 */

function PersonaCard() {
  const tr = useT();
  const daftar = usePersona((s) => s.daftar);
  const aktif = usePersona((s) => s.aktif);
  const muat = usePersona((s) => s.muat);
  const setAktif = usePersona((s) => s.setAktif);
  const hapus = usePersona((s) => s.hapus);

  /*
   * `bukaBaru`, `bukaSunting`, `duplikat`, `sunting`, `baru`, and `tutup` are
   * deliberately NOT taken.
   *
   * Removing the buttons alone would not have been enough: as long as the store
   * still exposes the path, anything can call it - including devBridge - and the
   * editor would open again. The store is left intact because `simpan` and the
   * migration that reads old personas still need it; what is gone is every way
   * IN.
   */

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <div className="persona-kartu" data-testid="persona-card">
      <div className="subagent-kartu-head">
        <div className="set-row-label">
          <span className="set-h2-sub">{tr('Persona')}</span>
          <span className="set-hint">
            {tr(
              'How the AI carries itself. A persona only changes the way it talks and thinks, the tool list, project rules, and your own instructions still apply.',
            )}
          </span>
          {/*
            * The "how to use" block.
            *
            * This used to point at a "Duplicate" button, which no longer exists.
            * Instructions that name a control the reader cannot find are worse
            * than no instructions: they send the reader hunting for something
            * that was removed on purpose.
            */}
          <span className="set-hint persona-cara" data-testid="persona-cara">
            {tr(
              'How to use it: click a persona row to make it active, it applies to the next chat, no restart needed. The built-in personas cannot be edited, duplicated, or deleted. If unsure, leave "Zeph" active: that is Zephyr\'s built-in orchestrator with nothing added.',
            )}
          </span>
        </div>
      </div>

      <div data-testid="persona-daftar">
        {daftar.map((p) => {
          const hidup = p.id === aktif;
          const ik = ikonPersona(p.id);
          return (
            <div
              className={`persona-baris${hidup ? ' is-aktif' : ''}`}
              key={p.id}
              data-testid={`persona-${p.id}`}
            >
              <button
                className="persona-pilih"
                data-testid={`persona-${p.id}-pilih`}
                aria-pressed={hidup}
                onClick={() => void setAktif(p.id)}
              >
                {/*
                 * The role mark, drawn from the shared sub-agent icon set so
                 * this row cannot drift away from the glyphs used everywhere
                 * else. It is the first thing in the row because it is what
                 * makes the row recognisable at a glance: six personas with
                 * near-identical one-line descriptions are hard to tell apart by
                 * reading, and the shape answers "which one is the reviewer"
                 * before the name is read.
                 *
                 * `aria-hidden` because it carries no information the name does
                 * not already carry - announcing "kaum" before every persona
                 * name would be noise for a screen reader.
                 */}
                <span className="persona-ikon" data-ikon={ik.id} aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ik.d} />
                    {ik.dFill && <path d={ik.dFill} fill="currentColor" stroke="none" />}
                  </svg>
                </span>
                <span className="persona-teks">
                  <span className="persona-nama">
                    {tr(p.nama)}
                    {p.bawaan && <span className="subagent-tag">{tr('Persona: bawaan')}</span>}
                  </span>
                  <span className="persona-ket">{tr(p.deskripsi)}</span>
                </span>
              </button>
              <div className="persona-aksi">
                {/*
                 * The state of the row, as a control rather than a badge.
                 *
                 * The old design put the word "Aktif" next to the name and left
                 * the row itself as the only way to change it. That reads fine
                 * once you know, but a badge is not obviously a button, so
                 * "how do I pick a different one" had no visible answer.
                 *
                 * Now the active row shows a tick and the word, and every other
                 * row shows the action that would make it active: "Use agent".
                 * The same slot answers both "which is on" and "how do I turn
                 * one on", and it keeps the word as well as the colour because
                 * a tint alone is invisible to some readers.
                 */}
                {hidup ? (
                  <span className="persona-aktif-btn" data-testid={`persona-${p.id}-aktif`}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M13.4 4.4 6.4 11.4 2.6 7.6" />
                    </svg>
                    {tr('Active')}
                  </span>
                ) : (
                  <button
                    className="btn btn-sm"
                    data-testid={`persona-${p.id}-pakai`}
                    onClick={() => void setAktif(p.id)}
                  >
                    {tr('Use agent')}
                  </button>
                )}
                {/*
                 * Only a built-in row gets an empty action cell; a persona the
                 * user made themselves can still be deleted, because removing
                 * that would leave rows that cannot be got rid of.
                 */}
                {!p.bawaan && (
                  <button
                    className="btn btn-sm"
                    data-testid={`persona-${p.id}-hapus`}
                    onClick={() => void hapus(p.id)}
                  >
                    {tr('Subagent: delete')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default PersonaCard;
