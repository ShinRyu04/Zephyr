// terminalClipboard.ts — copy/paste terminal. Satu jalur untuk UI
// (klik kanan, Ctrl+Shift+C, Shift+Insert) dan untuk verifikasi.

import { clipboardRead, clipboardWrite } from './clipboard';
import { ptyWrite } from './commands';
import { getHandle, getSelection } from './xtermRegistry';

/** Batas satu potongan paste ke PTY.
 *  ConPTY Windows dan terminal interaktif sangat rentan terpotong bila dikirimi
 *  chunk terlalu besar tanpa jeda, atau saat teks multi-line dikirim tanpa bracketed paste.
 *  512 byte dengan jeda 12ms memastikan ConPTY dan stdin buffer aplikasi (seperti AI CLI)
 *  dapat mengonsumsi stream tanpa ada buffer overflow / truncation. */
const PASTE_CHUNK = 512;

/** Salin seleksi terminal ke clipboard. Mengembalikan teks yang tersalin. */
export async function copySelection(id: string): Promise<string> {
  const sel = getSelection(id);
  if (!sel) return '';
  await clipboardWrite(sel);
  getHandle(id)?.term.clearSelection();
  return sel;
}

/** Tulis teks ke PTY dalam potongan aman anti-potong.
 *  Dipakai paste dan jalur MCP/AI "kirim ke terminal". */
export async function writeChunked(id: string, data: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < data.length; i += PASTE_CHUNK) {
    const part = data.slice(i, i + PASTE_CHUNK);
    await ptyWrite(id, part);
    sent += part.length;
    // Beri jeda kecil agar buffer ConPTY tidak meluap
    if (i + PASTE_CHUNK < data.length) await new Promise((r) => setTimeout(r, 12));
  }
  return sent;
}

/** Tempel isi clipboard ke terminal (dikirim ke shell sebagai input).
 *  Bracketed paste dipakai HANYA kalau aplikasi di terminal memintanya
 *  (mode DECSET 2004, mis. AI CLI). Kalau dipaksa, escape `[200~` ikut
 *  tercetak sebagai teks di shell yang tidak mendukungnya. */
export async function pasteInto(id: string): Promise<string> {
  const text = await clipboardRead();
  if (!text) return "";
  const cr = String.fromCharCode(13);
  const lf = String.fromCharCode(10);
  const lines = text.split(lf).map((l) => (l.endsWith(cr) ? l.slice(0, -1) : l));
  const normalized = lines.join(cr);
  const esc = String.fromCharCode(27);
  const bracketed = getHandle(id)?.term.modes.bracketedPasteMode === true;
  const payload = bracketed ? esc + "[200~" + normalized + esc + "[201~" : normalized;
  await writeChunked(id, payload);
  return text;
}
