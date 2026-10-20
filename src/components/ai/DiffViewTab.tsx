import { useEffect, useMemo, useState } from 'react';
import { barisDiff } from '../../lib/simpleDiff';
import type { DiffRow } from '../../lib/simpleDiff';
import { useDiff } from '../../lib/diffStore';
import { useStore } from '../../lib/store';
import { useT, useTf } from '../../lib/i18n';
import { barisKomentar, sorotBaris } from '../../lib/sorotBaris';
import '../../styles/ai-diffview.css';

/*
 * DiffView - what the AI changed this turn, as a review surface in the editor.
 *
 * ## Why it is a tab and not a popup
 *
 * A diff is read start to finish, side by side with the file it belongs to. A
 * floating window covers the code the reader is comparing against, and can be
 * closed by accident. A tab keeps the file tabs next to it, survives a click in
 * the editor, and closes like everything else.
 *
 * ## Two panes, one scroll
 *
 * The left pane is the file before the turn, the right pane after. The two
 * columns share a row model (`barisDiff`), so line i on the left and line i on
 * the right describe the same point in the file - which is the whole reason a
 * side-by-side diff is easier to read than a unified one. Collapsed runs of
 * unchanged lines are folded into a "N hidden lines" strip that expands on
 * click, because a 40-line insertion in a 900-line file should show 40 lines,
 * not 900.
 *
 * ## The numbers are the store's
 *
 * `+N −N` per file comes from `diffStore`, computed from the captured before
 * and after content. Nothing here re-counts a unified diff: two sources for one
 * number is how a card and a diff end up disagreeing.
 */

/** How many unchanged lines stay visible on each side of a change. */
const KONTEKS = 3;

/** One visual row of the side-by-side grid. */
type Baris = {
  /** Row kind: unchanged, only-on-left, only-on-right, filler opposite a change. */
  jenis: 'sama' | 'hapus' | 'tambah' | 'kosong';
  kiri: string | null;
  kanan: string | null;
  noKiri: number | null;
  noKanan: number | null;
};

/** A run of rows, either a visible block or a folded one. */
type Potongan =
  | { jenis: 'baris'; baris: Baris[] }
  | { jenis: 'lipat'; jumlah: number; id: number };

/**
 * Turn a diff into the two-column row model.
 *
 * A `del` row pairs with an `add` row when one immediately follows the other -
 * that is a modification, and showing the old and new side by side on the same
 * line is what makes it readable. Runs of deletions and additions that are not
 * paired leave the opposite column empty, which is the honest picture of an
 * insertion or a removal.
 */
function susunBaris(rows: DiffRow[]): Baris[] {
  const out: Baris[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.kind === 'same') {
      out.push({ jenis: 'sama', kiri: r.text, kanan: r.text, noKiri: r.a, noKanan: r.b });
      i++;
      continue;
    }
    if (r.kind === 'del') {
      /* Gather the whole run of deletions, then the run of additions after it. */
      const hapus: DiffRow[] = [];
      while (i < rows.length && rows[i].kind === 'del') hapus.push(rows[i++]);
      const tambah: DiffRow[] = [];
      while (i < rows.length && rows[i].kind === 'add') tambah.push(rows[i++]);
      const n = Math.max(hapus.length, tambah.length);
      for (let k = 0; k < n; k++) {
        const h = hapus[k];
        const t = tambah[k];
        out.push({
          jenis: t ? 'tambah' : 'hapus',
          kiri: h ? h.text : null,
          kanan: t ? t.text : null,
          noKiri: h ? h.a : null,
          noKanan: t ? t.b : null,
        });
      }
      continue;
    }
    out.push({ jenis: 'tambah', kiri: null, kanan: r.text, noKiri: null, noKanan: r.b });
    i++;
  }
  return out;
}

/**
 * A file that did not exist before, or does not exist now.
 *
 * `barisDiff('', isi)` reports every line of a new file as an addition, which
 * paints the right column correctly - but the LEFT column then numbers those
 * rows from a file that has no lines at all. Rather than fight the diff over
 * it, the two one-sided cases are built directly: an empty side contributes
 * nothing, and only the other column is numbered.
 */
function barisSatuSisi(sebelum: string | null, sesudah: string | null): Baris[] {
  /*
   * Note the deliberate asymmetry. A file that was deleted and a file that was
   * created are different events, but the grid draws both as "rows on one
   * side", so the only thing that differs is which column gets the text.
   */
  const isi = (sebelum ?? sesudah ?? '').split('\n');
  if (isi.length > 0 && isi[isi.length - 1] === '') isi.pop();
  const baru = sebelum === null;
  return isi.map((teks, i) => ({
    jenis: baru ? 'tambah' : 'hapus',
    kiri: baru ? null : teks,
    kanan: baru ? teks : null,
    noKiri: baru ? null : i + 1,
    noKanan: baru ? i + 1 : null,
  }));
}

