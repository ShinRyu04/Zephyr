import { useCallback, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useAgentCustom } from '../../lib/agentCustomStore';
import { useAiModels } from '../../lib/aiModelsStore';
import { useAiDebug } from '../../lib/aiDebugStore';
import { useAiChatSettings } from '../../lib/chatSettingsStore';
import AiIkon from './AiIkon';
import { useT } from '../../lib/i18n';

/*
 * The Chat header's action cluster, lifted into the shared TAB STRIP.
 *
 * These buttons used to live in the panel's own second header row, one row
 * below the tabs — two stacked bars to hold six icons, where VSCode's reference
 * header holds them all on one. They are here now: tabs on the left, actions
 * next, then the shared window controls (maximize / hide) behind a divider at
 * the trailing edge.
 *
 * Extracted rather than moved wholesale by CSS: the popovers this cluster owns
 * (new-chat menu, "…" menu) need a positioning context INSIDE the strip, and a
 * header row that floated over the tab bar would fight the strip's own layout
 * every time a tab scrolled.
 *
 * Rendered only while the Chat tab is active — Claude Code and Codex bring
 * their own controls, and a New-Chat button that acts on a hidden transcript is
 * a button that does the wrong thing.
 */
export default function ChatHeadActions() {
  const tr = useT();
  const newChat = useAi((s) => s.newChat);
  const setDraft = useAi((s) => s.setDraft);
  const tipsVisible = useAi((s) => s.tipsVisible);
  const setTipsVisible = useAi((s) => s.setTipsVisible);
  const debugBuka = useAiDebug((s) => s.buka);

  /* The "New chat" split-button dropdown (New Chat / in Editor / in Window). */
  const [newMenuBuka, setNewMenuBuka] = useState(false);
  const [menuBuka, setMenuBuka] = useState(false);

  const applySettings = useStore((s) => s.applySettings);
  const posAi = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const pindahAi = useCallback(
    (pos: 'right' | 'editor' | 'window') => {
      void applySettings({ general: { aiPanel: pos } } as never);
      useStore.getState().setAiKolomVisible(true);
      setMenuBuka(false);
      /*
       * "Editor" is not a position for the right-hand column — it is a TAB.
       *
       * The old path set `aiPanel: 'editor'`, which made SplitEditor swap the
       * whole editor area for a lone <AiPanel/> with no tab row: the chat became
       * a page you could only leave by changing the setting back, which is
       * exactly the "it just looks maximized" complaint. The setting is left at
       * 'right' (the panel column) and the chat is opened as a real editor tab
       * instead, so it sits in the tab strip beside the files with a tab to
       * click back to and an X that closes it — same as VSCode.
       */
      if (pos === 'editor') {
        useStore.getState().bukaViewAi('ai-chat');
        return;
      }
      if (pos === 'window') {
        void import('../../lib/aiWindow').then((m) => m.bukaAiWindow());
      } else {
        /* Leaving window mode closes the pop-out so its listener goes away. */
        void import('../../lib/aiWindow').then((m) => m.tutupAiWindow());
      }
    },
    [applySettings],
  );

  return (
        <div className="ai-head-right">
          {/*
            * Copilot-style header actions: New Chat (split button with a menu),
            * History, Maximize/Restore, the "…" menu, and Close. The message
            * count and context ring live in the bottom bar.
            *
            * No clock here. There used to be a live one and it was wrong in
            * both directions: a ticking time beside the buttons reads as a
            * control nobody wired up, and one global clock cannot say when any
            * particular message arrived. The time now sits on each message
            * (MsgTime in ChatMessage) where the question is actually asked.
            */}


          {/* New chat — split button. The main part starts a fresh chat; the
              caret opens where it should open (here / editor / window). */}
          <div className="ai-new-wrap">
            <button
              className="ai-newchat"
              data-testid="ai-newchat"
              title={tr('New chat')}
              aria-label={tr('New chat')}
              onClick={() => {
                setDraft('');
                newChat();
              }}
            >
              <AiIkon name="plus" size={13} />
            </button>
            <button
              className="ai-newchat-caret"
              data-testid="ai-newchat-menu"
              title={tr('New chat options')}
              aria-label={tr('New chat options')}
              aria-haspopup="menu"
              aria-expanded={newMenuBuka}
              onClick={() => setNewMenuBuka((v) => !v)}
            >
              <AiIkon name="chev-down" size={11} />
            </button>
            {newMenuBuka && (
              <>
                <div className="ai-more-backdrop" onClick={() => setNewMenuBuka(false)} />
                <div className="ai-more-menu is-right" role="menu" data-testid="ai-newchat-menu-pop">
                  <button
                    role="menuitem"
                    className="ai-more-item"
                    data-testid="ai-newchat-here"
                    onClick={() => {
                      setDraft('');
                      newChat();
                      setNewMenuBuka(false);
                    }}
                  >
                    {tr('New Chat')}
                  </button>
                  <button
                    role="menuitem"
                    className="ai-more-item"
                    data-testid="ai-newchat-editor"
                    onClick={() => {
                      setDraft('');
                      newChat();
                      pindahAi('editor');
                      setNewMenuBuka(false);
                    }}
                  >
                    {tr('New Chat in Editor')}
                  </button>
                  <button
                    role="menuitem"
                    className="ai-more-item"
                    data-testid="ai-newchat-window"
                    onClick={() => {
                      setDraft('');
                      newChat();
                      pindahAi('window');
                      setNewMenuBuka(false);
                    }}
                  >
                    {tr('New Chat in Window')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* History — opens the session switcher anchored to the title. */}
          <button
            className="ai-ikon"
            data-testid="ai-history-btn"
            title={tr('Chat history')}
            aria-label={tr('Chat history')}
            onClick={() => window.dispatchEvent(new Event('zephyr-ai-history'))}
          >
            <AiIkon name="history" size={14} />
          </button>

          {/* Maximize / Restore moved to just LEFT of Close — see below, the
              VSCode Copilot header puts the expand toggle immediately before
              the X. The block that used to sit here was relocated. */}

          {/*
            * The "..." menu, VSCode Copilot-style: move the chat between the
            * right column, the editor area, and its own window.
            */}
          <div className="ai-more-wrap">
            <button
              className="ai-ikon"
              data-testid="ai-more"
              title={tr('More actions')}
              aria-label={tr('More actions')}
              aria-haspopup="menu"
              aria-expanded={menuBuka}
              onClick={() => setMenuBuka((v) => !v)}
            >
              <AiIkon name="more" size={14} />
            </button>
            {menuBuka && (
              <>
                <div className="ai-more-backdrop" onClick={() => setMenuBuka(false)} />
                <div className="ai-more-menu" role="menu" data-testid="ai-more-menu">
                  <button role="menuitem" className="ai-more-item is-mati" data-testid="ai-undo-last" disabled>{tr('Undo Last Edit')}</button>
                  <button role="menuitem" className="ai-more-item is-mati" data-testid="ai-redo-last" disabled>{tr('Redo Last Edit')}</button>
                  <div className="ai-more-sep" />
                  <button role="menuitemradio" aria-checked={posAi === 'editor'} className="ai-more-item" data-testid="ai-move-editor" onClick={() => pindahAi('editor')}>{tr('Move Chat into Editor Area')}</button>
                  <button role="menuitemradio" aria-checked={posAi === 'window'} className="ai-more-item" data-testid="ai-move-window" onClick={() => pindahAi('window')}>{tr('Move Chat into New Window')}</button>
                  <button role="menuitemradio" aria-checked={posAi === 'right'} className="ai-more-item" data-testid="ai-move-right" onClick={() => pindahAi('right')}>{tr('Dock Chat to Right')}</button>
                  <div className="ai-more-sep" />
                  <button role="menuitem" className="ai-more-item" data-testid="ai-open-customize" onClick={() => { useAgentCustom.getState().buka(); setMenuBuka(false); }}>{tr('Agent Customizations…')}</button>
                  <button role="menuitem" className="ai-more-item" data-testid="ai-open-models" onClick={() => { useAiModels.getState().buka(); setMenuBuka(false); }}>{tr('settings.models')}</button>
                  <div className="ai-more-sep" />
                  <button role="menuitem" className="ai-more-item" data-testid="ai-open-chat-settings" onClick={() => { useAiChatSettings.getState().setBuka(true); setMenuBuka(false); }}>{tr('Chat Settings')}</button>
                  <div className="ai-more-sep" />
                  <button role="menuitemcheckbox" aria-checked={debugBuka} className="ai-more-item" data-testid="ai-toggle-debug" onClick={() => { useAiDebug.getState().toggle(); setMenuBuka(false); }}>{tr('Show Chat Debug View')}</button>
                  <div className="ai-more-sep" />
                  <button role="menuitemcheckbox" aria-checked={tipsVisible} className="ai-more-item" data-testid="ai-toggle-tips" onClick={() => setTipsVisible(!tipsVisible)}>{tr('Show tips')}</button>

                </div>
              </>
            )}
          </div>

          {/*
            * Maximise was REMOVED: all four homes now use the one roomy layout,
            * and the right column is resizable by its drag handle, so a separate
            * maximise toggle no longer earns its slot in the header.
            */}

        </div>
  );
}
