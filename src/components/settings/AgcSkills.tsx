/*
 * Skills — the TRAE-shaped page inside Agent Customizations.
 *
 * THE SHAPE, and why it changed:
 *
 * The old pane listed only what was ALREADY on disk, grouped by scope. That
 * answers "what do I have" but not "what can I get" - and a skill the reader
 * deleted simply vanished, with no row to bring it back. The reference layout
 * is a single searchable list with an Install/Remove button per row, and that
 * is what this is.
 *
 * Two sources, joined honestly:
 *
 *   `katalog` - every skill that SHIPS with the app (`skills_katalog`), each
 *               with a `terpasang` flag computed from disk, not guessed.
 *   `daftar`  - what is actually installed (`skills_list`).
 *
 * A skill that exists on disk but is NOT in the bundle (one the reader wrote by
 * hand) still gets a row: dropping it would make the list lie about what the
 * agent can use.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useSkills } from '../../lib/skillsStore';

export default function AgcSkills() {
  const tr = useT();
  const daftar = useSkills((s) => s.daftar);
  const katalog = useSkills((s) => s.katalog);
  const sibuk = useSkills((s) => s.sibuk);
  const galat = useSkills((s) => s.galat);
  const muatKatalog = useSkills((s) => s.muatKatalog);
  const pasang = useSkills((s) => s.pasang);
  const hapus = useSkills((s) => s.hapus);
  const bersihkanGalat = useSkills((s) => s.bersihkanGalat);

  const [cari, setCari] = useState('');
  const [hanyaTerpasang, setHanyaTerpasang] = useState(false);

  useEffect(() => {
    void muatKatalog();
  }, [muatKatalog]);

  /*
   * Join the catalogue with the installed list.
   *
   * `terpasang` comes from `daftar` (disk) rather than from the catalogue's own
   * flag, because the flag is a snapshot taken when the catalogue was read and
   * a delete can land in between. The catalogue supplies the DESCRIPTION and the
   * file count for things that are not installed yet.
   */
  const baris = useMemo(() => {
    const terpasangNama = new Set(daftar.map((s) => s.name));
    /*
     * The catalogue is keyed by FOLDER name (`academy-guide`), while a skill on
     * disk is keyed by its frontmatter name - which may differ in case or
     * spacing. Matching case-insensitively and by a normalised form is what
     * stops the same skill appearing twice: once as "not installed" from the
     * catalogue and once as "installed" from disk.
     */
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '-');
    const terpasangNorm = new Set(daftar.map((s) => norm(s.name)));

    const dariKatalog = katalog.map((k) => {
      const terpasangIni = terpasangNama.has(k.name) || terpasangNorm.has(norm(k.name));
      return {
        nama: k.name,
        ket: k.description,
        terpasang: terpasangIni,
        berkas: k.berkas,
        catatan: k.catatan,
        scope: daftar.find((s) => s.name === k.name || norm(s.name) === norm(k.name))?.scope ?? null,
        lokal: false,
      };
    });

    /* Skills on disk that the bundle does not ship: hand-written ones. */
    const namaKatalogNorm = new Set(katalog.map((k) => norm(k.name)));
    const lokal = daftar
      .filter((s) => !namaKatalogNorm.has(norm(s.name)))
      .map((s) => ({
        nama: s.name,
        ket: s.description,
        terpasang: true,
        berkas: 1,
        catatan: '',
        scope: s.scope,
        lokal: true,
      }));

    const semua = [...dariKatalog, ...lokal];
    const q = cari.trim().toLowerCase();
    return semua
      .filter((b) => (hanyaTerpasang ? b.terpasang : true))
      .filter((b) => !q || (b.nama + ' ' + b.ket).toLowerCase().includes(q))
      .sort((a, b) => {
        /* Installed first, then alphabetical - "what I have" before "what I could". */
        if (a.terpasang !== b.terpasang) return a.terpasang ? -1 : 1;
        return a.nama.localeCompare(b.nama);
      });
  }, [katalog, daftar, cari, hanyaTerpasang]);

  const jmlTerpasang = daftar.length;

  return (
    <div className="agc-pane agx-pane" data-testid="agx-skills">
      <div className="agx-head">
        <h2 className="agc-pane-title">
          {tr('Skills')}{' '}
          <span className="agx-tanya" title={tr('Folders of instructions the agent loads when a task matches.')}>
            ?
          </span>
        </h2>
      </div>
      <p className="agc-pane-desc">
        {tr(
          'Reusable knowledge and workflows for specialized tasks. Agents load the relevant skill when it helps.',
        )}
      </p>

      <div className="agx-bar">
        <input
          className="agx-cari"
          data-testid="agx-skills-cari"
          placeholder={tr('Search skills…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <label className="agx-toggle agx-toggle-inline">
          <input
            type="checkbox"
            data-testid="agx-skills-filter"
            checked={hanyaTerpasang}
            onChange={(e) => setHanyaTerpasang(e.target.checked)}
          />
          <span>{tr('Installed only')}</span>
        </label>
        <span className="agx-muted" data-testid="agx-skills-jumlah">
          {jmlTerpasang} / {katalog.length + daftar.length - jmlTerpasang} {tr('installed')}
        </span>
      </div>

      {galat && (
        <p className="agx-galat" data-testid="agx-skills-galat" role="alert">
          {galat}
          <button type="button" className="agx-tautan" onClick={bersihkanGalat}>
            {tr('Dismiss')}
          </button>
        </p>
      )}

      {baris.length === 0 ? (
        <div className="agx-kosong" data-testid="agx-skills-kosong">
          <span className="agx-kosong-ikon" aria-hidden="true">
            <AiIkon name="thought" size={18} />
          </span>
          <span>{cari.trim() ? tr('Nothing matches that search.') : tr('No skills yet.')}</span>
        </div>
      ) : (
        <div className="agx-daftar" data-testid="agx-skills-daftar">
          {baris.map((b) => (
            <div
              className={`agx-baris${b.terpasang ? '' : ' is-mati'}`}
              key={b.nama}
              data-testid={`agx-skill-${b.nama}`}
            >
              <span className="agx-avatar" aria-hidden="true">
                <AiIkon name="thought" size={15} />
              </span>
              <div className="agx-baris-teks">
                <span className="agx-baris-nama">{b.nama}</span>
                <span className="agx-baris-desk">{b.ket}</span>
                {b.catatan && <span className="agx-skill-catatan">{tr(b.catatan)}</span>}
              </div>
              <div className="agx-baris-aksi">
                {b.scope && <span className="agx-chip-kecil">{b.scope}</span>}
                {b.terpasang ? (
                  <button
                    type="button"
                    className="agx-btn-batal"
                    data-testid={`agx-skill-hapus-${b.nama}`}
                    disabled={sibuk}
                    onClick={() => void hapus(b.nama)}
                  >
                    {tr('Remove')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="agx-btn-utama"
                    data-testid={`agx-skill-pasang-${b.nama}`}
                    disabled={sibuk}
                    onClick={() => void pasang(b.nama)}
                  >
                    + {tr('Install')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
