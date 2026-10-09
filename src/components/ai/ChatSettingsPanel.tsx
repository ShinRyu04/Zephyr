import { useEffect } from 'react';
import { useAi } from '../../lib/aiStore';
import { useAiChatSettings } from '../../lib/chatSettingsStore';
import { useStore } from '../../lib/store';
import { useAiDebug } from '../../lib/aiDebugStore';
import { useT } from '../../lib/i18n';
import { useDragPopup } from '../../lib/useDragPopup';
import AiIkon from './AiIkon';

/*
 * Chat Settings, as a popup.
 *
 * "Chat Settings" in the "…" menu used to throw the user out of the chat and
 * into the full Settings page (Settings → Models) — a whole screen for the four
 * things that actually belong to the conversation. VSCode keeps its chat's own
 * options in a small panel over the chat, so the conversation stays visible
 * while you change how it answers.
 *
 * Scope is deliberately narrow: answer language, answer length, the suggestion
 * tips, and a door to the two bigger panels (Models for keys, Debug for
 * requests). Anything wider belongs in Settings, and the "All Settings" row at
 * the bottom is the way there.
 */
export default function ChatSettingsPanel() {
  const tr = useT();
  const { popupRef, onPointerDown } = useDragPopup();
  const buka = useAiChatSettings((s) => s.buka);
  const tutup = useAiChatSettings((s) => s.tutup);
  const tipsVisible = useAi((s) => s.tipsVisible);
  const setTipsVisible = useAi((s) => s.setTipsVisible);
  const applySettings = useStore((s) => s.applySettings);
  const models = useStore((s) => s.settings.models);
  const debugBuka = useAiDebug((s) => s.buka);

  const lang = models?.answerLang ?? 'follow';
  const style = models?.answerStyle ?? 'short';

  /* Escape closes. Capture phase so the chat's own Escape handlers do not also
     fire and treat the key as "stop the run". */
  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        tutup();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, tutup]);

  if (!buka) return null;

  const bukaSettings = (section: string) => {
    const st = useStore.getState();
    tutup();
    st.setActivity('settings');
    st.setSettingsOpen(true);
    void import('../../lib/settingsStore').then((m) => m.useSettingsUi.getState().setSection(section as never));
    if (!st.sidebarVisible) st.toggleSidebar();
  };

  return (
    <>
      <div className="ai-cset-scrim" data-testid="ai-cset-scrim" onClick={tutup} />
      <div
        ref={popupRef}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        className="ai-cset"
        data-testid="ai-cset"
        role="dialog"
        aria-label={tr('Chat Settings')}
      >
        <div className="ai-cset-top" data-drag-handle onPointerDown={onPointerDown} style={{ cursor: 'grab' }}>
          <AiIkon name="gear" size={14} />
          <span className="ai-cset-judul">{tr('Chat Settings')}</span>
          <button className="ai-cset-x" data-testid="ai-cset-close" title={tr('Close')} aria-label={tr('Close')} onClick={tutup}>
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="ai-cset-body">
          {/* Answer language. "follow" means the UI language, which is what most
              people want and why it is the default. */}
          <div className="ai-cset-row">
            <span className="ai-cset-label">{tr('Answer language')}</span>
            <select
              className="ai-cset-select"
              data-testid="ai-cset-lang"
              value={lang}
              onChange={(e) => void applySettings({ models: { answerLang: e.target.value } })}
            >
              <option value="follow">{tr('Follow interface')}</option>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Answer length. */}
          <div className="ai-cset-row">
            <span className="ai-cset-label">{tr('Answer length')}</span>
            <select
              className="ai-cset-select"
              data-testid="ai-cset-style"
              value={style}
              onChange={(e) => void applySettings({ models: { answerStyle: e.target.value } })}
            >
              <option value="short">{tr('Short')}</option>
              <option value="balanced">{tr('Balanced')}</option>
              <option value="detailed">{tr('Detailed')}</option>
            </select>
          </div>

          {/* Show the composer tips. */}
          <label className="ai-cset-check">
            <input
              type="checkbox"
              data-testid="ai-cset-tips"
              checked={tipsVisible}
              onChange={(e) => setTipsVisible(e.target.checked)}
            />
            <span>{tr('Show tips above the composer')}</span>
          </label>

          <div className="ai-cset-sep" />

          <button className="ai-cset-link" data-testid="ai-cset-models" onClick={() => bukaSettings('models')}>
            {tr('Models & API keys…')}
          </button>
          <button
            className="ai-cset-link"
            data-testid="ai-cset-debug"
            onClick={() => {
              tutup();
              if (!debugBuka) useAiDebug.getState().toggle();
            }}
          >
            {tr('Show Chat Debug View')}
          </button>
          <button className="ai-cset-link" data-testid="ai-cset-all" onClick={() => bukaSettings('general')}>
            {tr('All Settings…')}
          </button>
        </div>
      </div>
    </>
  );
}
