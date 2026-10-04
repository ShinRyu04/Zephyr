import type { ReactNode } from 'react';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import { IkonAgen } from '../ai/IkonAgen';
import type { IkonDef } from '../../lib/subagentIcons';

export function Row({
  label,
  hint,
  children,
  testid,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  testid?: string;
}) {
  // label/hint may be a raw key or a string; tr() returns
  // the key as-is when there is no translation, so it is safe for both.
  const tr = useT();
  return (
    <div className="set-row" data-testid={testid}>
      <div className="set-row-label">
        <span className="set-label">{tr(label)}</span>
        {hint && <span className="set-hint">{tr(hint)}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

export function Section({
  title,
  children,
  ikon,
}: {
  title: string;
  children: ReactNode;
  /*
   * Optional mark, shown before the heading.
   *
   * Optional on purpose: every other settings section keeps its plain heading,
   * so only the page that was asked for gets a mark. A badge on all of them
   * would turn a signal into decoration.
   *
   * `dFill` is drawn as a filled path AFTER the stroked one. When the dots are
   * part of the stroke they inherit the 1.4px width and vanish at this size;
   * filling them is what keeps them visible.
   */
  /* The real definition, not a structural copy: a copy loses `punyaKomponen`
     and `viewBox`, so a mark drawn by its own component (Zeph's dragon) would
     type-check here and then fail to render. */
  ikon?: IkonDef;
}) {
  const tr = useT();
  return (
    <section className="set-section">
      <h2 className="set-h2">
        {ikon && (
          <span className="set-h2-ikon">
            <IkonAgen ik={ikon} size={16} />
          </span>
        )}
        {tr(title)}
      </h2>
      {children}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  testid,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testid?: string;
  /*
   * A disabled switch is worth having as a real state rather than a switch that
   * looks on and quietly does nothing. Only used where the feature genuinely is
   * not built yet - see `general-tray`.
   */
  disabled?: boolean;
}) {
  const tr = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={tr(label)}
      className={`set-toggle${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
      data-testid={testid}
      disabled={disabled}
      /* Guarded as well as `disabled`: the attribute covers the mouse, and this
         covers a programmatic call from a harness or the dev bridge - neither of
         which the attribute stops. */
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="set-toggle-knob" />
    </button>
  );
}

export function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  testid,
  suffix,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  testid?: string;
  suffix?: string;
  /* A control whose feature is unavailable is disabled, not hidden: the row
     stays so its hint still explains why, and the user does not go looking for a
     setting they remember seeing. A live range slider that writes to a field
     nothing reads is the worse option. */
  disabled?: boolean;
}) {
  const tr = useT();
  return (
    <span className="set-num">
      <input
        type="range"
        className="set-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={tr(label)}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className="set-num-box"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={`${tr(label)} ${tr('(number)')}`}
        data-testid={testid ? `${testid}-box` : undefined}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
      {suffix && <span className="set-suffix">{suffix}</span>}
    </span>
  );
}

export function Select({
  value,
  options,
  onChange,
  label,
  testid,
  disabled,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  label: string;
  testid?: string;
  /* See NumberInput: disabled keeps the row visible so its hint can still say
     why the feature is unavailable. */
  disabled?: boolean;
}) {
  return (
    <select
      className="set-select"
      value={value}
      disabled={disabled}
      aria-label={label}
      data-testid={testid}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  testid,
  mono,
  password,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  testid?: string;
  mono?: boolean;
  password?: boolean;
  
  list?: string;
}) {
  return (
    <input
      type={password ? 'password' : 'text'}
      className={`set-text${mono ? ' is-mono' : ''}`}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      aria-label={label}
      data-testid={testid}
      list={list}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Pills({
  value,
  options,
  onChange,
  label,
  testid,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  label: string;
  testid?: string;
}) {
  return (
    <div className="set-pills" role="radiogroup" aria-label={label} data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`set-pill${value === o.value ? ' is-active' : ''}`}
          data-pill={o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function VoiceKeyRow({
  provider,
  testid,
}: {
  provider: string;
  testid?: string;
}) {
  const tr = useT();
  const keys = useSettingsUi((s) => s.keys);
  const saveKey = useSettingsUi((s) => s.saveKey);
  const entry = keys.find((k) => k.provider === provider);
  const has = entry?.hasKey === true;
  return (
    <span className="prov-keyrow">
      <input
        className="set-text is-mono"
        type="password"
        placeholder={has ? `${tr('models.saved')}: ${entry?.preview ?? ''}` : tr('models.noKey')}
        defaultValue=""
        spellCheck={false}
        aria-label={tr('Voice API key')}
        data-testid={testid}
        data-has-key={has ? '1' : ''}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const el = e.target as HTMLInputElement;
          if (!el.value.trim()) return;
          void saveKey(provider, el.value).then(() => { el.value = ''; });
        }}
      />
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={(e) => {
          const wrap = (e.target as HTMLElement).closest('.prov-keyrow');
          const el = wrap?.querySelector('input');
          if (!el?.value.trim()) return;
          void saveKey(provider, el.value).then(() => { el.value = ''; });
        }}
      >
        {tr('common.save')}
      </button>
      {has && (
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => void saveKey(provider, '')}
        >
          Delete
        </button>
      )}
    </span>
  );
}
