// clipboard.ts — clipboard lewat plugin Tauri (Rust), bukan navigator.clipboard.
//
// Alasan: di WebView2, navigator.clipboard.readText/writeText melempar
// NotAllowedError "Document is not focused" — copy/paste terminal jadi gagal
// saat window tidak fokus (mis. dipanggil dari otomasi/CDP) dan kadang saat
// fokus pindah ke pane lain. Plugin clipboard-manager memakai API Windows
// langsung sehingga selalu bekerja.

import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

export async function clipboardWrite(text: string): Promise<void> {
  if (!text) return;
  try {
    await writeText(text);
  } catch {
    // Fallback terakhir bila plugin tidak tersedia.
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* diamkan: copy gagal bukan alasan mematikan terminal */
    }
  }
}

export async function clipboardRead(): Promise<string> {
  try {
    return (await readText()) ?? '';
  } catch {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }
}
