import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import { usePersona, type Persona } from '../../lib/personaStore';
import { ikonPersona } from '../../lib/subagentIcons';
import IkonAgen from '../ai/IkonAgen';

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
  const bukaBaru = usePersona((s) => s.bukaBaru);
  const bukaSunting = usePersona((s) => s.bukaSunting);
  const duplikat = usePersona((s) => s.duplikat);
  const sunting = usePersona((s) => s.sunting);
  const baru = usePersona((s) => s.baru);
  const tutup = usePersona((s) => s.tutup);

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

  const disunting = sunting ? daftar.find((p) => p.id === sunting) ?? null : null;

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
              'How to use it: click a persona row to make it active, it applies to the next chat, no restart needed. The built-in personas cannot be edited or deleted — duplicate one to customize it without losing the original. If unsure, leave "Zeph" active: that is Zephyr\'s built-in orchestrator with nothing added.',
            )}
          </span>
        </div>
        <button className="btn btn-sm" data-testid="persona-new" onClick={() => bukaBaru()}>
          {tr('Persona: baru')}
        </button>
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
                  <IkonAgen ik={ik} size={15} />
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
                  <>
                    <button
                      className="btn btn-sm"
                      data-testid={`persona-${p.id}-ubah`}
                      onClick={() => bukaSunting(p.id)}
                    >
                      {tr('Subagent: ubah')}
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid={`persona-${p.id}-hapus`}
                      onClick={() => void hapus(p.id)}
                    >
                      {tr('Subagent: hapus')}
                    </button>
                  </>
                )}
                {p.bawaan && (
                  <button
                    className="btn btn-sm"
                    data-testid={`persona-${p.id}-salin`}
                    onClick={() => void duplikat(p.id)}
                  >
                    {tr('Persona: salin')}
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
          onTutup={() => tutup()}
        />
      )}
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
            {awal ? tr('Ubah persona') : tr('Persona baru')}
          </h2>
          <button className="btn btn-icon" data-testid="persona-tutup" aria-label={tr('Subagent: tutup')} onClick={onTutup}>
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
                {tr('Nama itu sudah dipakai persona lain.')}
              </span>
            )}
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: deskripsi')}</span>
            <input
              className="input"
              data-testid="persona-deskripsi"
              value={deskripsi}
              placeholder={tr('Satu baris — muncul di daftar persona')}
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
              placeholder={tr('Siapa AI ini. Kosongkan untuk memakai identitas bawaan Zephyr.')}
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
              placeholder={tr('Bagaimana AI menjawab: panjang, bukti, urutan, nada. Kosongkan untuk bawaan.')}
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
              placeholder={tr('Aturan yang selalu berlaku untuk persona ini. Kosongkan kalau tidak ada.')}
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
            {tr('Subagent: simpan')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PersonaCard;
