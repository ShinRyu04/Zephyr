// SettingsControls.tsx — kontrol dasar yang dipakai berulang di SettingsPage.
// Semua warna dari token tema (AGENTS.md §4).

import type { ReactNode } from 'react';

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
  return (
    <div className="set-row" data-testid={testid}>
      <div className="set-row-label">
        <span className="set-label">{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-section">
      <h2 className="set-h2">{title}</h2>
      {children}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  testid,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`set-toggle${checked ? ' is-on' : ''}`}
      data-testid={testid}
      onClick={() => onChange(!checked)}
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
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  testid?: string;
  suffix?: string;
}) {
  return (
    <span className="set-num">
      <input
        type="range"
        className="set-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
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
        aria-label={`${label} (angka)`}
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
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  label: string;
  testid?: string;
}) {
  return (
    <select
      className="set-select"
      value={value}
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
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  testid?: string;
  mono?: boolean;
  password?: boolean;
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
