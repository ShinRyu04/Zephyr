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
}: {
  model: ModelUntukPanel | null;
  testid: string;
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

  const baris = (k: Kemampuan, label: string) => {
    const on = punya(k);
    return (
      <div className={`ai-mp-cap${on ? ' is-ok' : ''}`} data-cap={k}>
        <span className="ai-mp-cap-tanda" aria-hidden="true">
          {on ? '✓' : '—'}
        </span>
        <span className="ai-mp-cap-nama">{tr(label)}</span>
      </div>
    );
  };

  return (
    <aside className="ai-mp-detail" data-testid={testid} data-model={model.id}>
      <div className="ai-mp-detail-nama" title={model.id}>
        {model.label}
      </div>

      <div className="ai-mp-detail-seksi">{tr('Available for')}</div>
      {baris('image', 'Images Input')}
      {baris('reasoning', 'Reasoning')}
      {baris('tools', 'Tool Calling')}
      {/*
        * Memories is a ZEPHYR feature, not something the remote model declares,
        * so it is never inferred from a name and never ticked. It is listed so
        * the reader knows the slot exists, and marked so nobody waits for it.
        */}
      <div className="ai-mp-cap is-segera" data-cap="memories">
        <span className="ai-mp-cap-tanda" aria-hidden="true">
          —
        </span>
        <span className="ai-mp-cap-nama">{tr('Memories')}</span>
        <span className="ai-mp-cap-baru">{tr('Soon')}</span>
      </div>
      {/*
        * Say WHY every row above is a dash, but only when that is the reason.
        *
        * A provider that reports nothing gives `bisa === undefined`, and a dash
        * for every capability then looks like a verdict — "this model cannot do
        * any of it". Naming the situation keeps the panel honest: the dashes
        * mean "unknown", not "no".
        */}
      {!dikenal && <div className="ai-mp-detail-kecil">{tr('Not reported by this provider.')}</div>}

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
