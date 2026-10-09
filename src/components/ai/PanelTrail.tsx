import ChatHeadActions from './ChatHeadActions';
import PanelWins from './PanelWins';

/*
 * The AI panel's control trail: the chat's own actions, then the window
 * controls, behind a hairline.
 *
 * Chat-only, and that is the point: everything in it acts on the ZEPHYR
 * conversation (new chat, history, the "…" menu). A CLI tab keeps its own
 * conversation inside the CLI and brings its own controls, so this cluster must
 * not render there — the window controls it ends with are NOT chat-specific and
 * come from `PanelWins`, which every tab renders.
 */
export default function PanelTrail({ showMax }: { showMax: boolean }) {
  return (
    <>
      <ChatHeadActions />
      <span className="ai-host-sep" aria-hidden="true" />
      <PanelWins showMax={showMax} />
    </>
  );
}
