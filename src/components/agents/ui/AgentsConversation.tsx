import { AgentsComposer } from './AgentsComposer';
import { AgentsIcon, type AgentsIconName } from './AgentsIcon';
import { useAi } from '../../../lib/aiStore';

/**
 * The conversation view for the Agents window.
 *
 * Measured on the active-chat reference: the chat is NOT the full canvas. It is
 * a 520px card on the left — 16px corners, 16px inset — and the workspace panel
 * fills everything to its right. Its composer is 486px wide (520 minus the two
 * insets) with slightly shorter boxes than the centred one: 125px and 42px.
 *
 * The composer is pinned to the bottom of the card while the transcript scrolls
 * above it, so the newest message sits next to the field rather than leaving a
 * dead gap underneath.
 */
const PANEL_ACTIONS: { id: string; label: string; icon: AgentsIconName }[] = [
  { id: 'file', label: 'Open a file', icon: 'folder' },
  { id: 'browser', label: 'Open a browser', icon: 'search' },
  { id: 'terminal', label: 'Open a terminal', icon: 'panel' },
];

export function AgentsConversation({
  composerId,
  onPanelAction,
}: {
  composerId: string;
  onPanelAction?: (id: string) => void;
}) {
  const messages = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    const sesi = s.sessions.find((x) => x.id === id);
    return sesi?.messages ?? [];
  });

  return (
    <div className="agx-conversation" data-testid="agx-conversation">
      <section
        className="agx-chat-card"
        data-testid="agx-chat-card"
        style={{ width: 520, borderRadius: 16 }}
      >
        <header className="agx-chat-card-head">Agent</header>

        <div className="agx-transcript" data-testid="agx-transcript">
          {messages.map((m) => (
            <article key={m.id} className="agx-msg" data-testid={`agx-msg-${m.role}`}>
              <span className="agx-msg-role">{m.role === 'user' ? 'You' : 'Agent'}</span>
              <p className="agx-msg-text">{m.content}</p>
            </article>
          ))}
        </div>

        <div className="agx-chat-card-composer" style={{ padding: '0 16px 16px' }}>
          <AgentsComposer composerId={composerId} variant="docked" />
        </div>
      </section>

      <aside className="agx-panel" data-testid="agx-panel" aria-label="Workspace panel">
        <header className="agx-panel-head">Start here</header>
        <ul className="agx-panel-list">
          {PANEL_ACTIONS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="agx-panel-row"
                data-testid={`agx-panel-${a.id}`}
                onClick={() => onPanelAction?.(a.id)}
              >
                <span className="agx-panel-icon">
                  <AgentsIcon name={a.icon} size={15} />
                </span>
                <span>{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
