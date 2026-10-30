import { useMemo, useState } from 'react';
import type { AgentToolRun } from '../../lib/types';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useDiff, useDiffBerkas } from '../../lib/diffStore';
import { bukaPanelAgx } from '../../lib/agxPanel';
import { tx, tf, useT } from '../../lib/i18n';
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
 * Shape, following the Qoder reference - compact card, caret BEFORE the doc
 * icon, a green "Accepted" verdict beside every stat, and a footer with the
 * turn's two verdicts while the card is expanded:
 *
 *   ⌄ [doc] 2 Changed Files                  +107 -48  Accepted   [↗]
 *   ─────────────────────────────────────────────────────────────────
 *   [TS] WorkingSet     .src/components/explorer/WorkingSet.tsx  +10 -7  Accepted
 *   [TS] ExplorerPanel  .src/components/explorer/ExplorerPanel.tsx  +97 -41  Accepted
 *   ─────────────────────────────────────────────────────────────────
 *   [Discard all] [Keep all]
 *
 * The footer: "Keep all" marks the card accepted - it collapses and dims, the
 * changes stay on disk. "Discard all" runs the checkpoint restore (same flow as
 * ChatMessage's review bar) and, on full success, removes the card entirely -
 * there is nothing left to review. It only renders when the card carries a
 * checkpoint; without one the reader still gets "Keep all".
 *
 * ONE card, one row per file, full relative path dimmed beside the name. The
 * folder-group rows this card used to draw are gone: the reference does not
 * group, and a group row that repeats the same directory four times cost more
 * vertical space than it saved - the reader came here to see FILES.
 */

/** One file the session wrote to, with its numbers added up. */
export type Berkas = {
  path: string;
  /** File name including its extension. */
  nama: string;
  /** Name without the extension - what the reference shows in bold. */
  judul: string;
  /** Directory part, empty for a root file. */
  dir: string;
  tambah: number;
  hapus: number;
  gagal: boolean;
};

function pisahPath(path: string): { dir: string; nama: string } {
  const bersih = path.replace(/\\/g, '/');
  const i = bersih.lastIndexOf('/');
  return i < 0
    ? { dir: '', nama: bersih }
    : { dir: bersih.slice(0, i), nama: bersih.slice(i + 1) };
}

/*
 * Roll the per-file numbers into one row per file.
 *
 * A failed call is still counted: `perubahanTool` captures the AFTER side on
 * failure too, because a patch can write one file before failing on the next.
 * An empty result therefore means the session never wrote anything, and only
 * then is there nothing to show.
 */
function susun(peta: Map<string, AgentToolRun[]>): Berkas[] {
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
    berkas.push({
      path,
      nama,
      judul: nama.replace(/\.[^.]+$/, '') || nama,
      dir,
      tambah,
      hapus,
      gagal,
    });
  }
  berkas.sort((a, b) => a.path.localeCompare(b.path));
  return berkas;
}

/*
 * Keep/Discard decisions per card, keyed by `cardKey` (the owning message id).
 *
 * Module-level, like ChatMessage's PLAN_IZIN_TUTUP: a card the reader has
 * already decided about must not spring back when the transcript re-renders the
 * same message. 'keep'    = accepted: the card stays, collapsed and dimmed.
 * 'discard' = undone: the card is removed from the transcript entirely.
 */
const KEPUTUSAN_UBAH = new Map<string, 'keep' | 'discard'>();

