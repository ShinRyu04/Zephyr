// PaneIcons.tsx — ikon jenis pane + logo CLI agent (inline SVG, tanpa lib).
// Warna dari token tema (AGENTS.md §4: dilarang hex hardcoded di komponen),
// kecuali logo brand yang memang punya warna resmi sendiri.

import type { PaneKind } from '../../lib/types';

/** Logo per CLI agent. Bentuk sederhana yang mudah dikenali di ukuran 14px. */
export function AgentLogo({ id, size = 14 }: { id: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', role: 'img' as const };

  switch (id) {
    case 'opencode':
      // kurung kurawal + titik (brand opencode: monospace/terminal)
      return (
        <svg {...p} aria-label="opencode">
          <path
            d="M6 3.2C4.4 3.2 4.6 7 3.2 8c1.4 1 1.2 4.8 2.8 4.8M10 3.2c1.6 0 1.4 3.8 2.8 4.8-1.4 1-1.2 4.8-2.8 4.8"
            fill="none"
            stroke="#f5a623"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'claude':
      // percikan / asterisk khas Anthropic
      return (
        <svg {...p} aria-label="Claude">
          <path
            d="M8 2v12M2.9 4.9l10.2 6.2M13.1 4.9L2.9 11.1"
            fill="none"
            stroke="#d97757"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'codex':
      // lingkaran OpenAI-ish + inti
      return (
        <svg {...p} aria-label="Codex">
          <circle cx="8" cy="8" r="5.4" fill="none" stroke="#10a37f" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="1.7" fill="#10a37f" />
        </svg>
      );
    case 'gemini':
      // bintang empat sudut (Gemini)
      return (
        <svg {...p} aria-label="Gemini">
          <path d="M8 1.6c.7 3.5 2.9 5.7 6.4 6.4-3.5.7-5.7 2.9-6.4 6.4-.7-3.5-2.9-5.7-6.4-6.4C5.1 7.3 7.3 5.1 8 1.6z" fill="#4285f4" />
        </svg>
      );
    case 'grok':
      // garis silang tajam (X/Grok)
      return (
        <svg {...p} aria-label="Grok">
          <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'pi':
      // huruf pi
      return (
        <svg {...p} aria-label="Pi">
          <path d="M3.2 5h9.6M5.8 5v6.4M10.4 5v6.4" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'gh':
      // octocat disederhanakan: kepala + telinga
      return (
        <svg {...p} aria-label="GitHub Copilot">
          <circle cx="8" cy="8.6" r="4.6" fill="none" stroke="var(--text)" strokeWidth="1.3" />
          <circle cx="6.3" cy="8.2" r="0.95" fill="var(--text)" />
          <circle cx="9.7" cy="8.2" r="0.95" fill="var(--text)" />
        </svg>
      );
    case 'cursor':
      // kursor panah
      return (
        <svg {...p} aria-label="Cursor">
          <path d="M4 2.6l8.2 5.1-3.6.8L10 12l-1.6.8-1.6-3.4-2.8 1.9z" fill="var(--accent)" />
        </svg>
      );
    default:
      // agent tak dikenal (ditambah user di Settings)
      return (
        <svg {...p} aria-label={id}>
          <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <path d="M5.6 8h4.8" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Ikon jenis pane: shell/private/cmd/bash/wsl/browser/ssh/agent. */
export default function PaneIcon({
  kind,
  agentId,
  size = 13,
}: {
  kind: PaneKind | string;
  agentId?: string;
  size?: number;
}) {
  if (kind === 'agent') return <AgentLogo id={agentId ?? ''} size={size} />;

  const p = { width: size, height: size, viewBox: '0 0 16 16', className: 'tt-icon' };
  const box = { fill: 'none', strokeWidth: 1.2 };

  if (kind === 'private') {
    return (
      <svg {...p} role="img" aria-label="Private (tanpa riwayat)">
        <path d="M1.6 8s2.4-4 6.4-4 6.4 4 6.4 4-2.4 4-6.4 4S1.6 8 1.6 8z" {...box} stroke="var(--warning)" />
        <circle cx="8" cy="8" r="1.7" fill="var(--warning)" />
        <path d="M3 13L13 3" stroke="var(--warning)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'browser') {
    return (
      <svg {...p} aria-hidden="true">
        <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" {...box} stroke="var(--accent)" />
        <path d="M1.6 5.8h12.8" stroke="var(--accent)" strokeWidth="1.2" />
        <circle cx="3.6" cy="4.2" r="0.6" fill="var(--accent)" />
      </svg>
    );
  }
  if (kind === 'ssh') {
    return (
      <svg {...p} aria-hidden="true">
        <rect x="2" y="2.4" width="12" height="4.4" rx="1.2" {...box} stroke="var(--success)" />
        <rect x="2" y="9.2" width="12" height="4.4" rx="1.2" {...box} stroke="var(--success)" />
        <circle cx="4.4" cy="4.6" r="0.7" fill="var(--success)" />
        <circle cx="4.4" cy="11.4" r="0.7" fill="var(--success)" />
      </svg>
    );
  }
  if (kind === 'cmd') {
    return (
      <svg {...p} aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...box} stroke="currentColor" />
        <path d="M4 6h2M4 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'bash' || kind === 'wsl') {
    return (
      <svg {...p} aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...box} stroke="var(--success)" />
        <path
          d="M4.2 6.2l2 2-2 2M8 10.4h3.5"
          stroke="var(--success)"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  // PowerShell (default)
  return (
    <svg {...p} aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...box} stroke="var(--accent)" />
      <path d="M5 5.6l3 2.4-3 2.4M8.6 10.4h3" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
