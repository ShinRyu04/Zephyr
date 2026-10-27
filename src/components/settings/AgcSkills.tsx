/*
 * Skills — the page inside Agent Customizations, in the ZCode shape.
 *
 * THE SHAPE, measured from the reference window:
 *
 *   Skills                     [User · This computer ▾]   Skills 23   [Search skills…]
 *
 *   Installed  3                                       ↻   + New
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ ▣  modlens                                        [ on ]  🗑          │
 *   │    Plug-in vision for text-only models. Hard rule: when a file path… │
 *   …
 *   Built-in  19
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ ▣  brainstorming                      2 files      [ + Install ]     │
 *   │    Use before building anything new — dig out the real intent first. │
 *
 * WHY THE COMMANDS RAIL IS GONE
 *
 * The first version put Skills and Commands side by side behind a left rail
 * (`skc-rail`). The reader's verdict was that the page should be Skills, full
 * width: a command is something the PALETTE runs, and listing the registry here
 * reproduced a second, worse copy of Ctrl+Shift+P inside a page about what the
 * agent KNOWS. The rail is gone, and the palette remains the one place a command
 * is run from.
 *
 * WHY THE SWITCH IS REAL, AND WHERE ITS STATE LIVES
 *
 * A switch that changes nothing is worse than no switch, so the one here is
 * wired: `skillAktif.ts` owns the off list, `aiStore.konteksAgent()` filters the
 * "AVAILABLE SKILLS" block with it, and `skill_view` refuses a skill that is off.
 * See that module for why the flag belongs to the reader (localStorage) rather
 * than to the skill file.
 *
 * WHY "Installed" AND "Built-in" ARE TWO LISTS AND NOT ONE
 *
 * `skills_list` answers "what is on disk"; `skills_katalog` answers "what ships
 * with the app". A catalogue entry whose folder exists is already in the first
 * list, so it is dropped from the second — otherwise every installed skill would
 * appear twice, and the reader would not know which row the switch belongs to.
 *
 * WHY "+ New" OPENS AN EDITOR INSTEAD OF WRITING A FILE
 *
 * Naming a file before its contents exist would leave an empty SKILL.md in the
 * prompt of every turn until the reader came back to it. The editor is the same
 * one used for an existing skill, so "make one" and "change one" end in one
 * place. The name field IS renameable; when it changes the old folder is removed
 * after the new file lands, because leaving it behind would silently duplicate
 * the skill in the prompt under two names.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useSkills } from '../../lib/skillsStore';
import type { SkillInfo } from '../../lib/commands';

type Scope = 'semua' | 'workspace' | 'global';

const PILIHAN_SCOPE: { id: Scope; label: string }[] = [
  { id: 'semua', label: 'All skills' },
  { id: 'workspace', label: 'This workspace' },
  { id: 'global', label: 'User · This computer' },
];

/** One card. Installed rows get the switch and the trash; built-in rows Install. */
function BarisSkill({
  nama,
  ket,
  scope,
  catatan,
  berkas,
  terpasang,
  aktif,
  sibuk,
  konfirmasi,
  onToggle,
  onSunting,
  onHapus,
  onBatalHapus,
  onPasang,
}: {
  nama: string;
  ket: string;
  scope: string | null;
  catatan?: string;
  berkas?: number;
  terpasang: boolean;
  aktif: boolean;
  sibuk: boolean;
  konfirmasi: boolean;
  onToggle: () => void;
  onSunting: () => void;
  onHapus: () => void;
  onBatalHapus: () => void;
  onPasang: () => void;
}) {
  const tr = useT();
  return (
    <div
      className={`agc-zc-kartu${terpasang ? '' : ' is-bawaan'}${terpasang && !aktif ? ' is-mati' : ''}`}
      data-testid={`agx-skill-${nama}`}
    >
      <span className="agc-zc-ikon" aria-hidden="true">
        <AiIkon name="thought" size={15} />
      </span>
      <div className="agc-zc-isi">
        <div className="agc-zc-judulbaris">
          <button type="button" className="agc-zc-nama" title={tr('Edit')} onClick={onSunting}>
            {nama}
          </button>
          {scope && <span className="agc-zc-chip">{scope}</span>}
          {typeof berkas === 'number' && (
            <span className="agc-zc-chip">
              {berkas} {tr('files')}
            </span>
          )}
        </div>
        <div className="agc-zc-desk">{ket || tr('(no description)')}</div>
        {catatan ? <div className="agc-zc-catatan">{tr(catatan)}</div> : null}
      </div>
      <div className="agc-zc-aksi">
        {terpasang && (
          <button
            type="button"
            role="switch"
            aria-checked={aktif}
            aria-label={nama}
            title={tr(aktif ? 'Turn off' : 'Turn on')}
            data-testid={`agc-skill-aktif-${nama}`}
            className={`agc-set-toggle${aktif ? ' is-on' : ''}`}
            onClick={onToggle}
          >
            <span className="agc-set-knob" aria-hidden="true" />
          </button>
        )}
        {terpasang && !konfirmasi && (
          <button
            type="button"
            className="agc-zc-ikon-hapus"
            title={tr('Delete')}
            aria-label={tr('Delete')}
            data-testid={`agx-skill-hapus-${nama}`}
            onClick={onHapus}
          >
            <AiIkon name="trash" size={13} />
          </button>
        )}
        {/*
          Deleting a skill removes a real folder from disk. Two clicks rather
          than one: an accidental press on a trash icon next to a list row is
          easy, and there is no undo.
        */}
        {terpasang && konfirmasi && (
          <>
            <button
              type="button"
              className="agc-zc-btn is-bahaya"
              data-testid={`agx-skill-hapus-ya-${nama}`}
              disabled={sibuk}
              onClick={onHapus}
            >
              {tr('Delete')}
            </button>
            <button type="button" className="agc-zc-btn" onClick={onBatalHapus}>
              {tr('Cancel')}
            </button>
          </>
        )}
        {!terpasang && (
          <button
            type="button"
            className="agc-zc-btn is-utama"
            data-testid={`agx-skill-pasang-${nama}`}
            disabled={sibuk}
            onClick={onPasang}
          >
            + {tr('Install')}
          </button>
        )}
      </div>
    </div>
  );
}

