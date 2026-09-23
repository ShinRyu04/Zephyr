import { clipboardRead, clipboardWrite } from './clipboard';
import { ptyWrite } from './commands';
import { getHandle, getSelection } from './xtermRegistry';

const PASTE_CHUNK = 512;

export async function copySelection(id: string): Promise<string> {
  const sel = getSelection(id);
  if (!sel) return '';
  await clipboardWrite(sel);
  getHandle(id)?.term.clearSelection();
  return sel;
}

export async function writeChunked(id: string, data: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < data.length; i += PASTE_CHUNK) {
    const part = data.slice(i, i + PASTE_CHUNK);
    await ptyWrite(id, part);
    sent += part.length;
    
    if (i + PASTE_CHUNK < data.length) await new Promise((r) => setTimeout(r, 12));
  }
  return sent;
}

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
