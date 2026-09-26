import { useEffect, useRef, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import type { ApprovalMode } from '../../lib/types';
import { useT } from '../../lib/i18n';

const APPROVAL: { id: ApprovalMode; label: string; hint: string; kelas: string }[] = [
  {
    id: 'readonly',
    label: 'Read-only',
    hint: 'Cannot change anything - only reads',
    kelas: 'is-aman',
  },
  {
    id: 'ask',
    label: 'Ask permission',
    hint: 'Every command that changes something must be approved by you',
    kelas: 'is-tanya',
  },
  {
    id: 'work',
    label: 'Work directly',
    hint: 'Safe commands run on their own, risky ones still ask permission',
    kelas: 'is-kerja',
  },
  {
    id: 'auto',
    label: 'Auto (no asking)',
    hint: 'All commands run without interruption',
    kelas: 'is-auto',
  },
];

const EFFORT: { id: string; label: string; hint: string; kelas: string }[] = [
  { id: '', label: 'Auto', hint: 'Follow the provider default - no parameters sent', kelas: 'is-auto' },
  { id: 'minimal', label: 'Minimal', hint: 'Almost no reasoning - fastest', kelas: 'is-minimal' },
  { id: 'low', label: 'Low', hint: 'Brief reasoning', kelas: 'is-low' },
  { id: 'medium', label: 'Medium', hint: 'Balanced', kelas: 'is-medium' },
  { id: 'high', label: 'High', hint: 'For harder tasks', kelas: 'is-high' },
  { id: 'ultra', label: 'Ultra', hint: 'Maximum reasoning - slowest', kelas: 'is-ultra' },
];

function useKlikLuar(onTutup: () => void) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onTutup();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onTutup]);
  return ref;
}

export function ApprovalPicker() {
  const tr = useT();
  const mode = useAi((s) => s.approvalMode ?? 'work');
  const set = useAi((s) => s.setApprovalMode);
  const [buka, setBuka] = useState(false);
  const ref = useKlikLuar(() => setBuka(false));
  const aktif = APPROVAL.find((a) => a.id === mode) ?? APPROVAL[2];

  return (
    <span className={`pick-wrap ${aktif.kelas}`} ref={ref}>
      <button
        className="pick-btn"
        data-testid="ai-approval"
        data-mode={mode}
        aria-expanded={buka}
        title={tr(aktif.hint)}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="pick-dot" aria-hidden="true" />
        {tr(aktif.label)}
        <span className="pick-caret">▾</span>
      </button>
      {buka && (
        <div className="pick-pop" data-testid="approval-pop" role="listbox">
          <div className="pick-seksi">{tr('Approval mode')}</div>
          {APPROVAL.map((a) => (
            <button
              key={a.id}
              className={`pick-item ${a.kelas}${a.id === mode ? ' is-on' : ''}`}
              data-testid={`approval-${a.id}`}
              role="option"
              aria-selected={a.id === mode}
              onClick={() => {
                set(a.id);
                setBuka(false);
              }}
            >
              <span className="pick-item-dot" aria-hidden="true" />
              <span className="pick-item-teks">
                <b>{tr(a.label)}</b>
                <i>{tr(a.hint)}</i>
              </span>
              {a.id === mode && <span className="pick-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function EffortPicker() {
  const tr = useT();
  const effort = useAi((s) => s.reasoningEffort);
  const set = useAi((s) => s.setReasoningEffort);
  const [buka, setBuka] = useState(false);
  const ref = useKlikLuar(() => setBuka(false));
  const aktif = EFFORT.find((e) => e.id === (effort ?? '')) ?? EFFORT[0];

  return (
    <span className={`pick-wrap ${aktif.kelas}`} ref={ref}>
      <button
        className="pick-btn"
        data-testid="ai-effort"
        data-aktif={effort ? 'true' : 'false'}
        data-effort={effort ?? ''}
        aria-expanded={buka}
        title={tr('How deeply the model thinks before answering')}
        onClick={() => setBuka((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path
            d="M5.5 3.2a3.2 3.2 0 0 1 5.6 2.2c0 1.2-.6 1.8-1.1 2.4-.4.5-.7.9-.7 1.6v.3h-1.9v-.4c0-1.1.5-1.7 1-2.3.4-.5.8-.9.8-1.6a1.6 1.6 0 0 0-3.2 0h-1.5a3.2 3.2 0 0 1 1-2.2Z"
            fill="currentColor"
          />
          <rect x="7" y="11.4" width="2" height="1.8" rx="0.5" fill="currentColor" />
        </svg>
        {tr(aktif.label)}
        <span className="pick-caret">▾</span>
      </button>
      {buka && (
        <div className="pick-pop" data-testid="effort-pop" role="listbox">
          <div className="pick-seksi">{tr('Reasoning level')}</div>
          {EFFORT.map((e) => (
            <button
              key={e.id || 'auto'}
              className={`pick-item ${e.kelas}${e.id === (effort ?? '') ? ' is-on' : ''}`}
              data-testid={`effort-${e.id || 'auto'}`}
              role="option"
              aria-selected={e.id === (effort ?? '')}
              onClick={() => {
                set((e.id || null) as never);
                setBuka(false);
              }}
            >
              <span className="pick-item-dot" aria-hidden="true" />
              <span className="pick-item-teks">
                <b>{tr(e.label)}</b>
                <i>{tr(e.hint)}</i>
              </span>
              {e.id === (effort ?? '') && <span className="pick-check">✓</span>}
            </button>
          ))}
          <div className="pick-kaki">{tr('Sends reasoning.effort to the provider')}</div>
        </div>
      )}
    </span>
  );
}