/** Fold long unchanged runs, keeping KONTEKS lines on each side. */
function lipat(baris: Baris[], terbuka: Set<number>): Potongan[] {
  const out: Potongan[] = [];
  let i = 0;
  let id = 0;
  while (i < baris.length) {
    if (baris[i].jenis !== 'sama') {
      out.push({ jenis: 'baris', baris: [baris[i]] });
      i++;
      continue;
    }
    let j = i;
    while (j < baris.length && baris[j].jenis === 'sama') j++;
    const jumlah = j - i;
    /* A run short enough to show whole is not worth a fold control. */
    if (jumlah <= KONTEKS * 2 + 1 || terbuka.has(id)) {
      out.push({ jenis: 'baris', baris: baris.slice(i, j) });
    } else {
      out.push({ jenis: 'baris', baris: baris.slice(i, i + KONTEKS) });
      out.push({ jenis: 'lipat', jumlah: jumlah - KONTEKS * 2, id });
      out.push({ jenis: 'baris', baris: baris.slice(j - KONTEKS, j) });
    }
    id++;
    i = j;
  }
  return out;
}

function namaBerkas(path: string): string {
  const pisah = path.split(/[\\/]/);
  return pisah[pisah.length - 1] || path;
}

/*
 * One cell of code, with its tokens coloured.
 *
 * The tint of the ROW (green/red wash) has to stay readable under the token
 * colours, so the token palette is used for the text and the wash only for the
 * background. A changed line keeps its green/red wash; the words inside it keep
 * the colours they would have in the editor.
 */
function TeksKode({ teks }: { teks: string }) {
  const token = useMemo(() => sorotBaris(teks), [teks]);
  if (barisKomentar(teks)) return <span className="dv-tok-komentar">{teks}</span>;
  return (
    <>
      {token.map((t, i) =>
        t.jenis === null ? (
          <span key={i}>{t.teks}</span>
        ) : (
          <span key={i} className={`dv-tok dv-tok-${t.jenis}`}>
            {t.teks}
          </span>
        ),
      )}
    </>
  );
}

function folderInduk(path: string): string {
  const pisah = path.split(/[\\/]/);
  pisah.pop();
  return pisah.join('/');
}

/** File-type glyph, from the extension - same shapes the explorer uses. */
function ikonBerkas(nama: string): string {
  const ext = nama.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'TS';
  if (['css', 'scss', 'less'].includes(ext)) return '#';
  if (['json', 'jsonc'].includes(ext)) return '{}';
  if (['md', 'mdx', 'txt'].includes(ext)) return '¶';
  if (['html', 'htm', 'svg'].includes(ext)) return '<>';
  if (['rs'].includes(ext)) return 'Rs';
  if (['py'].includes(ext)) return 'Py';
  return '·';
}

