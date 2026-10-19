/*
 * Skills & Commands — the TRAE-shaped page inside Agent Customizations.
 *
 * THE SHAPE, taken from the reference:
 *
 *   Skills & Commands
 *   ┌──────────────────┬─────────────────────────────────────────────┐
 *   │ Skills      21 ▸ │  + Create Skill                             │
 *   │ Commands    38 ▸ │  ┌────────────────────────────────────────┐ │
 *   │                  │  │ 🔍 Search skills…                      │ │
 *   │                  │  └────────────────────────────────────────┘ │
 *   │                  │  Skills (21)        [Installed only]        │
 *   │                  │  ▸ academy-guide            [Remove]        │
 *   │                  │  ▸ brainstorming            [Remove]        │
 *   └──────────────────┴─────────────────────────────────────────────┘
 *
 * WHY A LEFT RAIL OF KINDS:
 *
 * Skills and Commands are different things that the reader arrives at with the
 * same question — "what can I make the agent do?". The reference puts them side
 * by side behind one rail so switching costs one click and the search box stays
 * where the eye left it. Two separate sections in the outer rail would have cost
 * a round trip through the pane menu for the same move.
 *
 * WHY COMMANDS COME FROM THE REAL REGISTRY:
 *
 * `COMMANDS` in `commandRegistry.ts` is the same list the palette runs. Listing
 * anything else here would be a catalogue of things that do not work.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useSkills } from '../../lib/skillsStore';
import { COMMANDS } from '../../lib/commandRegistry';

type Jenis = 'skills' | 'commands';

export default function AgcSkillsCommands() {
  const tr = useT();
  const [jenis, setJenis] = useState<Jenis>('skills');
  const [cari, setCari] = useState('');
  const [hanyaTerpasang, setHanyaTerpasang] = useState(false);

  const daftar = useSkills((s) => s.daftar);
  const katalog = useSkills((s) => s.katalog);
  const sibuk = useSkills((s) => s.sibuk);
  const galat = useSkills((s) => s.galat);
  const muatKatalog = useSkills((s) => s.muatKatalog);
  const pasang = useSkills((s) => s.pasang);
  const hapus = useSkills((s) => s.hapus);
  const bersihkanGalat = useSkills((s) => s.bersihkanGalat);

  useEffect(() => {
    void muatKatalog();
  }, [muatKatalog]);

  /*
   * Join the catalogue with what is on disk.
   *
   * `terpasang` is read from `daftar` (disk), not from the catalogue's own flag:
   * that flag is a snapshot from when the catalogue was read, and a delete can
   * land in between. Names are matched case-insensitively with separators
   * normalised, because a frontmatter name may differ from its folder name —
   * without that, one skill appears twice: once "installed" from disk and once
   * "not installed" from the catalogue.
   */
  const barisSkill = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '-');
    const terpasangNorm = new Set(daftar.map((s) => norm(s.name)));
    const dariKatalog = katalog.map((k) => ({
      nama: k.name,
      ket: k.description,
      terpasang: terpasangNorm.has(norm(k.name)),
      catatan: k.catatan,
      scope: daftar.find((s) => norm(s.name) === norm(k.name))?.scope ?? null,
    }));
    const namaKatalog = new Set(katalog.map((k) => norm(k.name)));
    const lokal = daftar
      .filter((s) => !namaKatalog.has(norm(s.name)))
      .map((s) => ({
        nama: s.name,
        ket: s.description,
        terpasang: true,
        catatan: '',
        scope: s.scope,
      }));
    const q = cari.trim().toLowerCase();
    return [...dariKatalog, ...lokal]
      .filter((b) => (hanyaTerpasang ? b.terpasang : true))
      .filter((b) => !q || (b.nama + ' ' + b.ket).toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.terpasang !== b.terpasang) return a.terpasang ? -1 : 1;
        return a.nama.localeCompare(b.nama);
      });
  }, [katalog, daftar, cari, hanyaTerpasang]);

  const barisCommand = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return COMMANDS.filter((c) => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.keywords ?? '').toLowerCase().includes(q)
      );
    });
  }, [cari]);

  const jmlSkill = daftar.length;
  const jmlCommand = COMMANDS.length;
  const jumlah = jenis === 'skills' ? barisSkill.length : barisCommand.length;

  return (
    <div className="agc-pane agx-pane skc" data-testid="agx-skills">
      <h2 className="agc-pane-title">
        {tr('Skills & Commands')}{' '}
        <span className="agx-tanya" title={tr('What the agent can be taught, and what it can be told to run.')}>
          ?
        </span>
      </h2>

      <div className="skc-grid">
        {/* ── Left rail of kinds ─────────────────────────────────────── */}
        <nav className="skc-rail" role="tablist" aria-label={tr('Skills and commands')}>
          <button
            type="button"
            role="tab"
            aria-selected={jenis === 'skills'}
            className={`skc-rail-btn${jenis === 'skills' ? ' is-on' : ''}`}
            data-testid="agx-skc-skills"
            onClick={() => setJenis('skills')}
          >
            <AiIkon name="thought" size={13} />
            <span className="skc-rail-nama">{tr('Skills')}</span>
            <span className="skc-rail-jml">{jmlSkill}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={jenis === 'commands'}
            className={`skc-rail-btn${jenis === 'commands' ? ' is-on' : ''}`}
            data-testid="agx-skc-commands"
            onClick={() => setJenis('commands')}
          >
            <AiIkon name="terminal" size={13} />
            <span className="skc-rail-nama">{tr('Commands')}</span>
            <span className="skc-rail-jml">{jmlCommand}</span>
          </button>
        </nav>

        {/* ── Right pane ─────────────────────────────────────────────── */}
        <div className="skc-pane">
          <div className="skc-kepala">
            <button type="button" className="agx-btn-utama" data-testid="agx-skc-create">
              + {tr('Create Skill')}
            </button>
          </div>

          <input
            className="skc-cari"
            data-testid="agx-skills-cari"
            placeholder={jenis === 'skills' ? tr('Search skills…') : tr('Search commands…')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />

          <div className="skc-sub">
            <span className="skc-sub-judul">
              {jenis === 'skills' ? tr('Skills') : tr('Commands')} ({jumlah})
            </span>
            {jenis === 'skills' && (
              <label className="agx-toggle agx-toggle-inline">
                <input
                  type="checkbox"
                  data-testid="agx-skills-filter"
                  checked={hanyaTerpasang}
                  onChange={(e) => setHanyaTerpasang(e.target.checked)}
                />
                <span>{tr('Installed only')}</span>
              </label>
            )}
          </div>

          {galat && jenis === 'skills' && (
            <p className="agx-galat" data-testid="agx-skills-galat" role="alert">
              {galat}
              <button type="button" className="agx-tautan" onClick={bersihkanGalat}>
                {tr('Dismiss')}
              </button>
            </p>
          )}

          {jumlah === 0 ? (
            <div className="agx-kosong" data-testid="agx-skills-kosong">
              <span className="agx-kosong-ikon" aria-hidden="true">
                <AiIkon name={jenis === 'skills' ? 'thought' : 'terminal'} size={18} />
              </span>
              <span>{cari.trim() ? tr('Nothing matches that search.') : tr('Nothing here yet.')}</span>
            </div>
          ) : (
            <div className="skc-daftar" data-testid="agx-skills-daftar">
              {jenis === 'skills'
                ? barisSkill.map((b) => (
                    <div
                      className={`skc-baris${b.terpasang ? '' : ' is-mati'}`}
                      key={b.nama}
                      data-testid={`agx-skill-${b.nama}`}
                    >
                      <span className="skc-ikon" aria-hidden="true">
                        <AiIkon name="thought" size={14} />
                      </span>
                      <div className="skc-teks">
                        <span className="skc-nama">
                          {b.nama}
                          {b.scope && <span className="agx-chip-kecil">{b.scope}</span>}
                        </span>
                        <span className="skc-ket">{b.ket}</span>
                        {b.catatan && <span className="agx-skill-catatan">{tr(b.catatan)}</span>}
                      </div>
                      {b.terpasang ? (
                        <button
                          type="button"
                          className="skc-aksi"
                          data-testid={`agx-skill-hapus-${b.nama}`}
                          disabled={sibuk}
                          onClick={() => void hapus(b.nama)}
                        >
                          {tr('Remove')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="skc-aksi is-pasang"
                          data-testid={`agx-skill-pasang-${b.nama}`}
                          disabled={sibuk}
                          onClick={() => void pasang(b.nama)}
                        >
                          + {tr('Install')}
                        </button>
                      )}
                    </div>
                  ))
                : barisCommand.map((c) => (
                    <div className="skc-baris" key={c.id} data-testid={`agx-cmd-${c.id}`}>
                      <span className="skc-ikon" aria-hidden="true">
                        <AiIkon name="terminal" size={14} />
                      </span>
                      <div className="skc-teks">
                        <span className="skc-nama">{c.title}</span>
                        <span className="skc-ket">
                          {c.group} · <code>{c.id}</code>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="skc-aksi"
                        data-testid={`agx-cmd-jalan-${c.id}`}
                        onClick={() => void c.run()}
                      >
                        {tr('Run')}
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
