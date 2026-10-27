import { lazy, Suspense, useEffect, useState } from 'react';
import PanelTitleBar from './components/shell/PanelTitleBar';
import { JUDUL, baruDariHash, panelDariHash, seksiDariHash } from './lib/panelWindow';
import { pasangSinkronSetelan, useStore } from './lib/store';
import { useAi } from './lib/aiStore';
import { useAiChatSettings } from './lib/chatSettingsStore';
import { muatSemuaEkstensi } from './lib/extLoader';
import { useT, tf } from './lib/i18n';
import LiveRegion from './components/a11y/LiveRegion';
import Toast from './components/notifications/Toast';
import TanyaDialog from './components/shell/TanyaDialog';

/*
 * The two overlays a panel window can actually open.
 *
 * BOTH WERE MISSING, and that is why buttons "did nothing" in these windows:
 * `ToolGatePanel` is what renders the tool-set picker that Chat Settings' "Open
 * tool sets…" row turns on, and `ClearChatsDialog` is what renders for "Clear
 * all chats…". Each window is a separate WebView with its own store, so the
 * copies mounted in `App.tsx` are invisible here: the button flipped a flag and
 * nothing in THIS window rendered it. The symptom looked like a dead button, not
 * a missing mount, which is why it survived so long.
 */
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));
const ClearChatsDialog = lazy(() => import('./components/ai/ClearChatsDialog'));

/*
 * A panel in its own OS window (`#panel=settings|extensions|tools|models|...`).
 *
 * The page component is the SAME one the app renders, imported lazily. That is
 * the whole point: one implementation, one home. A section that exists in the
 * app exists here, and a change made here shows up there because both read and
 * write the same settings file through the same stores.
 *
 * NO POPUP CHROME. There is no frame, no scrim, no drag offset and no in-page
 * maximize button: the window IS the frame, `PanelTitleBar` draws the one strip
 * the OS no longer provides, and the platform owns minimize/maximize/close. That
 * is what removes the class of bug where a "maximized" card kept a leftover
 * drag offset and painted its own left rail over its own content.
 */

const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const SettingsNav = lazy(() => import('./components/settings/SettingsNav'));
const ExtensionsView = lazy(() => import('./components/extensions/ExtensionsView'));
const ToolsView = lazy(() => import('./components/shell/ToolsView'));
const AiModelsPage = lazy(() => import('./components/settings/AiModelsPage'));
const ChatSettingsPage = lazy(() => import('./components/ai/ChatSettingsPage'));
const AgentCustomPage = lazy(() => import('./components/settings/AgentCustomPage'));

/*
 * Bootstrap, at MODULE load rather than in an effect.
 *
 * Every window is a separate WebView with its own zustand instances, so nothing
 * the editor loaded is available here: without this the Settings page renders
 * against an empty store and every control shows a default. `AgentsWindow.tsx`
 * learned the same lesson - an effect runs after the first paint, so the page
 * would flash empty first - and `bootstrap()` is idempotent (it guards on a
 * module-level promise), so calling it at load is both earliest and safe.
 */
void useStore.getState().bootstrap();

/* Theme, language and every other setting: reload when another window writes.
   Without this, changing the theme here would not repaint the editor window. */
pasangSinkronSetelan();

/*
 * Extensions, for the pages that render language-aware controls and for the
 * theme tokens an installed theme adds. The main window does the same load at
 * startup; this window is a separate WebView, so it needs its own.
 */
void muatSemuaEkstensi().catch(() => {
  /* non-Tauri origin */
});

/** Run `fn` once settings have landed - immediately if they already have. */
function saatSetelanSiap(fn: () => void): () => void {
  if (useStore.getState().settingsLoaded) {
    fn();
    return () => {};
  }
  return useStore.subscribe((s, prev) => {
    if (!prev.settingsLoaded && s.settingsLoaded) fn();
  });
}