export default function DiffViewTab() {
  const tr = useT();
  const trf = useTf();
  const berkas = useDiff((s) => s.berkas);
  const sorot = useDiff((s) => s.sorot);
  const [dipilih, setDipilih] = useState(0);
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set());

  /*
   * A file row in the transcript can name the file it wants to see. When it
   * does, the pane opens on that file instead of the first one - otherwise
   * clicking `Diff` next to `foo.ts` showed `bar.ts` whenever the turn had
   * touched more than one file. Declared before any early return because the
   * hook order must stay fixed.
   *
   * The preference is spent as soon as it is honoured: `sorot` cannot be
   * cleared from inside the effect (that would loop), but the next open must
   * not silently jump back to an old file.
   */
  const [diminta] = useState(() => useDiff.getState().sorot);
  useEffect(() => {
    if (diminta) useDiff.getState().pilih('');
  }, [diminta]);

  useEffect(() => {
    if (!sorot) return;
    const i = berkas.findIndex((b) => b.path === sorot);
    if (i >= 0) {
      setDipilih(i);
      setTerbuka(new Set());
    }
  }, [sorot, berkas]);

  const aktif = berkas[Math.min(dipilih, Math.max(berkas.length - 1, 0))];
  const totalTambah = berkas.reduce((n, b) => n + b.tambah, 0);
  const totalHapus = berkas.reduce((n, b) => n + b.hapus, 0);

  const rows = useMemo(() => {
    if (!aktif) return [];
    if (aktif.sebelum === null || aktif.sesudah === null) {
      return barisSatuSisi(aktif.sebelum, aktif.sesudah);
    }
    return susunBaris(barisDiff(aktif.sebelum, aktif.sesudah));
  }, [aktif]);

  const potongan = useMemo(() => lipat(rows, terbuka), [rows, terbuka]);

  if (berkas.length === 0) {
    return (
      <section className="dv" data-testid="diffview-kosong">
        <p className="dv-kosong">{tr('No changes from the AI in this turn yet.')}</p>
      </section>
    );
  }

  return (
    <section className="dv" data-testid="diffview">
      <aside className="dv-daftar" data-testid="diffview-daftar">
        <header className="dv-daftar-head">
          <span className="dv-daftar-judul">{tr('Changes')}</span>
          <span className="dv-stat">
            <span className="dv-tambah">+{totalTambah}</span>
            <span className="dv-hapus">−{totalHapus}</span>
          </span>
        </header>
        <ul className="dv-daftar-isi">
          {berkas.map((b, i) => (
            <li key={b.path}>
              <button
                type="button"
                className={`dv-berkas${i === dipilih ? ' is-aktif' : ''}`}
                data-testid="diffview-berkas"
                data-path={b.path}
                title={b.path}
                onClick={() => {
                  setDipilih(i);
                  setTerbuka(new Set());
                }}
              >
                <span className="dv-ikon" aria-hidden="true">
                  {ikonBerkas(namaBerkas(b.path))}
                </span>
                <span className="dv-berkas-teks">
                  <span className="dv-berkas-nama">{namaBerkas(b.path)}</span>
                  <span className="dv-berkas-folder">{folderInduk(b.path)}</span>
                </span>
                <span className="dv-stat">
                  <span className="dv-tambah">+{b.tambah}</span>
                  <span className="dv-hapus">−{b.hapus}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="dv-pane" data-testid="diffview-pane">
        <header className="dv-pane-head">
          <span className="dv-pane-nama" title={aktif?.path}>
            {aktif ? namaBerkas(aktif.path) : ''}
          </span>
          <span className="dv-pane-folder">{aktif ? folderInduk(aktif.path) : ''}</span>
          <span className="sb-spacer" />
          <button
            type="button"
            className="btn btn-sm"
            data-testid="diffview-buka"
            onClick={() => aktif && void useStore.getState().openPath(aktif.path).catch(() => undefined)}
          >
            {tr('Open file')}
          </button>
        </header>

        <div className="dv-kolom-head">
          <span className="dv-kolom">{tr('Before')}</span>
          <span className="dv-kolom">{tr('After')}</span>
        </div>

        <div className="dv-isi" data-testid="diffview-isi">
          {potongan.map((p, i) =>
            p.jenis === 'lipat' ? (
              <button
                type="button"
                key={`f${p.id}`}
                className="dv-lipat"
                data-testid="diffview-lipat"
                onClick={() => setTerbuka((s) => new Set(s).add(p.id))}
              >
                <span aria-hidden="true">⋯</span> {trf('{n} hidden lines', { n: p.jumlah })}
              </button>
            ) : (
              p.baris.map((b, k) => (
                <div className={`dv-baris is-${b.jenis}`} key={`${i}-${k}`} data-kind={b.jenis}>
                  {/*
                   * One cell class per side: `dv-lama` is tinted as removed,
                   * `dv-baru` as added, and an unchanged row leaves both plain.
                   * A modified line therefore shows red on the left and green
                   * on the right in the same row.
                   */}
                  <span className="dv-no">{b.noKiri ?? ''}</span>
                  <span className={`dv-sel${b.kiri !== null && b.jenis !== 'sama' ? ' dv-lama' : ''}`}>
                    {b.jenis === 'hapus' ? '−' : b.jenis === 'tambah' ? '+' : ' '}
                  </span>
                  <span
                    className={`dv-teks${b.kiri !== null && b.jenis !== 'sama' ? ' dv-lama' : ''}`}
                  >
                    {b.kiri !== null && <TeksKode teks={b.kiri} />}
                  </span>
                  <span className="dv-no dv-no-baru">{b.noKanan ?? ''}</span>
                  <span className={`dv-sel${b.kanan !== null && b.jenis !== 'sama' ? ' dv-baru' : ''}`}>
                    {b.jenis === 'tambah' ? '+' : b.jenis === 'hapus' ? '−' : ' '}
                  </span>
                  <span className={`dv-teks${b.kanan !== null && b.jenis !== 'sama' ? ' dv-baru' : ''}`}>
                    {b.kanan !== null && <TeksKode teks={b.kanan} />}
                  </span>
                </div>
              ))
            ),
          )}
        </div>
      </div>
    </section>
  );
}
