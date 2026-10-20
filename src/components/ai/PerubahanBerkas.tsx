import { useMemo, useState } from 'react';
import type { AgentToolRun } from '../../lib/types';
import { useStore } from '../../lib/store';
import { useDiff, useDiffBerkas } from '../../lib/diffStore';
import { tf, useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import FileIkon from './FileIkon';
import '../../styles/ai-perubahan.css';

/*
 * The "files changed" card, once per chat session.
 *
 * WHY it exists: the tool block above already lists every call, but a reader
 * finishing a long run asks one question - "what did it actually touch?" - and
 * the answer was scattered across rows in call order, with the same file
 * appearing three times. This card answers it in one place, per FILE, with the
 * totals added up.
 *
 * Scope: the whole CHAT SESSION, not just the turn above it. A long session
 * that rewrote the same file five times used to show five separate cards, each
 * with the same path and a fifth of the numbers. The map arrives pre-built from
 * `AiPanel`, which walks the message list once.
 *
 * Shape, following the reference:
 *   - a folder row per directory, folded with its own caret, carrying the
 *     folder's own totals;
 *   - a file row under it: extension icon, name in the normal weight, the
 *     folder as dim context, `+N -N` flush right;
 *   - clicking a file opens it; `Diff` opens the DiffView tab.
 */

/** One file the session wrote to, with its numbers added up. */
type Berkas = {
  path: string;
  nama: string;
  /** Directory part, shown dimmed before the name. Empty for a root file. */
  dir: string;
  tambah: number;
  hapus: number;
  gagal: boolean;
};

/** A directory and the files under it, plus its rolled-up totals. */
type Folder = {
  dir: string;
  berkas: Berkas[];
  tambah: number;
  hapus: number;
};

function pisahPath(path: string): { dir: string; nama: string } {
  const bersih = path.replace(/\\/g, '/');
  const i = bersih.lastIndexOf('/');
  return i < 0
    ? { dir: '', nama: bersih }
    : { dir: bersih.slice(0, i), nama: bersih.slice(i + 1) };
}

/*
 * Roll the per-file numbers into one row per file, then group by folder.
 *
 * A failed call is still counted: `perubahanTool` captures the AFTER side on
 * failure too, because a patch can write one file before failing on the next.
 * An empty result therefore means the session never wrote anything, and only
 * then is there nothing to show.
 */
function susun(peta: Map<string, AgentToolRun[]>): { berkas: Berkas[]; folder: Folder[] } {
  const berkas: Berkas[] = [];
  for (const [path, runs] of peta) {
    const { dir, nama } = pisahPath(path);
    let tambah = 0;
    let hapus = 0;
    let gagal = false;
    for (const t of runs) {
      tambah += typeof t.additions === 'number' ? t.additions : 0;
      hapus += typeof t.deletions === 'number' ? t.deletions : 0;
      gagal = gagal || t.ok === false;
    }
    berkas.push({ path, nama, dir, tambah, hapus, gagal });
  }

  berkas.sort((a, b) => a.path.localeCompare(b.path));

  const petaFolder = new Map<string, Folder>();
  for (const b of berkas) {
    const ada = petaFolder.get(b.dir);
    if (ada) {
      ada.berkas.push(b);
      ada.tambah += b.tambah;
      ada.hapus += b.hapus;
    } else {
      petaFolder.set(b.dir, { dir: b.dir, berkas: [b], tambah: b.tambah, hapus: b.hapus });
    }
  }

  return { berkas, folder: [...petaFolder.values()] };
}

export default function PerubahanBerkas({ peta }: { peta: Map<string, AgentToolRun[]> }) {
  const tr = useT();
  const [terbuka, setTerbuka] = useState(false);
  /** Folders the reader closed. Open by default: this is a summary, not a tree
   *  to explore - the reader opened it precisely to see the files. */
  const [tertutup, setTertutup] = useState<ReadonlySet<string>>(() => new Set());

  const { berkas, folder } = useMemo(() => susun(peta), [peta]);

  /*
   * Numbers from the ACTUAL snapshot, when it has them.
   *
   * The tool row carries the numbers the agent reported; `diffStore` carries
   * the ones measured from the before/after capture. The latter is the truth,
   * so it wins when present, and the row numbers are the fallback for a file
   * the store never saw (a delete, or a run that predates the store).
   */
  const terukur = useDiffBerkas();

  const angka = useMemo(() => {
    const p = new Map<string, { tambah: number; hapus: number }>();
    for (const b of berkas) {
      const m = terukur.find((x) => x.path === b.path);
      p.set(b.path, m ? { tambah: m.tambah, hapus: m.hapus } : { tambah: b.tambah, hapus: b.hapus });
    }
    return p;
  }, [berkas, terukur]);

  /* Nothing was written: no card. A read-only session has nothing to summarise. */
  if (berkas.length === 0) return null;

  const totalTambah = berkas.reduce((n, b) => n + (angka.get(b.path)?.tambah ?? 0), 0);
  const totalHapus = berkas.reduce((n, b) => n + (angka.get(b.path)?.hapus ?? 0), 0);

  const alih = (dir: string) => {
    setTertutup((s) => {
      const n = new Set(s);
      if (n.has(dir)) n.delete(dir);
      else n.add(dir);
      return n;
    });
  };

  const bukaBerkas = (path: string) => {
    void useStore.getState().openPath(path).catch(() => undefined);
  };

  const bukaDiff = (path?: string) => {
    if (path) useDiff.getState().pilih(path);
    useStore.getState().bukaViewAi('diff-view');
  };

  return (
    <div className="ai-ubah" data-testid="ai-perubahan" data-open={terbuka ? '1' : '0'}>
      <div className="ai-ubah-head-baris">
        <button
          type="button"
          className="ai-ubah-head"
          data-testid="ai-perubahan-toggle"
          aria-expanded={terbuka}
          onClick={() => setTerbuka(!terbuka)}
        >
          <span className="ai-ubah-caret" aria-hidden="true">
            {terbuka ? '▾' : '▸'}
          </span>
          <span className="ai-ubah-judul">
            {tf('{n} files changed', { n: berkas.length })}
          </span>
          <span className="ai-ubah-stat">
            <span className="ai-ubah-tambah">+{totalTambah}</span>
            <span className="ai-ubah-hapus">−{totalHapus}</span>
          </span>
        </button>
        {/*
          * A sibling of the toggle, never a child of it: a button cannot
          * contain another button, and this one must open the diff instead of
          * folding the card.
          */}
        <span
          role="button"
          tabIndex={0}
          className="ai-ubah-diff"
          data-testid="ai-perubahan-diff"
          title={tr('Open DiffView')}
          onClick={() => bukaDiff()}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            bukaDiff();
          }}
        >
          <AiIkon name="diff" size={12} />
          <span>Diff</span>
        </span>
      </div>

      <div className="ai-ubah-isi" aria-hidden={!terbuka}>
        <div className="ai-ubah-gulir">
          {folder.map((f, iFolder) => {
            const lipat = tertutup.has(f.dir);
            return (
              <div className="ai-ubah-folder" key={f.dir || '/'}>
                <div className="ai-ubah-folder-row">
                  <button
                    type="button"
                    className="ai-ubah-folder-head"
                    data-testid="ai-ubah-folder"
                    data-dir={f.dir}
                    aria-expanded={!lipat}
                    title={f.dir || '/'}
                    onClick={() => alih(f.dir)}
                  >
                    <span className="ai-ubah-caret" aria-hidden="true">
                      {lipat ? '▸' : '▾'}
                    </span>
                    <span className="ai-ubah-folder-ikon" aria-hidden="true">
                      <AiIkon name="folder" size={12} />
                    </span>
                    <span className="ai-ubah-folder-nama">{f.dir || '/'}</span>
                    <span className="ai-ubah-stat">
                      <span className="ai-ubah-tambah">
                        +{f.berkas.reduce((n, b) => n + (angka.get(b.path)?.tambah ?? 0), 0)}
                      </span>
                      <span className="ai-ubah-hapus">
                        −{f.berkas.reduce((n, b) => n + (angka.get(b.path)?.hapus ?? 0), 0)}
                      </span>
                    </span>
                  </button>
                  <span
                    role="button"
                    tabIndex={0}
                    className="ai-ubah-diff ai-ubah-diff-kecil"
                    data-testid="ai-ubah-folder-diff"
                    title={tr('Open DiffView')}
                    onClick={() => bukaDiff()}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      bukaDiff();
                    }}
                  >
                    <span>Diff</span>
                  </span>
                </div>

                {!lipat &&
                  f.berkas.map((b, i) => (
                    <div
                      className={`ai-ubah-baris${b.gagal ? ' is-gagal' : ''}`}
                      key={b.path}
                      data-testid="ai-ubah-baris"
                      /* Each row arrives a beat after the one above it; the
                         index is the only state the animation needs. */
                      style={{ ['--i' as string]: String(iFolder * 3 + i) }}
                      title={b.path}
                    >
                      <button
                        type="button"
                        className="ai-ubah-baris-buka"
                        onClick={() => bukaBerkas(b.path)}
                      >
                        <span className="ai-ubah-ikon" aria-hidden="true">
                          {b.gagal ? <AiIkon name="warn" size={12} /> : <FileIkon nama={b.nama} />}
                        </span>
                        <span className="ai-ubah-nama">{b.nama}</span>
                        {b.dir && <span className="ai-ubah-dir">{b.dir}</span>}
                        <span className="ai-ubah-stat">
                          <span className="ai-ubah-tambah">+{angka.get(b.path)?.tambah ?? 0}</span>
                          <span className="ai-ubah-hapus">−{angka.get(b.path)?.hapus ?? 0}</span>
                        </span>
                      </button>
                      <span
                        role="button"
                        tabIndex={0}
                        className="ai-ubah-file-diff"
                        data-testid="ai-ubah-file-diff"
                        title={tr('Open DiffView')}
                        onClick={() => bukaDiff(b.path)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          bukaDiff(b.path);
                        }}
                      >
                        <AiIkon name="diff" size={11} />
                      </span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