function PanelIsi({ id, seksi, baru }: { id: string; seksi: string | null; baru?: boolean }) {
  if (id === 'settings') {
    return (
      <div className="panel-win-dua">
        <div className="mpop-settings-nav">
          <Suspense fallback={null}>
            <SettingsNav />
          </Suspense>
        </div>
        <div className="mpop-settings-body">
          <Suspense fallback={null}>
            <SettingsPage />
          </Suspense>
        </div>
      </div>
    );
  }
  if (id === 'extensions') {
    return (
      <Suspense fallback={null}>
        <ExtensionsView />
      </Suspense>
    );
  }
  if (id === 'tools') {
    return (
      <Suspense fallback={null}>
        <ToolsView />
      </Suspense>
    );
  }
  if (id === 'models') {
    return (
      <Suspense fallback={null}>
        <AiModelsPage />
      </Suspense>
    );
  }
  if (id === 'chat-settings') {
    /* No `onClose`, no `onOpenEditor`, no `onDragStart`: the window closes
       itself and there is no editor here to move the page into. Passing them
       would draw a second close button under the window's own. */
    return (
      <Suspense fallback={null}>
        <ChatSettingsPage seksiAwal={seksi} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <AgentCustomPage seksiAwal={seksi} mintaBaru={baru} />
    </Suspense>
  );
}

/*
 * Chat Settings' Save button, drawn in the WINDOW's title bar.
 *
 * It belongs there rather than in the page: the page used to render its own
 * header with the title and this button, which in a window meant the name
 * appeared twice and the reader got two rows of chrome for one surface. The
 * count comes from the page (it is the only thing that knows what "changed"
 * means), the button lives in the bar.
 */
function AksiChatSettings() {
  const tr = useT();
  const kotor = useAiChatSettings((s) => s.kotor);
  const simpan = useAiChatSettings((s) => s.simpan);
  if (!simpan) return null;
  return (
    <button
      className="btn btn-sm btn-primary ptb-page-btn"
      data-testid="cset-save"
      disabled={kotor === 0}
      title={
        kotor
          ? tf('{n} changes - close the window and they stay', { n: kotor })
          : tr('Every change is already stored')
      }
      onClick={simpan}
    >
      {kotor ? tf('Save ({n})', { n: kotor }) : tr('Saved')}
    </button>
  );
}

export default function PanelWindow() {
  const id = panelDariHash(window.location.hash);
  const [seksi, setSeksi] = useState<string | null>(() => seksiDariHash(window.location.hash));
  /*
   * "Start a new one" travels in the URL like the section does, and for the same
   * reason: this is a separate WebView and the opener cannot set state here.
   */
  const [baru, setBaru] = useState<boolean>(() => baruDariHash(window.location.hash));

  /* The AI panel's provider/model selection, for the two pages that render model
     controls. Same as `AiWindow` does. */
  useEffect(() => saatSetelanSiap(() => void useAi.getState().init()), []);

  /*
   * A second door to the SAME panel while this window is already open, naming a
   * different section (`bukaPanel('chat-settings', 'subagent')`).
   *
   * Focusing the window is not enough - it would keep showing whatever section
   * it was on - and the opener cannot set state here, because this is a separate
   * WebView with its own stores. `bukaPanelWindow` therefore emits this event on
   * the window's label, and this is the listener.
   */
  useEffect(() => {
    let hidup = true;
    void import('@tauri-apps/api/event')
      .then((m) =>
        m.listen<{ id: string; seksi: string; baru?: boolean }>('panel-section', (e) => {
          if (!hidup || e.payload.id !== id) return;
          setSeksi(e.payload.seksi);
          /* Only ever turned ON by an event: an unrelated section switch must
             not keep the "open the editor" wish alive from a previous door. */
          if (e.payload.baru) setBaru(true);
        }),
      )
      .catch(() => {
        /* non-Tauri origin */
      });
    return () => {
      hidup = false;
    };
  }, [id]);

  /* An unknown `#panel=` value renders a sentence rather than a blank window:
     a white rectangle with no explanation is the worst possible outcome for a
     URL that was mistyped or left over from an older build. */
  if (!id) {
    return (
      <div className="panel-win panel-win-kosong">
        <p>Unknown panel. Close this window and open it again from Zephyr.</p>
      </div>
    );
  }

  return (
    <div className="panel-win-root" data-testid={`panel-win-${id}`}>
      <PanelTitleBar
        title={JUDUL[id]}
        actions={id === 'chat-settings' ? <AksiChatSettings /> : undefined}
      />
      <div className="panel-win" data-testid={`panel-win-body-${id}`}>
        <PanelIsi id={id} seksi={seksi} baru={baru} />
      </div>
      <Suspense fallback={null}>
        <ToolGatePanel />
      </Suspense>
      <Suspense fallback={null}>
        <ClearChatsDialog />
      </Suspense>
      <Suspense fallback={null}>
        <TanyaDialog />
      </Suspense>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <LiveRegion />
    </div>
  );
}
