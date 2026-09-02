// terminalClipboard.ts — copy/paste terminal. Satu jalur untuk UI
// (klik kanan, Ctrl+Shift+C, Shift+Insert) dan untuk verifikasi.

import { clipboardRead, clipboardWrite } from './clipboard';
import { ptyWrite } from './commands';
import { getHandle, getSelection } from './xtermRegistry';

/** Batas satu potongan paste ke PTY (fase 15.2).
 *  ConPTY punya buffer input terbatas: menulis 10KB sekaligus membuat
 *  potongan akhir hilang / karakter teracak di layar. 4KB adalah ukuran
 *  yang sama dengan buffer baca kita di Rust, jadi aman dua arah. */
const PASTE_CHUNK = 4096;

/** Salin seleksi terminal ke clipboard. Mengembalikan teks yang tersalin. */
export async function copySelection(id: string): Promise<string> {
  const sel = getSelection(id);
  if (!sel) return '';
  await clipboardWrite(sel);
  getHandle(id)?.term.clearSelection();
  return sel;
}

/** Tulis teks ke PTY dalam potongan 4KB (fase 15.2).
 *  Dipakai paste dan jalur MCP/AI "kirim ke terminal". */
export async function writeChunked(id: string, data: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < data.length; i += PASTE_CHUNK) {
    const part = data.slice(i, i + PASTE_CHUNK);
    await ptyWrite(id, part);
    sent += part.length;
    // Beri ConPTY satu tick untuk mengalirkan buffernya sebelum potongan
    // berikutnya. Tanpa jeda ini paste 10KB masih bisa terpotong.
    if (i + PASTE_CHUNK < data.length) await new Promise((r) => setTimeout(r, 8));
  }
  return sent;
}

/** Tempel isi clipboard ke terminal (dikirim ke shell sebagai input). */
export async function pasteInto(id: string): Promise<string> {
  const text = await clipboardRead();
  if (!text) return '';
  // CR dinormalkan: shell menerima \r sebagai Enter, \n bisa dobel-eksekusi.
  const data = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
  await writeChunked(id, data);
  return text;
}
