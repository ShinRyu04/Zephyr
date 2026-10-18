import { useState } from 'react';
import { useStore } from '../../lib/store';
import { UI_LANGS } from '../../lib/i18n';

/*
 * Welcome to Zephyr — first-run onboarding wizard.
 *
 * Appears when `settings.general.onboarded` is not true, i.e. on a brand-new
 * install. Reopenable from the Command Palette ("Zephyr: Welcome Setup"), so a
 * reader who skipped it on day one can still see it.
 *
 * THREE STEPS, and each one exists because the choice it offers is expensive to
 * find later:
 *
 *   1. Preferences  - language and theme. Both are buried in Settings, and both
 *                     are the first thing a new reader wants to change. The
 *                     theme cards are previews rather than names because "Dark"
 *                     tells you nothing about whether you can read it.
 *   2. Interface    - Editor or Quest. This is the one choice a new reader
 *                     cannot discover on their own: Quest is a different WINDOW
 *                     (`#agents`), and nothing in the editor hints that it
 *                     exists. Explaining it here, once, with a picture, is
 *                     cheaper than a tooltip nobody hovers.
 *   3. Done         - the feature cards, then one button.
 *
 * NO SIGN-IN. Zephyr does not need an account, so the last step has a single
 * "Done" button. Asking for a login the app does not require would be a lie
 * about what the product needs.
 *
 * The wizard writes `general.onboarded = true` when it finishes, so it never
 * appears twice. `Skip`-by-closing is not offered: with three short steps there
 * is nothing to skip past, and a wizard that can be dismissed without recording
 * that it was seen reappears forever.
 */

const TEMA = [
  {
    id: 'zephyr-dark',
    label: 'Dark',
    cls: 'wlc-pb-dark',
    garis: ['l-blue', 'l-yellow', 'l-green'],
  },
  {
    id: 'zephyr-light',
    label: 'Light',
    cls: 'wlc-pb-light',
    garis: ['l-blue', 'l-red', 'l-green'],
  },
  {
    id: 'zephyr-contrast',
    label: 'High Contrast',
    cls: 'wlc-pb-hc',
    garis: ['l-cyan', 'l-white', 'l-yellow'],
  },
] as const;

type TemaId = (typeof TEMA)[number]['id'];

