const BAWAAN: Record<string, string> = {

  hermes: '\x1b[13;2u',

  opencode: '\n',
  codex: '\n',

  claude: '\\\r',

  gemini: '\n',
};

export const PILIHAN_MULTILINE = [
  { id: 'auto', label: 'Otomatis (per CLI)' },
  { id: 'csiu', label: 'CSI u (\\x1b[13;2u) — Hermes' },
  { id: 'lf', label: 'Line feed (\\n)' },
  { id: 'backslash', label: 'Backslash + Enter (\\)' },
] as const;

export type MultilineKeyId = (typeof PILIHAN_MULTILINE)[number]['id'];

function dariId(id: string): string {
  switch (id) {
    case 'csiu':
      return '\x1b[13;2u';
    case 'lf':
      return '\n';
    case 'backslash':
      return '\\\r';
    default:
      return '\n';
  }
}

export function multilineSequence(agentId?: string, override?: MultilineKeyId): string {
  if (override && override !== 'auto') return dariId(override);
  if (agentId && BAWAAN[agentId]) return BAWAAN[agentId];
  return '\n';
}

export function isAgentPane(agentId?: string): boolean {
  return !!agentId && agentId in BAWAAN;
}
