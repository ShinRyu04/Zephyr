import { useStore } from '../../lib/store';
import {
  DEFAULT_A11Y,
  osMintaReducedMotion,
  umumkan,
  type AccessibilitySettings,
} from '../../lib/a11yStore';
import { NumberInput, Row, Toggle } from './SettingsControls';
import { useT } from '../../lib/i18n';

export default function AccessibilitySection() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const a = { ...DEFAULT_A11Y, ...(settings.accessibility ?? {}) };

  const patch = (p: Partial<AccessibilitySettings>) =>
    void applySettings({ accessibility: { ...a, ...p } });

  const osReduced = osMintaReducedMotion();

  return (
    <div className="set-section" data-testid="set-accessibility">
      <h2 className="set-h2">{tr('Accessibility')}</h2>
      <p className="set-note">
        {tr('Zephyr can be used entirely with the keyboard. Press')} <code>Tab</code>{' '}
        {tr('from the start to jump straight to the editor,')} <code>Ctrl+Shift+P</code>{' '}
        {tr('for all commands. The contrast of every theme meets WCAG AA; the')}{' '}
        <strong>High Contrast</strong> {tr('theme meets AAA.')}
      </p>

      <Row
        label="Reduce motion"
        hint={
          osReduced
            ? tr('Windows already requested reduced motion - animation is off even if this is off')
            : tr('turn off transitions & animations inside Zephyr')
        }
        testid="a11y-row-motion"
      >
        <Toggle
          label={tr('Reduce motion')}
          testid="a11y-reduced-motion"
          checked={a.reducedMotion}
          onChange={(v) => {
            patch({ reducedMotion: v });
            umumkan(v ? 'Motion reduced' : 'Motion enabled');
          }}
        />
      </Row>

      <Row
        label={tr('Screen reader mode')}
        hint={tr('terminal & editor optimized for Narrator/NVDA (heavier)')}
        testid="a11y-row-sr"
      >
        <Toggle
          label={tr('Screen reader mode')}
          testid="a11y-screen-reader"
          checked={a.screenReader}
          onChange={(v) => {
            patch({ screenReader: v });
            umumkan(v ? 'Screen reader mode on' : 'Screen reader mode off');
          }}
        />
      </Row>

      <Row
        label="Auto focus in dialogs"
        hint={tr('move focus to the dialog when it opens (turn off if it is disruptive)')}
        testid="a11y-row-focus"
      >
        <Toggle
          label="Auto focus in dialogs"
          testid="a11y-auto-focus"
          checked={a.autoFocusDialog}
          onChange={(v) => patch({ autoFocusDialog: v })}
        />
      </Row>

      <Row
        label="Minimum notification duration"
        hint={tr('the screen reader needs time to read; increase it if the toast disappears too quickly')}
        testid="a11y-row-toast"
      >
        <NumberInput
          label="Minimum notification duration"
          testid="a11y-toast-durasi"
          value={a.toastDurasiMin}
          min={1500}
          max={30000}
          step={500}
          suffix="ms"
          onChange={(v) => patch({ toastDurasiMin: v })}
        />
      </Row>

      <h3 className="set-h2 set-h2-sub">{tr('Quick test')}</h3>
      <p className="set-note">
        {tr('This button sends an announcement to the screen reader through the same path as app notifications - if Narrator reads it, the a11y path is alive.')}
      </p>
      <div className="set-row">
        <div className="set-row-control">
          <button
            className="btn btn-sm"
            data-testid="a11y-uji-umumkan"
            onClick={() => umumkan(tr('Test announcement from Zephyr. The screen reader path works.'))}
          >
            {tr('Send test announcement')}
          </button>
        </div>
      </div>
    </div>
  );
}
