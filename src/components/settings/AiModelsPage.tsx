import { lazy, Suspense } from 'react';
import { useT } from '../../lib/i18n';
import AiModelsTable from './AiModelsTable';

/*
 * AI Models, as a PAGE.
 *
 * This used to be `AiModelsModal` - a floating card over the editor with its own
 * backdrop, its own close button and its own maximize toggle. All of that is
 * gone: the page now lives in its own OS window (`#panel=models`), which brings
 * the frame, the close button and the maximize for free, correctly, from the
 * platform.
 *
 * THE BODY IS UNCHANGED. `AiModelsTable` and `ModelsSection` are the components
 * that were inside the card, imported as-is: provider cards with API key / base
 * URL / model / Refresh / Test connection, the active provider, answer language
 * and style, Local RAG. Re-drawing those controls would have guaranteed that one
 * of them drifted from the Settings page, which renders the same section.
 */

const ModelsSection = lazy(() =>
  import('./SectionsAdvanced').then((m) => ({ default: m.ModelsSection })),
);

export default function AiModelsPage() {
  const tr = useT();
  return (
    <div className="panel-page" data-testid="aim-page">
      <div className="panel-page-body" data-testid="aim-page-content">
        <h2 className="panel-page-title">{tr('settings.models')}</h2>
        <AiModelsTable />
        <Suspense fallback={null}>
          <ModelsSection />
        </Suspense>
      </div>
    </div>
  );
}
