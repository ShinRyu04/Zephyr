import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * The panel's window controls — maximize/restore and hide — on their own.
 *
 * Split out of `PanelTrail` because the two halves belong to different owners:
 * the trail's other buttons act on the ZEPHYR CONVERSATION (new chat, history,
 * settings) and are meaningless on a CLI tab, while these act on the PANEL and
 * belong to every tab. Rendering the trail everywhere put the chat's history
 * and new-chat buttons over Claude Code, which is what was reported.
 */
export default function PanelWins({ showMax }: { showMax: boolean }) {
  const tr = useT();
  const aiMax = useStore((s) => s.aiMax);
  const setAiMax = useStore((s) => s.setAiMax);
  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const applySettings = useStore((s) => s.applySettings);

  const hidePanel = () => {
    if (aiPos === 'right') {
      useStore.getState().setAiKolomVisible(false);
    } else if (aiPos === 'editor') {
      void applySettings({ general: { aiPanel: 'right' } } as never);
      useStore.getState().setAiKolomVisible(false);
    } else {
      /*
       * aiPos === 'window': close the AI WINDOW.
       *
       * This branch used to call `useTerminal.setVisible(false)`. The button
       * says "hide the panel" and sits on the AI panel, but with the chat in its
       * own window it was killing the reader's TERMINAL - a panel they never
       * asked about - and leaving the AI window wide open. Wrong target
       * entirely.
       */
      void import('../../lib/aiWindow').then((m) => m.tutupAiWindow());
    }
  };

  return (
    <>
      {showMax && (
        <button
          className="ai-host-win"
          data-testid="ai-host-maximize"
          title={aiMax ? tr('Restore panel size') : tr('Maximize panel')}
          aria-label={aiMax ? tr('Restore panel size') : tr('Maximize panel')}
          aria-pressed={aiMax}
          onClick={() => setAiMax(!aiMax)}
        >
          <AiIkon name={aiMax ? 'restore' : 'maximize'} size={14} />
        </button>
      )}
      <button
        className="ai-host-win"
        data-testid="ai-host-hide"
        title={tr('Hide AI panel')}
        aria-label={tr('Hide AI panel')}
        onClick={hidePanel}
      >
        <AiIkon name="close" size={14} />
      </button>
    </>
  );
}
