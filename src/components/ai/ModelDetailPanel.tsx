/*
 * The model detail panel, shared by both pickers.
 *
 * WHY IT IS A COMPONENT AND NOT MARKUP INSIDE ONE PICKER. There are two pickers
 * in this app — the chat header's and the subagent form's — and they grew apart
 * once before: one had provider groups and logos, the other a flat list of
 * names. The reader asked for them to look the same, so the panel lives in one
 * place and both render it. A copy in each would drift the moment either is
 * touched.
 *
 * SHAPE (from the reference product): the model name, an "Available for" block
 * of ticked capabilities, Cost, and the context size.
 *
 * THE ACCENT IS SPENT ONCE: on the tick of a capability the model actually has.
 * It is `var(--accent)`, never a hardcoded green — this build's accent is the
 * user's theme colour, and the reference's green would clash with every other
 * control in the window.
 */
import { useT } from '../../lib/i18n';
import type { Kemampuan } from '../../lib/modelCatalog';

export interface ModelUntukPanel {
  id: string;
  label: string;
  note?: string;
  /** Already formatted by `fmtCtx`, e.g. "131K ctx". */
  ctx?: string;
  /** `undefined` = the provider said nothing; `[]` = known to support none. */
  bisa?: Kemampuan[];
  biaya?: string;
}

export default function ModelDetailPanel({
  model,
  testid,
  mengambang = false,
  rect = null,
}: {
  model: ModelUntukPanel | null;
  testid: string;
  /**
   * Draw as a floating CARD beside the picker instead of a column inside it.
   *
   * The card is what the reference product shows: it appears next to the list
   * when the pointer lands on a row, and the list keeps its own width. A column
   * inside the menu is a different thing — it steals width from the names and
   * reads as part of the menu rather than as a description of one row.
   */
  mengambang?: boolean;
  /** Measured viewport coordinates, required when `mengambang`. */
  rect?: {
    left: number;
    top: number;
    width: number;
  } | null;
}) {
  const tr = useT();

  /*
   * Nothing to describe yet. The box still renders (empty) so the two-column
   * layout does not jump when the first row is hovered — a panel that appears
   * and disappears would shift the list under the pointer.
   */
  if (!model) return <aside className="ai-mp-detail" data-testid={testid} aria-hidden="true" />;

  const bisa = model.bisa ?? [];
  const punya = (k: Kemampuan) => bisa.includes(k);
  const dikenal = model.bisa !== undefined;

  /*
   * Floating mode: a fixed, measured card. `z-index` sits above the menu so it
   * is never painted under it, and `pointer-events: none` keeps it out of the
   * way — moving the pointer onto it must not steal the hover that is filling
   * it, which would make the card flicker.
   */
  const gayaMengambang: React.CSSProperties | undefined = mengambang
    ? {
        position: 'fixed',
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width ?? 208,
        zIndex: 1200,
      }
    : undefined;

  /*
   * Only what the model CAN do is listed.
   *
   * The panel used to print all four rows with a dash for the missing ones,
   * which turned a description into a checklist of absences — four lines where
   * the reader only ever cares about the ticks. Now:
   *
   *   - capabilities it has        -> one ticked row each
   *   - known to have none         -> "No support"
   *   - provider said nothing      -> "Not reported by this provider."
   *
   * The two empty cases stay DISTINCT because they are different claims, and a
   * reader deciding whether to attach an image needs to know which one it is.
   */
  const baris = (k: Kemampuan, label: string) => (
    <div className="ai-mp-cap is-ok" data-cap={k}>
      <span className="ai-mp-cap-tanda" aria-hidden="true">
        ✓
      </span>
      <span className="ai-mp-cap-nama">{tr(label)}</span>
    </div>
  );

  /*
   * Memories is a ZEPHYR feature, not a property of the remote model, so it is
   * never inferred and never claimed. It is behind a flag rather than deleted:
   * when the feature ships, flipping this makes the row appear with a real tick
   * instead of the placeholder "Soon" chip it used to carry.
   */
  const MEMORI_TERSEDIA = false;

  return (
    <aside
      className={`ai-mp-detail${mengambang ? ' is-mengambang' : ''}`}
      data-testid={testid}
      data-model={model.id}
      style={gayaMengambang}
    >
      <div className="ai-mp-detail-nama" title={model.id}>
        {model.label}
      </div>

      <div className="ai-mp-detail-seksi">{tr('Available for')}</div>
      {!dikenal ? (
        <div className="ai-mp-detail-kecil" data-cap="tidak-dilaporkan">
          {tr('Not reported by this provider.')}
        </div>
      ) : bisa.length === 0 ? (
        <div className="ai-mp-detail-kecil" data-cap="tidak-ada">
          {tr('No support')}
        </div>
      ) : (
        <>
          {punya('image') && baris('image', 'Images Input')}
          {punya('reasoning') && baris('reasoning', 'Reasoning')}
          {punya('tools') && baris('tools', 'Tool Calling')}
          {MEMORI_TERSEDIA && baris('memories' as Kemampuan, 'Memories')}
        </>
      )}
      {/* The "why" line is now rendered above, inside the Available-for block,
          because it IS the answer there rather than a footnote to a list of
          dashes. */}

      <div className="ai-mp-detail-garis" aria-hidden="true" />

      <div className="ai-mp-detail-seksi">{tr('Cost')}</div>
      <div className="ai-mp-detail-nilai">{tr(model.biaya ?? 'Billed by token')}</div>

      <div className="ai-mp-detail-garis" aria-hidden="true" />

      {/*
        * The context size arrives already formatted ("131K ctx") because it
        * comes from the same `fmtCtx` the list badge uses. Printing "Context up
        * to" beside it produced "Context up to 131K ctx" — the unit said twice.
        * The suffix is stripped so the label carries the meaning once.
        */}
      <div className="ai-mp-detail-kaki">
        <span className="ai-mp-detail-kecil">{tr('Context')}</span>
        <span className="ai-mp-detail-angka">{model.ctx ? model.ctx.replace(/\s*ctx$/, '') : '—'}</span>
      </div>
    </aside>
  );
}
