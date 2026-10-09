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
      void import('../../lib/terminalStore').then((m) => m.useTerminal.getState().setVisible(false));
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