export default function PerubahanBerkas({
  peta,
  daftar,
  permukaan = 'main',
  checkpoint,
  cardKey,
}: {
  /** Live tool rows for the SESSION (legacy: the pinned-end-of-chat card). */
  peta?: Map<string, AgentToolRun[]>;
  /**
   * Frozen rows carried by ONE message.
   *
   * This is the card as the transcript draws it now: built once when the run
   * ended and stored on the message, so it stays where it was inserted and
   * scrolls away with the history. `peta` is kept so an older call site still
   * compiles, but nothing in the transcript uses it any more.
   */
  daftar?: Berkas[];
  /*
   * Which window this card is in.
   *
   * `main` opens the DiffView as an editor tab, which is the reference's
   * behaviour there - the diff gets the whole editor column.
   *
   * `agents` must NOT do that. The Agents window's chat column is narrow, so an
   * editor tab would be squeezed beside it; the reference opens the diff in the
   * RIGHT PANEL instead ("Diff View" is one of that panel's tabs). Same data,
   * same click, different destination.
   */
  permukaan?: 'main' | 'agents';
  /**
   * The turn's checkpoint, when the message carries one.
   *
   * "Discard all" needs it: restoring means replaying the checkpoint against
   * the disk. Optional because old messages (and the legacy `peta` call site)
   * have none - the footer then degrades to "Keep all" only.
   */
  checkpoint?: import('../../lib/checkpoint').Checkpoint;
  /**
   * Identity of the card = the id of the message it belongs to.
   *
   * Key for the module-level KEPUTUSAN_UBAH map, so a Keep/Discard decision
   * survives every re-render of the same message. Without it the decision only
   * lives in component state and a remount would bring the card back.
   */
  cardKey?: string;
}) {
  const tr = useT();
  const setToast = useAi((s) => s.setToast);
  const [terbuka, setTerbuka] = useState(false);
  /* The reader's verdict on this card, seeded from the module map so a
     re-mount of the same message does not resurrect a decided card. */
  const [keputusan, setKeputusan] = useState<'keep' | 'discard' | null>(() =>
    cardKey ? (KEPUTUSAN_UBAH.get(cardKey) ?? null) : null,
  );
  /* While the checkpoint restore runs both footer buttons are disabled - a
     second click mid-restore would race the first one's file writes. */
  const [memulihkan, setMemulihkan] = useState(false);

  const berkas = useMemo(
    () => daftar ?? (peta ? susun(peta) : []),
    [daftar, peta],
  );

  /*
   * Numbers from the ACTUAL snapshot, when it has them.
   *
   * The tool row carries the numbers the agent reported; `diffStore` carries
   * the ones measured from the before/after capture. The latter is the truth,
   * so it wins when present, and the row numbers are the fallback for a file
   * the store never saw (a delete, or a run that predates the store).
   *
   * A frozen `daftar` already IS that measured snapshot, so it is used as-is -
   * reading the live store here would let a LATER run rewrite an OLD card.
   */
  const terukur = useDiffBerkas();

  const angka = useMemo(() => {
    const p = new Map<string, { tambah: number; hapus: number }>();
    for (const b of berkas) {
      if (daftar) {
        p.set(b.path, { tambah: b.tambah, hapus: b.hapus });
        continue;
      }
      const m = terukur.find((x) => x.path === b.path);
      p.set(b.path, m ? { tambah: m.tambah, hapus: m.hapus } : { tambah: b.tambah, hapus: b.hapus });
    }
    return p;
  }, [berkas, terukur, daftar]);


  /* Nothing was written: no card. A read-only session has nothing to summarise. */
  if (berkas.length === 0) return null;

  /* The turn was discarded: the card has nothing left to show. Module map keeps
     it gone across re-renders, exactly like ChatMessage's dismissed plan card. */
  if (keputusan === 'discard') return null;

  const totalTambah = berkas.reduce((n, b) => n + (angka.get(b.path)?.tambah ?? 0), 0);
  const totalHapus = berkas.reduce((n, b) => n + (angka.get(b.path)?.hapus ?? 0), 0);

  const bukaBerkas = (path: string) => {
    if (permukaan === 'agents') {
      bukaPanelAgx('file', path);
      return;
    }
    void useStore.getState().openPath(path).catch(() => undefined);
  };

  const bukaDiff = (path?: string) => {
    if (path) useDiff.getState().pilih(path);
    if (permukaan === 'agents') {
      bukaPanelAgx('diff-view');
      return;
    }
    useStore.getState().bukaViewAi('diff-view');
  };

  /*
   * Keep all: accept every change this turn made. No disk action - the card
   * collapses and dims, and the decision is remembered so it does not ask
   * again. The reader can still unfold it to look at the numbers.
   */
  const simpanSemua = () => {
    if (cardKey) KEPUTUSAN_UBAH.set(cardKey, 'keep');
    setKeputusan('keep');
    setTerbuka(false);
  };

  /**
   * Discard all: put every file this turn changed back the way it was.
   *
   * The restore + report flow is ChatMessage's `pulihkan`, verbatim: a clean
   * restore says how many files moved (toast); a PARTIAL one names the
   * failures (notification), because a reader who thinks everything was undone
   * and finds one file still edited has lost the very thing the button
   * promised. A partial failure keeps the card up - there are still changes
   * on disk to decide about. On full success the card dismisses itself.
   */
  const buangSemua = async () => {
    if (!checkpoint || memulihkan) return;
    setMemulihkan(true);
    try {
      const { pulihkanCheckpoint } = await import('../../lib/checkpoint');
      const hasil = await pulihkanCheckpoint(checkpoint, async (path) => {
        const { fsDelete } = await import('../../lib/commands');
        await fsDelete([path], false);
      });
      const jumlah = hasil.dipulihkan.length + hasil.dihapus.length;
      if (hasil.gagal.length === 0) {
        setToast(tf('{x} file dikembalikan', { x: String(jumlah) }));
        if (cardKey) KEPUTUSAN_UBAH.set(cardKey, 'discard');
        setKeputusan('discard');
      } else {
        const { useNotif } = await import('../../lib/notificationStore');
        useNotif.getState().notify({
          severity: 'error',
          message: tx('Sebagian berkas gagal dikembalikan'),
          detail: hasil.gagal.map((g) => `${g.path}: ${g.pesan}`).join('\n'),
          source: 'Checkpoint',
        });
      }
    } finally {
      setMemulihkan(false);
    }
  };

  return (
    <div
      className={`ai-ubah${keputusan === 'keep' ? ' is-terima' : ''}`}
      data-testid="ai-perubahan"
      data-open={terbuka ? '1' : '0'}
    >
      <div className="ai-ubah-kepala">
        {/*
         * The whole left side is the fold toggle: caret, icon and title. The
         * "Accepted" badge, the totals and the open control stay OUTSIDE it, so
         * clicking them cannot fold the card by accident.
         */}
        <button
          type="button"
          className="ai-ubah-toggle"
          data-testid="ai-perubahan-toggle"
          aria-expanded={terbuka}
          title={terbuka ? tr('Hide files') : tr('Show files')}
          onClick={() => setTerbuka(!terbuka)}
        >
          <span className="ai-ubah-caret" aria-hidden="true">
            <AiIkon name={terbuka ? 'chev-up' : 'chev-down'} size={12} />
          </span>
          <span className="ai-ubah-ikon-kartu" aria-hidden="true">
            <AiIkon name="doc" size={14} />
          </span>
          <span className="ai-ubah-judul">{tf('{n} Changed Files', { n: berkas.length })}</span>
        </button>
        <span className="ai-ubah-stat">
          <span className="ai-ubah-tambah">+{totalTambah}</span>
          <span className="ai-ubah-hapus">−{totalHapus}</span>
        </span>
        {/*
         * The green verdict of the Qoder reference, beside the totals: this
         * turn's writes landed and are readable as accepted. A status label,
         * not a control - it never catches clicks meant for the toggle.
         */}
        <span className="ai-ubah-badge">{tr('Accepted')}</span>
        {/*
         * The open-in-editor control, drawn as the reference's diagonal arrow.
         * A sibling of the toggle, never a child of it: a button cannot contain
         * another button, and this one must open the diff instead of folding
         * the card.
         */}
        <button
          type="button"
          className="ai-ubah-buka-diff"
          data-testid="ai-perubahan-diff"
          title={permukaan === 'agents' ? tr('Open Diff View') : tr('Open DiffView')}
          aria-label={permukaan === 'agents' ? tr('Open Diff View') : tr('Open DiffView')}
          onClick={() => bukaDiff()}
        >
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.2 3.4h6.4v6.4M12.4 3.6 3.6 12.4" />
          </svg>
        </button>
      </div>

      <div className="ai-ubah-isi" aria-hidden={!terbuka}>
        <div className="ai-ubah-gulir">
          {berkas.map((b, i) => (
            <div
              className={`ai-ubah-baris${b.gagal ? ' is-gagal' : ''}`}
              key={b.path}
              data-testid="ai-ubah-baris"
              /* Each row arrives a beat after the one above it; the index is
                 the only state the animation needs. */
              style={{ ['--i' as string]: String(i) }}
              title={b.path}
            >
              <button
                type="button"
                className="ai-ubah-baris-buka"
                data-testid="ai-ubah-buka-berkas"
                title={b.path}
                onClick={() => bukaBerkas(b.path)}
              >
                <span className="ai-ubah-ikon" aria-hidden="true">
                  {b.gagal ? <AiIkon name="warn" size={13} /> : <FileIkon nama={b.nama} />}
                </span>
                <span className="ai-ubah-nama">{b.judul}</span>
                <span className="ai-ubah-dir">.{b.path.replace(/\\/g, '/')}</span>
                <span className="ai-ubah-stat">
                  <span className="ai-ubah-tambah">+{angka.get(b.path)?.tambah ?? 0}</span>
                  <span className="ai-ubah-hapus">−{angka.get(b.path)?.hapus ?? 0}</span>
                </span>
                {/*
                 * Per-row verdict, right-aligned after the stats: the file's
                 * write is accepted. Same quiet green as the header badge.
                 */}
                <span className="ai-ubah-badge">{tr('Accepted')}</span>
              </button>
              <button
                type="button"
                className="ai-ubah-file-diff"
                data-testid="ai-ubah-file-diff"
                title={tr('Open DiffView')}
                aria-label={tr('Open DiffView')}
                onClick={() => bukaDiff(b.path)}
              >
                <AiIkon name="diff" size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/*
       * Footer actions, only while the card is expanded. "Discard all" needs a
       * checkpoint to restore, so without one the footer degrades to a lone
       * "Keep all". Both are ghost buttons: the verdicts matter, but they must
       * not shout louder than the file list above them.
       */}
      {terbuka && (
        <div className="ai-ubah-kaki">
          {checkpoint && (
            <button
              type="button"
              className="ai-ubah-kaki-btn is-buang"
              data-testid="ai-ubah-buang"
              disabled={memulihkan}
              onClick={() => void buangSemua()}
            >
              {tr('Discard all')}
            </button>
          )}
          <button
            type="button"
            className="ai-ubah-kaki-btn"
            data-testid="ai-ubah-simpan"
            disabled={memulihkan}
            onClick={simpanSemua}
          >
            {tr('Keep all')}
          </button>
        </div>
      )}
    </div>
  );
}
