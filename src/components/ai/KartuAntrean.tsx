import { useState } from 'react';
import { useAi, type AntrianPesan } from '../../lib/aiStore';
import { useT, useTf } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * A stable empty list for the queue selector, same trick as AiPanel's
 * ANTRIAN_KOSONG: zustand v5 compares selector output with `===`, so a frozen
 * array keeps a panel that has never queued anything from re-rendering on
 * every store write.
 */
const ANTRIAN_KOSONG: AntrianPesan[] = [];

/*
 * Kartu antrean DI DALAM alur chat — dipindah dari work-stack lama di atas
 * composer. Isinya persis section Queue yang lama (baris + inline edit +
 * kirim sekarang + geser urutan + buang + kosongkan), hanya dibungkus kartu
 * Qoder-style. Testid dan kelas `ai-cq-*` dipertahankan supaya CSS lama dan
 * harness tetap sah.
 */
export default function KartuAntrean({ composerId }: { composerId: string }) {
  const tr = useT();
  const tf = useTf();
  const antrian = useAi((s) => s.antrians[composerId] ?? ANTRIAN_KOSONG);
  const buangAntrian = useAi((s) => s.buangAntrian);
  const kosongkanAntrian = useAi((s) => s.kosongkanAntrian);
  const kirimAntrian = useAi((s) => s.kirimAntrian);
  const naikkanAntrian = useAi((s) => s.naikkanAntrian);
  const turunkanAntrian = useAi((s) => s.turunkanAntrian);
  const ubahAntrian = useAi((s) => s.ubahAntrian);
  /* Status "sibuk" milik permukaan ini, untuk judul tombol kirim-sekarang. */
  const pending = useAi((s) => s.pendings[composerId] ?? null);
  const agentBusy = useAi((s) => s.agentBusys[composerId] ?? false);
  const sibuk = pending || agentBusy;

  /*
   * The queue opens expanded.
   *
   * A queued message must be visible without a click - the point of parking a
   * message is being able to see it is parked. Collapsing is one click away.
   */
  const [cqLipat, setCqLipat] = useState(false);
  /*
   * Identitas baris antrian memakai id stabil milik item, bukan indeks array.
   * Dulu `cqEdit` menyimpan indeks: begitu baris dinaikkan/diturunkan, indeks
   * yang sama menunjuk pesan lain sehingga draft bisa tersimpan ke pesan yang
   * salah. Item lama yang belum punya id jatuh ke indeks sebagai cadangan.
   */
  const [cqEdit, setCqEdit] = useState<number | string | null>(null);
  const [cqDraft, setCqDraft] = useState('');

  if (antrian.length === 0) return null;

  return (
    <section className="experts-kartu" data-testid="experts-antrean">
      <div className="ai-cq" data-testid="ai-antrian" data-collapsed={cqLipat ? '1' : '0'}>
        {/*
         * The queue folds away.
         *
         * The count stays visible either way: the queue is state the user needs
         * to remember they set up, but a long queue should not push the whole
         * transcript around while they read the answer. Collapsed it is a
         * single header line; expanded it is the row list.
         */}
        <div className="ai-work-head">
          <button
            className="ai-work-summary"
            data-testid="ai-cq-toggle"
            aria-expanded={!cqLipat}
            aria-controls="ai-work-queue-body"
            onClick={() => setCqLipat((v) => !v)}
          >
            <span className="ai-work-caret" aria-hidden="true">
              {cqLipat ? '▸' : '▾'}
            </span>
            <span className="ai-work-glyph is-done" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
              </svg>
            </span>
            <span className="ai-work-title">
              {tf('Message queued {n}', { n: antrian.length })}
            </span>
          </button>
          {/*
            * Clear-all, on the trailing edge of the header.
            *
            * A section's bulk action belongs in the header's accessory slot,
            * where it costs no extra height and sits with the count it acts on.
            */}
          <button
            className="ai-work-menu ai-cq-clear"
            data-testid="ai-antrian-clear"
            title={tr('Clear the queue')}
            aria-label={tr('Clear the queue')}
            onClick={() => kosongkanAntrian(composerId)}
          >
            ✕
          </button>
        </div>
        {!cqLipat && (
          <>
            {/*
              * One row per queued message: the dismiss `✕` sits on the LEADING
              * edge (via the actions cluster), then the number, then the text,
              * and the actions (send-now / reorder / remove) sit on the
              * trailing edge where they only surface on hover. The queue reads
              * top-to-bottom like a list of sentences.
              */}
            <div className="ai-cq-list ai-review-queue" id="ai-work-queue-body" data-testid="ai-antrian">
              {antrian.map((a, i) => (
                <div
                  className="ai-cq-row ai-review-antrian"
                  key={a.id ?? i}
                  data-testid={`ai-antrian-${i}`}
                >
                  <span className="ai-review-antrian-no" aria-hidden="true">
                    {i + 1}
                  </span>
                  {a.images.length > 0 && (
                    <span
                      className="ai-review-antrian-img"
                      data-testid={`ai-antrian-images-${i}`}
                      title={tf('{n} image attachments', { n: a.images.length })}
                      aria-label={tf('{n} image attachments', { n: a.images.length })}
                    >
                      <AiIkon name="image" size={11} />
                      {a.images.length}
                    </span>
                  )}
                  {cqEdit === (a.id ?? String(i)) ? (
                    /*
                     * Inline edit of one queued message.
                     *
                     * The field replaces the row's text rather than opening a
                     * dialog: the queue is a list of short lines, and the
                     * cheapest way to fix one is to type over it where it sits.
                     * Enter or blur commits, Escape cancels, and a blank commit
                     * keeps the original so the message cannot be erased by
                     * clearing the box.
                     */
                    <input
                      className="ai-cq-edit"
                      data-testid={`ai-antrian-edit-${i}`}
                      autoFocus
                      value={cqDraft}
                      aria-label={tr('Edit the queued message')}
                      onChange={(e) => setCqDraft(e.target.value)}
                      onKeyDown={(e) => {
                        /*
                         * The composer listens for Enter on its textarea to
                         * send; this field is not that textarea, so the key has
                         * to be kept from bubbling up to it or editing a queued
                         * message would fire a whole new send.
                         */
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          ubahAntrian(a.id ?? i, cqDraft, composerId);
                          setCqEdit(null);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setCqEdit(null);
                        }
                      }}
                      onBlur={() => {
                        ubahAntrian(a.id ?? i, cqDraft, composerId);
                        setCqEdit(null);
                      }}
                    />
                  ) : (
                    <span
                      className="ai-cq-t ai-review-antrian-teks"
                      data-testid={`ai-antrian-teks-${i}`}
                      title={a.teks}
                      role="button"
                      tabIndex={0}
                      aria-label={tr('Edit the queued message')}
                      onClick={() => {
                        setCqEdit(a.id ?? String(i));
                        setCqDraft(a.teks);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        setCqEdit(a.id ?? String(i));
                        setCqDraft(a.teks);
                      }}
                    >
                      {a.teks}
                    </span>
                  )}
                  {/*
                    * Row actions, revealed on hover - two reorder arrows and a
                    * send arrow on every row would out-shout the message text;
                    * hidden until the row is hovered, they are there when
                    * wanted and invisible when reading.
                    */}
                  <span className="ai-cq-aksi">
                    <button
                      className={`ai-cq-send${sibuk ? ' is-sibuk' : ''}`}
                      data-testid={`ai-antrian-kirim-${i}`}
                      title={sibuk ? tr('Send now (stops the current turn)') : tr('Send this now')}
                      aria-label={sibuk ? tr('Send now (stops the current turn)') : tr('Send this now')}
                      onClick={() => void kirimAntrian(i, composerId, { sekarang: true })}
                    >
                      <AiIkon name="send" size={11} />
                    </button>
                    <button
                      className="ai-cq-move"
                      data-testid={`ai-antrian-naik-${i}`}
                      title={tr('Move up in the queue')}
                      aria-label={tr('Move up in the queue')}
                      disabled={i === 0}
                      onClick={() => naikkanAntrian(a.id ?? i, composerId)}
                    >
                      <AiIkon name="chev-up" size={11} />
                    </button>
                    <button
                      className="ai-cq-move"
                      data-testid={`ai-antrian-turun-${i}`}
                      title={tr('Move down in the queue')}
                      aria-label={tr('Move down in the queue')}
                      disabled={i === antrian.length - 1}
                      onClick={() => turunkanAntrian(a.id ?? i, composerId)}
                    >
                      <AiIkon name="chev-down" size={11} />
                    </button>
                    <button
                      className="ai-review-antrian-buang"
                      data-testid={`ai-antrian-hapus-${i}`}
                      title={tr('Remove from the queue')}
                      aria-label={tr('Remove from the queue')}
                      onClick={() => buangAntrian(a.id ?? i, composerId)}
                    >
                      <AiIkon name="close" size={10} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
