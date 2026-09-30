import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import { usePersona, type Persona } from '../../lib/personaStore';

/*
 * Persona picker and editor.
 *
 * The list is radio-like rather than a toggle list: exactly one persona is
 * active at a time, so two "on" rows would be a lie. A built-in row shows a
 * read-only tag instead of a delete button and offers "Duplicate", which is the
 * only way to start from a built-in without losing it.
 *
 * Kept in its own file because the editor holds local form state and the
 * section it lives in re-renders on every settings write.
 */

function PersonaCard() {
  const tr = useT();
  const daftar = usePersona((s) => s.daftar);
  const aktif = usePersona((s) => s.aktif);
  const muat = usePersona((s) => s.muat);
  const setAktif = usePersona((s) => s.setAktif);
  const bukaBaru = usePersona((s) => s.bukaBaru);
  const bukaSunting = usePersona((s) => s.bukaSunting);
  const hapus = usePersona((s) => s.hapus);
  const duplikat = usePersona((s) => s.duplikat);
  const sunting = usePersona((s) => s.sunting);
  const baru = usePersona((s) => s.baru);
  const tutup = usePersona((s) => s.tutup);
  const [sembunyi, setSembunyi] = useState(false);

  useEffect(() => {
    muat();
  }, [muat]);

  const disunting = sunting ? daftar.find((p) => p.id === sunting) ?? null : null;

  return (
    <div className="persona-kartu" data-testid="persona-card">
      <div className="subagent-kartu-head">
        <div className="set-row-label">
          <span className="set-h2-sub">{tr('Persona')}</span>
          <span className="set-hint">
            {tr(
              'How the AI carries itself. A persona only changes the way it talks and thinks — the tool list, project rules, and your own instructions still apply.',
            )}
          </span>
          {/*
            * The "how to use" block.
            *
            * Previously there was only one line explaining WHAT a persona is,
            * never HOW to use it — so it was no wonder users were confused
            * about what to do. The three steps below are written as plain
            * sentences (not a numbered documentation-style list) so they still read
            * well in a narrow settings panel.
            */}
          <span className="set-hint persona-cara" data-testid="persona-cara">
            {tr(
              'How to use it: hit "Active" on a persona row to turn it on — it applies to the next chat, no restart needed. "Duplicate" copies a built-in persona so you can change it without losing the original. If unsure, leave "General" active: that is Zephyr\'s built-in behaviour with nothing added.',
            )}
          </span>
        </div>
        <button className="btn btn-sm" data-testid="persona-new" onClick={() => bukaBaru()}>
          {tr('+ Persona baru')}
        </button>
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
                <button
                  className="btn btn-sm"
                  data-testid={`persona-${p.id}-ubah`}
                  onClick={() => bukaSunting(p.id)}
                >
                  {tr('Subagent: edit')}
                </button>
                {p.bawaan ? (
                  <button
                    className="btn btn-sm"
                    data-testid={`persona-${p.id}-salin`}
                    onClick={() => void duplikat(p.id)}
                  >
                    {tr('Persona: salin')}
                  </button>
                ) : (
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

      {(baru || disunting) && (
        <PersonaEditor
          awal={baru ? null : disunting}
          key={sunting ?? 'baru'}
          onTutup={() => {
            tutup();
            setSembunyi(false);
          }}
        />
      )}
      {sembunyi && <span />}
    </div>
  );
}

interface EditorProps {
  awal: Persona | null;
  onTutup: () => void;
}

function PersonaEditor({ awal, onTutup }: EditorProps) {
  const tr = useT();
  const simpan = usePersona((s) => s.simpan);

  /*
   * A built-in persona stores its name and description as i18n keys, so the
   * input has to show the translated text. The original value is kept beside
   * it: if the field comes back unchanged we store the key again, otherwise
   * the persona would freeze in whatever language it was last edited in.
   */
  const asliNama = awal?.nama ?? '';
  const asliDeskripsi = awal?.deskripsi ?? '';
  const [nama, setNama] = useState(awal ? tr(awal.nama) : '');
  const [deskripsi, setDeskripsi] = useState(awal ? tr(awal.deskripsi) : '');
  const [identitas, setIdentitas] = useState(awal?.identitas ?? '');
  const [caraKerja, setCaraKerja] = useState(awal?.caraKerja ?? '');
  const [aturan, setAturan] = useState(awal?.aturan ?? '');

  const namaBentrok = usePersona((s) =>
    s.daftar.some(
      (x) =>
        x.id !== awal?.id &&
        (x.nama.toLowerCase() === nama.trim().toLowerCase() ||
          tr(x.nama).toLowerCase() === nama.trim().toLowerCase()),
    ),
  );
  const bisaSimpan = nama.trim().length > 0 && !namaBentrok;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onTutup}>
      <div
        className="modal subagent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-title"
        data-testid="persona-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="subagent-head">
          <h2 className="modal-title" id="persona-title">
            {awal ? tr('Edit persona') : tr('Persona baru')}
          </h2>
          <button className="btn btn-icon" data-testid="persona-tutup" aria-label={tr('Subagent: close')} onClick={onTutup}>
            ✕
          </button>
        </div>

        <div className="modal-body subagent-form">
          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: nama')}</span>
            <input
              className="input"
              data-testid="persona-nama"
              value={nama}
              autoFocus
              placeholder={tr('mis. Pengajar')}
              onChange={(e) => setNama(e.target.value)}
            />
            {namaBentrok && (
              <span className="subagent-warn" data-testid="persona-nama-bentrok">
                {tr('Another persona already uses that name.')}
              </span>
            )}
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: deskripsi')}</span>
            <input
              className="input"
              data-testid="persona-deskripsi"
              value={deskripsi}
              placeholder={tr('One line — shown in the persona list')}
              onChange={(e) => setDeskripsi(e.target.value)}
            />
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Persona: identitas')}</span>
            <textarea
              className="input subagent-prompt"
              data-testid="persona-identitas"
              value={identitas}
              rows={3}
              placeholder={tr('Who this AI is. Leave empty to use Zephyr\'s default identity.')}
              onChange={(e) => setIdentitas(e.target.value)}
            />
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Persona: cara kerja')}</span>
            <textarea
              className="input subagent-prompt"
              data-testid="persona-carakerja"
              value={caraKerja}
              rows={4}
              placeholder={tr('How the AI answers: length, evidence, order, tone. Leave empty for the default.')}
              onChange={(e) => setCaraKerja(e.target.value)}
            />
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Aturan tambahan')}</span>
            <textarea
              className="input subagent-prompt"
              data-testid="persona-aturan"
              value={aturan}
              rows={3}
              placeholder={tr('Rules that always apply to this persona. Leave empty if there are none.')}
              onChange={(e) => setAturan(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <span className="subagent-spacer" />
          <button className="btn" data-testid="persona-batal" onClick={onTutup}>
            {tr('Subagent: batal')}
          </button>
          <button
            className="btn btn-primary"
            data-testid="persona-simpan"
            disabled={!bisaSimpan}
            onClick={() => {
              void simpan({
                nama: nama.trim() === tr(asliNama) ? asliNama : nama.trim(),
                deskripsi:
                  deskripsi.trim() === tr(asliDeskripsi) ? asliDeskripsi : deskripsi.trim(),
                identitas: identitas.trim(),
                caraKerja: caraKerja.trim(),
                aturan: aturan.trim(),
              });
              onTutup();
            }}
          >
            {tr('Subagent: save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PersonaCard;