export default function WelcomeSetup({ onSelesai }: { onSelesai: () => void }) {
  const applySettings = useStore((s) => s.applySettings);
  const general = useStore((s) => s.settings.general);

  const [langkah, setLangkah] = useState<1 | 2 | 3>(1);
  const [bahasa, setBahasa] = useState<string>(general?.uiLang ?? 'en');
  const [tema, setTema] = useState<TemaId>('zephyr-dark');
  const [mode, setMode] = useState<'editor' | 'quest'>('editor');

  const pilihBahasa = (lang: string) => {
    setBahasa(lang);
    /* Applied IMMEDIATELY, not on Done: the reader is judging a language by
       reading it, and a picker that only takes effect after three more screens
       cannot be judged at all. */
    void applySettings({ general: { uiLang: lang } });
  };

  const pilihTema = (id: TemaId) => {
    setTema(id);
    /* Same reason: a theme preview made of hard-coded swatches would be a
       drawing of a theme, not the theme. This applies the real one, so the
       whole window - including this wizard - changes colour as it is chosen. */
    void applySettings({
      theme: { current: id },
      general: { theme: id === 'zephyr-light' ? 'light' : 'dark' },
    });
  };

  const selesai = async () => {
    await applySettings({ general: { onboarded: true, uiLang: bahasa } });
    onSelesai();
    /* Quest opens its own window; the editor is where this wizard already is,
       so only one of the two needs a door opened. */
    if (mode === 'quest') {
      void import('../../lib/agentsWindow').then((m) => m.bukaAgentsWindow());
    }
  };

  return (
    <div className="wlc-overlay" data-testid="welcome-setup">
      <div className="wlc-frame">
        {/* ── STEP 1: PREFERENCES ───────────────────────────────────── */}
        {langkah === 1 && (
          <div className="wlc-step" data-testid="wlc-step-1">
            <h1 className="wlc-title">
              Welcome to <strong>Zephyr</strong>
            </h1>
            <p className="wlc-subtitle">Set your preferences</p>

            <div className="wlc-form">
              <div className="wlc-row">
                <label className="wlc-label" htmlFor="wlc-bahasa">
                  Language
                </label>
                <select
                  id="wlc-bahasa"
                  className="wlc-select"
                  data-testid="wlc-bahasa"
                  value={bahasa}
                  onChange={(e) => pilihBahasa(e.target.value)}
                >
                  {UI_LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wlc-theme-group">
                <label className="wlc-label">Theme</label>
                <div className="wlc-theme-cards">
                  {TEMA.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`wlc-theme-card${tema === t.id ? ' is-active' : ''}`}
                      data-testid={`wlc-tema-${t.id}`}
                      aria-pressed={tema === t.id}
                      onClick={() => pilihTema(t.id)}
                    >
                      <span className={`wlc-preview-box ${t.cls}`}>
                        <span className="wlc-pb-sidebar" />
                        <span className="wlc-pb-code">
                          {t.garis.map((g, i) => (
                            <span key={i} className={`wlc-pb-line ${g}`} />
                          ))}
                        </span>
                      </span>
                      <span className="wlc-theme-name">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="wlc-btn-primary"
              data-testid="wlc-btn-continue-1"
              onClick={() => setLangkah(2)}
            >
              Continue
            </button>
            <p className="wlc-footer-note">You can always change these later in Settings</p>
          </div>
        )}

        {/* ── STEP 2: CHOOSE YOUR INTERFACE ─────────────────────────── */}
        {langkah === 2 && (
          <div className="wlc-step" data-testid="wlc-step-2">
            <h1 className="wlc-title">Choose Your Interface</h1>

            <div className="wlc-interface-cards">
              <button
                type="button"
                className={`wlc-if-card${mode === 'editor' ? ' is-active' : ''}`}
                data-testid="wlc-mode-editor"
                aria-pressed={mode === 'editor'}
                onClick={() => setMode('editor')}
              >
                <span className="wlc-if-preview wlc-if-prev-editor">
                  <span className="wlc-if-prev-gutter" />
                  <span className="wlc-if-prev-editor-code">
                    <span className="wlc-pb-line l-blue wlc-w-60" />
                    <span className="wlc-pb-line l-yellow wlc-w-80" />
                    <span className="wlc-pb-line l-green wlc-w-40" />
                  </span>
                  <span className="wlc-if-prev-chat">
                    <span className="wlc-pb-bubble" />
                    <span className="wlc-pb-bubble wlc-pb-bubble-user" />
                  </span>
                </span>
                <span className="wlc-if-heading">Editor</span>
                <span className="wlc-if-desc">
                  You code and chat side by side, the agent assists as you work.
                </span>
              </button>

              <button
                type="button"
                className={`wlc-if-card${mode === 'quest' ? ' is-active' : ''}`}
                data-testid="wlc-mode-quest"
                aria-pressed={mode === 'quest'}
                onClick={() => setMode('quest')}
              >
                <span className="wlc-if-preview wlc-if-prev-quest">
                  <span className="wlc-if-prev-quest-left">
                    <span className="wlc-pb-badge" />
                    <span className="wlc-pb-badge" />
                    <span className="wlc-pb-badge" />
                  </span>
                  <span className="wlc-if-prev-quest-mid">
                    <span className="wlc-pb-bubble-wide" />
                    <span className="wlc-pb-bubble-wide" />
                  </span>
                  <span className="wlc-if-prev-quest-right" />
                </span>
                <span className="wlc-if-heading">
                  Quest <span className="wlc-badge-new">New</span>
                </span>
                <span className="wlc-if-desc">
                  You assign, the agent works in its own window. Describe the task, come back to
                  results.
                </span>
              </button>
            </div>

            <button
              className="wlc-btn-primary"
              data-testid="wlc-btn-continue-2"
              onClick={() => setLangkah(3)}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 3: DONE ──────────────────────────────────────────── */}
        {langkah === 3 && (
          <div className="wlc-step" data-testid="wlc-step-3">
            <h1 className="wlc-title">You are good to go!</h1>
            <p className="wlc-subtitle">No account needed - everything runs on your machine</p>

            <div className="wlc-features-grid">
              <div className="wlc-feat-card">
                <h4 className="wlc-feat-title">Agent</h4>
                <p className="wlc-feat-desc">Complete tasks with tools, files and the terminal</p>
                <div className="wlc-feat-preview wlc-fp-agent">
                  <div className="wlc-fp-pane-l" />
                  <div className="wlc-fp-pane-r" />
                </div>
              </div>

              <div className="wlc-feat-card">
                <h4 className="wlc-feat-title">Sub-agents</h4>
                <p className="wlc-feat-desc">Split work across several agents at once</p>
                <div className="wlc-feat-preview wlc-fp-knowledge">
                  <div className="wlc-fp-know-head" />
                  <div className="wlc-fp-know-body" />
                </div>
              </div>

              <div className="wlc-feat-card">
                <h4 className="wlc-feat-title">Chat</h4>
                <p className="wlc-feat-desc">Program through conversation, in any of 10 languages</p>
                <div className="wlc-feat-preview wlc-fp-chat">
                  <div className="wlc-fp-chat-bubbles" />
                </div>
              </div>

              <div className="wlc-feat-card">
                <h4 className="wlc-feat-title">Extensions</h4>
                <p className="wlc-feat-desc">Themes, icon packs, snippets and keymaps</p>
                <div className="wlc-feat-preview wlc-fp-next">
                  <div className="wlc-fp-next-diff" />
                </div>
              </div>
            </div>

            <div className="wlc-auth-actions">
              <button
                className="wlc-btn-primary"
                data-testid="wlc-btn-done"
                onClick={() => void selesai()}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── BACK + PROGRESS ───────────────────────────────────────── */}
        {langkah > 1 && (
          <button
            className="wlc-back-btn"
            data-testid="wlc-btn-back"
            onClick={() => setLangkah((l) => (l - 1) as 1 | 2)}
          >
            ‹ Back
          </button>
        )}

        <div className="wlc-progress-rail">
          <div className="wlc-progress-fill" style={{ width: `${(langkah / 3) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
