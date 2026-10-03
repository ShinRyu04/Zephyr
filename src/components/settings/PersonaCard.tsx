import { useEffect } from 'react';
import { useT } from '../../lib/i18n';
import { usePersona } from '../../lib/personaStore';

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
                <span className="persona-nama">
                  {/*
                   * The active persona is marked with a word as well as a
                   * colour. A tinted row alone fails the readers who cannot
                   * separate the tint from the panel behind it, and it is the
                   * same blue the sidebar uses for "currently selected".
                   */}
                  {hidup && <span className="persona-aktif-tanda">{tr('Aktif')}</span>}
                  {tr(p.nama)}
                  {p.bawaan && <span className="subagent-tag">{tr('Persona: bawaan')}</span>}
                </span>
                <span className="persona-ket">{tr(p.deskripsi)}</span>
              </button>
              <div className="persona-aksi">
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
