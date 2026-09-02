// AiSidebar.tsx — panel kiri untuk ikon ActivityBar "AI".
//
// ATURAN UI (jangan diulang, sudah kena di fase 08): navigasi & tombol aksi
// hidup di SATU tempat — sidebar kiri. Jadi daftar chat + tombol "Chat baru"
// ADA DI SINI, bukan juga di header panel bawah.

import { useAi } from '../../lib/aiStore';
import { useTerminal } from '../../lib/terminalStore';
import { useStore } from '../../lib/store';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';

function waktu(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AiSidebar() {
  const sessions = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const keys = useAi((s) => s.keys);
  const provider = useAi((s) => s.provider);
  const model = useAi((s) => s.model);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const deleteChat = useAi((s) => s.deleteChat);

  const setDock = useTerminal((s) => s.setDock);
  const setVisible = useTerminal((s) => s.setVisible);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setActivity = useStore((s) => s.setActivity);

  const hasKey = keys.some((k) => k.provider === provider && k.hasKey);
  const def = findModel(model, provider);

  const buka = (id?: string) => {
    setSettingsOpen(false);
    setVisible(true);
    setDock('ai');
    if (id) selectChat(id);
  };

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">AI Assistant</div>

        <div className="ai-side-model" data-testid="ai-side-model">
          <ProviderLogo id={def.provider} size={15} />
          <span className="ai-side-mname">{def.label}</span>
          <span
            className={`ai-side-key${hasKey ? ' is-ok' : ' is-warn'}`}
            data-testid="ai-side-key"
          >
            {hasKey ? 'key siap' : 'belum ada key'}
          </span>
        </div>

        <div className="tp-actions">
          <button className="btn btn-sm btn-primary" data-testid="ai-new-chat" onClick={() => {
            buka();
            newChat();
          }}>
            + Chat baru
          </button>
          <button className="btn btn-sm" data-testid="ai-open-panel" onClick={() => buka()}>
            Buka panel AI
          </button>
          {!hasKey && (
            <button
              className="btn btn-sm"
              data-testid="ai-goto-settings"
              onClick={() => {
                setActivity('settings');
                setSettingsOpen(true);
                void import('../../lib/settingsStore').then(({ useSettingsUi }) =>
                  useSettingsUi.getState().setSection('models'),
                );
              }}
            >
              Isi API key
            </button>
          )}
        </div>
      </div>

      <div className="side-section tp-list-wrap">
        <div className="tp-subtitle">Riwayat chat</div>
        {sessions.length === 0 ? (
          <p className="side-muted" data-testid="ai-side-empty">
            Belum ada percakapan. Klik “+ Chat baru”.
          </p>
        ) : (
          <ul className="ai-side-list" data-testid="ai-side-list">
            {[...sessions].reverse().map((s) => (
              <li key={s.id} className="ai-side-item" data-ai-session={s.id}>
                <button
                  className={`ai-side-btn${s.id === activeId ? ' is-active' : ''}`}
                  title={`${s.messages.length} pesan · ${findModel(s.model, s.provider).label}`}
                  onClick={() => buka(s.id)}
                >
                  <ProviderLogo id={s.provider} size={13} />
                  <span className="ai-side-title">{s.title}</span>
                  <span className="ai-side-meta">
                    {s.messages.length} · {waktu(s.createdAt)}
                  </span>
                </button>
                <button
                  className="tp-op"
                  title="Hapus chat"
                  data-testid={`ai-del-${s.id}`}
                  onClick={() => deleteChat(s.id)}
                >
                  hapus
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