/** The editor for one skill: name, description, body, all read from disk. */
function EditorSkill({
  skill,
  scopeBawaan,
  onSelesai,
}: {
  skill: SkillInfo | null;
  scopeBawaan: 'workspace' | 'global';
  onSelesai: () => void;
}) {
  const tr = useT();
  const buka = useSkills((s) => s.buka);
  const simpan = useSkills((s) => s.simpan);
  const hapus = useSkills((s) => s.hapus);
  const sibuk = useSkills((s) => s.sibuk);
  const isi = useSkills((s) => s.isi);
  const memuatIsi = useSkills((s) => s.memuatIsi);

  const namaAsli = skill?.name ?? '';
  const [nama, setNama] = useState(namaAsli);
  const [desc, setDesc] = useState(skill?.description ?? '');
  const [body, setBody] = useState<string | null>(skill ? null : '');
  const [scope, setScope] = useState<'workspace' | 'global'>(
    skill?.scope === 'workspace' ? 'workspace' : scopeBawaan,
  );
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!skill) return;
    void buka(skill.name);
    /* The store's open-slot is global; leaving it set would make the next
       editor think another skill's body is already loaded. */
    return () => {
      void buka(null);
    };
  }, [skill, buka]);

  /* Filled once, so a re-render while typing cannot overwrite what was typed
     with the file's older contents. */
  useEffect(() => {
    if (!skill || memuatIsi) return;
    setBody((lama) => lama ?? isi);
  }, [isi, memuatIsi, skill]);

  const bisa = nama.trim().length > 0 && (body ?? '').trim().length > 0;

  const simpanKlik = async () => {
    setGalat(null);
    const namaBaru = nama.trim();
    const ok = await simpan({ name: namaBaru, description: desc, content: body ?? '', scope });
    if (!ok) {
      setGalat(tr('Could not save the skill. See the message above.'));
      return;
    }
    if (skill && namaBaru !== skill.name) {
      /*
       * A rename is a new folder plus the removal of the old one.
       *
       * `skill_write` writes `<root>/<name>/SKILL.md`, so the old folder is still
       * there after the write: without this the prompt would list the same skill
       * twice, once under each name, and the reader would have to delete the
       * ghost by hand. Done only AFTER the new file landed — if the write failed
       * we return above and nothing is removed.
       */
      const terhapus = await hapus(skill.name);
      if (!terhapus) {
        setGalat(tr('Saved under the new name, but the old folder could not be removed.'));
      }
    }
    onSelesai();
  };

  return (
    <section className="agc-zc-editor" data-testid="agx-skill-editor">
      <div className="agc-zc-grub-judul">
        {skill ? `${tr('Edit')}: ${namaAsli}` : tr('New skill')}
        {skill ? <span className="agc-zc-path" title={skill.path}>{skill.path}</span> : null}
      </div>

      {galat && (
        <p className="agset-galat" role="alert">
          {galat}
        </p>
      )}

      {skill && (memuatIsi || body === null) ? (
        <p className="agc-zc-muted">{tr('Loading…')}</p>
      ) : (
        <>
          <div className="agc-zc-baris-dua">
            <label className="agc-zc-field">
              <span>{tr('Name')}</span>
              <input
                className="agc-field"
                data-testid="agx-skill-nama"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </label>
            <label className="agc-zc-field">
              <span>{tr('Scope')}</span>
              <select
                className="agc-field"
                data-testid="agx-skill-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value === 'workspace' ? 'workspace' : 'global')}
              >
                <option value="global">{tr('User · This computer')}</option>
                <option value="workspace">{tr('This workspace')}</option>
              </select>
            </label>
          </div>
          <label className="agc-zc-field">
            <span>{tr('When the agent should use this')}</span>
            <input
              className="agc-field"
              data-testid="agx-skill-desc"
              placeholder={tr('Short description (when the agent should use it)')}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
          <label className="agc-zc-field">
            <span>{tr('Instructions')}</span>
            <textarea
              className="agc-field agc-field-area"
              data-testid="agx-skill-body"
              rows={10}
              value={body ?? ''}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="agc-zc-aksi-bawah">
            <button type="button" className="agc-zc-btn" disabled={sibuk} onClick={onSelesai}>
              {tr('Cancel')}
            </button>
            <button
              type="button"
              className="agc-zc-btn is-utama"
              data-testid="agx-skill-simpan"
              disabled={!bisa || sibuk}
              onClick={() => void simpanKlik()}
            >
              {tr('Save')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function AgcSkills() {
  const tr = useT();
  const daftar = useSkills((s) => s.daftar);
  const katalog = useSkills((s) => s.katalog);
  const sibuk = useSkills((s) => s.sibuk);
  const galat = useSkills((s) => s.galat);
  const nonaktif = useSkills((s) => s.nonaktif);
  const muatKatalog = useSkills((s) => s.muatKatalog);
  const muatNonaktif = useSkills((s) => s.muatNonaktif);
  const pasang = useSkills((s) => s.pasang);
  const hapus = useSkills((s) => s.hapus);
  const setAktif = useSkills((s) => s.setAktif);
  const bersihkanGalat = useSkills((s) => s.bersihkanGalat);

  const [cari, setCari] = useState('');
  const [scope, setScope] = useState<Scope>('semua');
  const [konfirmasi, setKonfirmasi] = useState<string | null>(null);
  const [sunting, setSunting] = useState<{ kunci: string; skill: SkillInfo | null } | null>(null);

  useEffect(() => {
    void muatKatalog();
    muatNonaktif();
  }, [muatKatalog, muatNonaktif]);

  const mati = useMemo(() => new Set(nonaktif), [nonaktif]);
  const q = cari.trim().toLowerCase();
  const cocokCari = (nama: string, ket: string) => !q || `${nama} ${ket}`.toLowerCase().includes(q);

  const terpasang = useMemo(
    () =>
      daftar
        .filter((s) => scope === 'semua' || s.scope === scope)
        .filter((s) => cocokCari(s.name, s.description))
        .sort((a, b) => {
          /* Switched-on skills first: the list is mostly read to see what the
             agent may use, and a dimmed tail keeps the off ones findable. */
          const ma = mati.has(a.name.toLowerCase()) ? 1 : 0;
          const mb = mati.has(b.name.toLowerCase()) ? 1 : 0;
          if (ma !== mb) return ma - mb;
          return a.name.localeCompare(b.name);
        }),
    [daftar, scope, q, mati],
  );

  /*
   * Built-in rows are the catalogue MINUS what is already on disk.
   * Hidden while the reader is looking at the workspace scope, because a
   * bundled skill plants into the user folder — offering Install there would
   * write somewhere the active filter is not showing.
   */
  const bawaan = useMemo(
    () =>
      scope === 'workspace'
        ? []
        : katalog
            .filter((k) => !k.terpasang)
            .filter((k) => cocokCari(k.name, k.description))
            .sort((a, b) => a.name.localeCompare(b.name)),
    [katalog, scope, q],
  );

  const adaHasil = terpasang.length > 0 || bawaan.length > 0;
  const bisaBuat = !sunting;

  return (
    <div className="agc-pane agc-skills" data-testid="agx-skills">
      <div className="agc-zc-atas">
        <h2 className="agc-zc-judul">{tr('Skills')}</h2>
        <span className="agc-zc-hitung">{daftar.length}</span>
        <select
          className="agc-zc-scope"
          data-testid="agx-skills-scope"
          aria-label={tr('Scope')}
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
        >
          {PILIHAN_SCOPE.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(p.label)}
            </option>
          ))}
        </select>
        <input
          className="agc-zc-cari"
          data-testid="agx-skills-cari"
          placeholder={tr('Search skills…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      {galat && (
        <p className="agset-galat" data-testid="agx-skills-galat" role="alert">
          {galat}
          <button type="button" className="agset-tautan" onClick={bersihkanGalat}>
            {tr('Dismiss')}
          </button>
        </p>
      )}

      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">
          {tr('Installed')} <span className="agc-zc-hitung">{terpasang.length}</span>
        </span>
        <button
          type="button"
          className="agc-zc-ikon-btn agc-zc-dorong"
          data-testid="agx-skills-segarkan"
          title={tr('Refresh')}
          aria-label={tr('Refresh')}
          disabled={sibuk}
          onClick={() => void muatKatalog()}
        >
          <AiIkon name="refresh" size={13} />
        </button>
        <button
          type="button"
          className="agc-zc-btn is-utama"
          data-testid="agx-skills-baru"
          disabled={!bisaBuat}
          onClick={() => setSunting({ kunci: 'baru', skill: null })}
        >
          + {tr('New')}
        </button>
      </div>

      {terpasang.length === 0 ? (
        <div className="agc-zc-kosong-kecil" data-testid="agx-skills-installed-kosong">
          {tr('Nothing here yet.')}{' '}
          <button type="button" className="agc-zc-link" onClick={() => setSunting({ kunci: 'baru', skill: null })}>
            {tr('New skill')}
          </button>
        </div>
      ) : (
        <div className="agc-zc-daftar">
          {terpasang.map((s) => (
            <BarisSkill
              key={`${s.scope}-${s.name}`}
              nama={s.name}
              ket={s.description}
              scope={s.scope}
              terpasang
              aktif={!mati.has(s.name.toLowerCase())}
              sibuk={sibuk}
              konfirmasi={konfirmasi === s.name}
              onToggle={() => setAktif(s.name, mati.has(s.name.toLowerCase()))}
              onSunting={() => setSunting({ kunci: s.name, skill: s })}
              onHapus={() => {
                if (konfirmasi !== s.name) {
                  setKonfirmasi(s.name);
                  return;
                }
                setKonfirmasi(null);
                void hapus(s.name);
              }}
              onBatalHapus={() => setKonfirmasi(null)}
              onPasang={() => undefined}
            />
          ))}
        </div>
      )}

      {bawaan.length > 0 && (
        <>
          <div className="agc-zc-grub-head">
            <span className="agc-zc-grub-judul">
              {tr('Built-in')} <span className="agc-zc-hitung">{bawaan.length}</span>
            </span>
          </div>
          <div className="agc-zc-daftar">
            {bawaan.map((k) => (
              <BarisSkill
                key={k.name}
                nama={k.name}
                ket={k.description}
                scope={null}
                catatan={k.catatan}
                berkas={k.berkas}
                terpasang={false}
                aktif
                sibuk={sibuk}
                konfirmasi={false}
                onToggle={() => undefined}
                onSunting={() => undefined}
                onHapus={() => undefined}
                onBatalHapus={() => undefined}
                onPasang={() => void pasang(k.name)}
              />
            ))}
          </div>
        </>
      )}

      {!adaHasil && (
        <div className="agset-kosong" data-testid="agx-skills-kosong">
          <span className="agset-kosong-ikon" aria-hidden="true">
            <AiIkon name="thought" size={18} />
          </span>
          <span>{cari.trim() ? tr('Nothing matches that search.') : tr('Nothing here yet.')}</span>
        </div>
      )}

      {sunting && (
        <EditorSkill
          key={sunting.kunci}
          skill={sunting.skill}
          scopeBawaan={scope === 'workspace' ? 'workspace' : 'global'}
          onSelesai={() => setSunting(null)}
        />
      )}
    </div>
  );
}
