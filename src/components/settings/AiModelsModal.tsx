import { lazy, Suspense, useEffect, useState } from 'react';
import { useDragEverywhere } from '../../lib/useDragPopup';
import { useAiModels } from '../../lib/aiModelsStore';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';

/*
 * AI Models - a pop-up of its own, deliberately NOT a Settings section.
 *
 * Same shape as Agent Customizations: a floating card over the editor, closable,
 * openable from anywhere. The difference is that it has no left rail - one
 * surface, one scroll - so it is a frame and nothing else.
 *
 * THE BODY IS THE SETTINGS PAGE ITSELF, not a copy of it. `ModelsSection` is the
 * component the Settings page rendered, imported here unchanged: provider cards
 * with API key / base URL / model / Refresh / Test connection, the active
 * provider, answer language and style, Local RAG. Re-drawing those controls
 * would have guaranteed that one of them drifted; reusing the component means
 * the pop-up cannot show a setting the page does not, or forget one it has.
 * The section is lazy-loaded because the Settings page is the only other user
 * and neither is on the first-paint path.
 *
 * THREE DOORS LEAD HERE, and all three used to point somewhere else: the 401
 * notice in the chat (AiPanel), the empty state and "Edit models..." row in the
 * model dropdown (ModelSelector), and the "AI Models" entry in the chat's "..."
 * menu (ChatHeadActions). There is no other way in and no other place the model
 * settings live.
 */

const ModelsSection = lazy(() =>
  import('./SectionsAdvanced').then((m) => ({ default: m.ModelsSection })),
);

export default function AiModelsModal() {
  const tr = useT();
  const open = useAiModels((s) => s.open);
  const tutup = useAiModels((s) => s.tutup);
  const { popupRef, onPointerDown } = useDragEverywhere();
  /* Fills the viewport instead of the fixed card, matching Agent Customizations. */
  const [besar, setBesar] = useState(false);

  /*
   * Escape closes it, like every other dialog in the app. The listener is bound
   * only while the pop-up is open: a global handler left behind would swallow
   * Escape from the editor.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, tutup]);

  if (!open) return null;

  return (
    <div className="modal-backdrop agc-backdrop" role="presentation" data-testid="aim-pop">
      <div
        className={`modal agc-modal${besar ? ' is-besar' : ''}`}
        ref={popupRef}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        onPointerDown={onPointerDown}
        role="dialog"
        aria-modal="true"
        aria-label={tr('settings.models')}
        data-testid="aim-pop-dialog"
      >
        <div className="agc-head">
          <span className="agc-head-title">{tr('settings.models')}</span>
          <button
            className="ai-ikon"
            data-testid="aim-pop-max"
            title={besar ? tr('Restore size') : tr('Maximize')}
            aria-label={besar ? tr('Restore size') : tr('Maximize')}
            aria-pressed={besar}
            onClick={() => {
              popupRef.current?.style.removeProperty('--drag-x');
              popupRef.current?.style.removeProperty('--drag-y');
              setBesar((v) => !v);
            }}
          >
            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />
          </button>
          <button
            className="ai-ikon"
            data-testid="aim-pop-close"
            title={tr('Close')}
            aria-label={tr('Close')}
            onClick={tutup}
          >
            <AiIkon name="close" size={14} />
          </button>
        </div>
        <div className="agc-body">
          <div className="agc-content" data-testid="aim-pop-content">
            <Suspense fallback={null}>
              <ModelsSection />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
