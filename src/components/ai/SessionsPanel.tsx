import { memo, useMemo, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * The Sessions sidebar, shown when the AI panel is maximized.
 *
 * VSCode shows a session list when its chat is expanded — the reader needs to
 * see which conversations exist without closing the one they are in. Zephyr's
 * session switcher (the title dropdown) only appears in the compact header;
 * when the panel is full-width the header is a single tab strip, and there is
 * no way to jump between conversations without a slash command.
 *
 * This panel is rendered as a right-hand column inside `.ai-side-col` when
 * `aiMax` is true. It lists all sessions newest-first, with a search box and
 * relative timestamps. Clicking a row selects that session. The panel is
 * dismissible (a × in its header) and re-openable from the ⋯ menu.
 */

/** "5m ago" / "2h ago" / "yesterday" — relative, because absolute dates are
    noise for conversations you had this morning. */
function relatif(ms: number): string {
  const detik = Math.floor((Date.now() - ms) / 1000);
  if (detik < 60) return 'just now';
  if (detik < 3600) return `${Math.floor(detik / 60)}m ago`;
  if (detik < 86400) return `${Math.floor(detik / 3600)}h ago`;
  return `${Math.floor(detik / 86400)}d ago`;
}

const SessionsPanel = memo(function SessionsPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const tr = useT();
  const sesi = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const selectChat = useAi((s) => s.selectChat);
  const newChat = useAi((s) => s.newChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const forkChat = useAi((s) => s.forkChat);
  const [cari, setCari] = useState('');

  const urut = useMemo(() => {
    const arr = [...sesi];
    arr.sort((a, b) => (b.messages[b.messages.length - 1]?.at ?? b.createdAt) - (a.messages[a.messages.length - 1]?.at ?? a.createdAt));
    return arr;
  }, [sesi]);

  const tersaring = urut.filter((s) => {
    if (!cari) return true;
    const q = cari.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content?.toLowerCase().includes(q));
  });

  /* Group by "Today" / "Yesterday" / earlier. */
  const hariIni = Date.now() - 86400000;
  const kemarin = Date.now() - 172800000;
  const grup: { label: string; items: typeof tersaring }[] = [];
  let lastLabel = '';
  for (const s of tersaring) {
    const last = s.messages[s.messages.length - 1];
    const ts = last?.at ?? s.createdAt;
    const label = ts > hariIni ? 'Today' : ts > kemarin ? 'Yesterday' : 'Earlier';
    if (label !== lastLabel) {
      grup.push({ label, items: [] });
      lastLabel = label;
    }
    grup[grup.length - 1].items.push(s);
  }

  return (
    <div className="ai-sessions-panel" data-testid="ai-sessions-panel">
      <div className="ai-sessions-head">
        <span className="ai-sessions-title">{tr('Sessions')}</span>
        <div className="ai-sessions-actions">
          <button className="ai-ikon" title={tr('New chat')} aria-label={tr('New chat')} onClick={() => newChat()}>
            <AiIkon name="plus" size={13} />
          </button>
          {/* Hides the SESSION COLUMN, not the panel: the ✕ in this heading sits
              under a heading that says "Sessions", and removing the whole chat
              from a button in the session list's own header is the wrong
              blast radius. The panel keeps its own hide control on the strip. */}
          <button
            className="ai-ikon"
            data-testid="ai-sessions-hide"
            title={tr('Hide sessions')}
            aria-label={tr('Hide sessions')}
            onClick={onClose}
          >
            <AiIkon name="x" size={13} />
          </button>
        </div>
      </div>
      <div className="ai-sessions-cari">
        <AiIkon name="search" size={12} />
        <input
          data-testid="ai-sessions-search"
          placeholder={tr('Search chats…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>
      <div className="ai-sessions-list" data-testid="ai-sessions-list">
        {grup.length === 0 && (
          <p className="ai-sessions-kosong">{cari ? tr('No chats match.') : tr('No chats yet.')}</p>
        )}
        {grup.map((g) => (
          <div key={g.label} className="ai-sessions-grup">
            <div className="ai-sessions-label">
              {tr(g.label)}
              <span className="ai-sessions-jumlah">{g.items.length}</span>
            </div>
            {g.items.map((s) => {
              const last = s.messages[s.messages.length - 1];
              const ts = last?.at ?? s.createdAt;
              return (
                <button
                  key={s.id}
                  className={`ai-sessions-baris${s.id === activeId ? ' is-aktif' : ''}`}
                  data-testid={`ai-sessions-baris-${s.id}`}
                  onClick={() => selectChat(s.id)}
                >
                  <span className="ai-sessions-judul">{tr(s.title)}</span>
                  <span className="ai-sessions-waktu">{relatif(ts)}</span>
                  <button
                    className="ai-sessions-hapus"
                    data-testid={`ai-sessions-fork-${s.id}`}
                    title={tr('Fork chat')}
                    /* Branch at the last message: the fork keeps this whole
                       conversation and continues on its own from here. */
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!last) return;
                      forkChat(s.id, last.id);
                    }}
                  >
                    <AiIkon name="git-branch" size={12} />
                  </button>
                  <button
                    className="ai-sessions-hapus"
                    data-testid={`ai-sessions-hapus-${s.id}`}
                    title={tr('Delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(s.id);
                    }}
                  >
                    <AiIkon name="trash" size={12} />
                  </button>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

export default SessionsPanel;
