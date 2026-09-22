// multilineKey.ts — byte yang dikirim saat Shift+Enter di pane terminal.
//
// Masalahnya: tidak ada satu escape sequence yang dimengerti semua AI CLI.
//   * Hermes Agent mengaktifkan kitty keyboard protocol, jadi Shift+Enter
//     sampai ke sana sebagai CSI u `\x1b[13;2u`.
//   * Sebagian CLI lain (opencode, Codex) juga membacanya, tapi tidak semua
//     versi mengaktifkan protokol itu; yang paling luas justru membedakan
//     Enter (`\r`, submit) dari line feed (`\n`, baris baru).
//   * CLI yang memakai backslash sebagai lanjutan baris butuh `\\` + `\r`.
//
// Karena itu pemetaannya per-agent, bukan satu nilai global. Shell biasa tetap
// dapat `\n` (perilaku paling aman: shell menganggapnya akhir baris).
//
// Urutan pemeriksaan: override user (Settings) -> peta bawaan -> `\n`.

/** Escape sequence bawaan per agent CLI. Kunci = id agent di agents.rs. */
const BAWAAN: Record<string, string> = {
  // KitKat keyboard protocol: Hermes sudah mengaktifkannya.
  hermes: '\x1b[13;2u',
  // opencode & Codex: TUI mereka membedakan LF dari CR di raw mode.
  opencode: '\n',
  codex: '\n',
  // Claude Code memakai backslash sebagai lanjutan baris eksplisit.
  claude: '\\\r',
  // Gemini CLI: sama seperti opencode, LF cukup.
  gemini: '\n',
};

/** Nilai yang boleh dipilih user di Settings (selain "otomatis"). */
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

/**
 * Sequence untuk satu pane.
 * @param agentId id agent (`pane.agent?.name`) — undefined untuk shell biasa
 * @param override pilihan user dari Settings; 'auto' = pakai peta bawaan
 */
export function multilineSequence(agentId?: string, override?: MultilineKeyId): string {
  if (override && override !== 'auto') return dariId(override);
  if (agentId && BAWAAN[agentId]) return BAWAAN[agentId];
  return '\n';
}

/** Apakah pane ini AI CLI (bukan shell biasa)? Dipakai untuk label UI. */
export function isAgentPane(agentId?: string): boolean {
  return !!agentId && agentId in BAWAAN;
}
