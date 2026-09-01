// terminalClipboard.ts — copy/paste terminal. Satu jalur untuk UI
// (klik kanan, Ctrl+Shift+C, Shift+Insert) dan untuk verifikasi.

import { clipboardRead, clipboardWrite } from './clipboard';
import { ptyWrite } from './commands';
import { getHandle, getSelection } from './xtermRegistry';

/** Salin seleksi terminal ke clipboard. Mengembalikan teks yang tersalin. */
export async function copySelection(id: string): Promise<string> {
  const sel = getSelection(id);
  if (!sel) return '';
  await clipboardWrite(sel);
  getHandle(id)?.term.clearSelection();
  return sel;
}

/** Tempel isi clipboard ke terminal (dikirim ke shell sebagai input). */
export async function pasteInto(id: string): Promise<string> {
  const text = await clipboardRead();
  if (!text) return '';
  // CR dinormalkan: shell menerima \r sebagai Enter, \n bisa dobel-eksekusi.
  const data = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
  await ptyWrite(id, data);
  return text;
}
