import { useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useDiff, useDiffBerkas } from '../../lib/diffStore';
import { useStore } from '../../lib/store';
import { asZephyrError, fsDelete, fsWrite } from '../../lib/commands';
import { bukaPanelAgx } from '../../lib/agxPanel';
import { tf, useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import FileIkon from './FileIkon';
import '../../styles/ai-perubahan.css';

/*
 * The review bar above the composer.
 *
 * WHY it exists: the "files changed" card at the end of the transcript says what
 * the agent touched, but it appears only after scrolling to the bottom of a long
 * transcript and it offers no decision. The reader who just watched a run finish
 * needs the answer to one question - "do I keep this?" - within reach of the
 * message box, and needs it BEFORE typing the next message. So the bar lives
 * here: one row, the count, and the two buttons.
 *
 * Scope: the CURRENT turn, which is what `diffStore` captures (it resets on
 * every turn). The transcript card is session-wide and read-only by comparison;
 * deciding to keep or undo is a per-turn act, so it reads the per-turn list.
 *
 * Shape, following the reference (the user's screenshots):
 *
 *   [icon] 9 files to review ⌄                 Undo All   [ Keep All ]
 *
 * The destination of a click follows the surface, exactly like the transcript
 * card: the main window opens the DiffView as an editor tab, the Agents window
 * opens the right panel's Diff View (its chat column is too narrow for a split
 * diff beside it).
 */
export default function UbahReview({
  permukaan = 'main',
}: {
  permukaan?: 'main' | 'agents';
}) {
  const tr = useT();
  const berkas = useDiffBerkas();
  const [terbuka, setTerbuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  /* Nothing changed this turn: no bar. A chat that only read files has nothing
     to keep or undo. */
  if (berkas.length === 0) return null;

  /*
   * Undo All = put every file back the way it was before the agent wrote it.
   *
   * `sebelum === null` means the file did not exist, so "before" is "gone":
   * deleting it is the only honest restore. Each file is restored on its own so
   * one refusal (a locked file, a rules block) cannot leave the rest untouched;
   * the failures are counted and reported instead of being swallowed.
   *
   * The open tab is reloaded from disk afterwards. Without that the editor keeps
   * showing the agent's version while the file on disk has been reverted - the
   * worst of both, and the user would save it right back.
   */
  const undoAll = async () => {
    if (sibuk) return;
    setSibuk(true);
    let gagal = 0;
    let pesanGagal = '';
    for (const b of [...useDiff.getState().berkas]) {
      try {
        if (b.sebelum === null) await fsDelete([b.path]);
        else await fsWrite(b.path, b.sebelum, undefined, undefined, { wasExisting: true });
        await useStore.getState().reloadTabFromDisk(b.path);
        useDiff.getState().buang(b.path);
      } catch (e) {
        gagal++;
        if (!pesanGagal) pesanGagal = asZephyrError(e).message;
      }
    }
    setSibuk(false);
    useAi
      .getState()
      .setToast(
        gagal === 0
          ? tr('All changes undone')
          : `${tf('{n} files could not be undone', { n: gagal })} — ${pesanGagal}`,
      );
  };

  /* Keep All = accept what is on disk. The list empties, so the bar disappears;
     nothing is written, because the files already hold the kept version. */
  const keepAll = () => {
    if (sibuk) return;
    for (const b of [...useDiff.getState().berkas]) useDiff.getState().buang(b.path);
    useAi.getState().setToast(tr('Changes kept'));
  };

  const bukaDiff = (path: string) => {
    useDiff.getState().pilih(path);
    if (permukaan === 'agents') bukaPanelAgx('diff-view');
    else useStore.getState().bukaViewAi('diff-view');
  };

  /* Satu berkas tidak boleh berbunyi "1 files": the count is read at a glance,
     and wrong grammar there is the first thing the eye catches. */
  const judul =
    berkas.length === 1
      ? tr('1 file to review')
      : tf('{n} files to review', { n: berkas.length });

  return (
    <section className="ai-review" data-testid="ai-review" data-open={terbuka ? '1' : '0'}>
      <div className="ai-review-kepala">
        <button
          type="button"
          className="ai-review-toggle"
          data-testid="ai-review-toggle"
          aria-expanded={terbuka}
          title={terbuka ? tr('Hide the file list') : tr('Show the file list')}
          onClick={() => setTerbuka((v) => !v)}
        >
          <span className="ai-review-ikon" aria-hidden="true">
            <AiIkon name="check" size={12} />
          </span>
          <span className="ai-review-judul">{judul}</span>
          <span className="ai-review-caret" aria-hidden="true">
            <AiIkon name={terbuka ? 'chev-up' : 'chev-down'} size={11} />
          </span>
        </button>

        <div className="ai-review-aksi">
          <button
            type="button"
            className="ai-review-undo"
            data-testid="ai-review-undo"
            disabled={sibuk}
            onClick={() => void undoAll()}
          >
            {sibuk ? tr('Undoing…') : tr('Undo All')}
          </button>
          <button
            type="button"
            className="ai-review-keep"
            data-testid="ai-review-keep"
            disabled={sibuk}
            onClick={keepAll}
          >
            {tr('Keep All')}
          </button>
        </div>
      </div>

      <div className="ai-review-isi" aria-hidden={!terbuka}>
        <div className="ai-review-gulir">
          {berkas.map((b) => {
            const nama = b.path.split(/[\\/]/).pop() ?? b.path;
            return (
              <button
                type="button"
                className="ai-review-baris"
                data-testid="ai-review-baris"
                key={b.path}
                title={b.path}
                onClick={() => bukaDiff(b.path)}
              >
                <span className="ai-review-berkas-ikon" aria-hidden="true">
                  <FileIkon nama={nama} />
                </span>
                <span className="ai-review-nama">{nama.replace(/\.[^.]+$/, '') || nama}</span>
                <span className="ai-review-dir">.{b.path.replace(/\\/g, '/')}</span>
                <span className="ai-review-stat">
                  <span className="ai-ubah-tambah">+{b.tambah}</span>
                  <span className="ai-ubah-hapus">−{b.hapus}</span>
                </span>
                <span className="ai-review-baris-diff" aria-hidden="true">
                  <AiIkon name="diff" size={11} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
