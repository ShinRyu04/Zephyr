// clipboard.ts — clipboard lewat plugin Tauri (Rust), bukan navigator.clipboard.
//
// Alasan: di WebView2, navigator.clipboard.readText/writeText melempar
// NotAllowedError "Document is not focused" — copy/paste terminal jadi gagal
// saat window tidak fokus (mis. dipanggil dari otomasi/CDP) dan kadang saat
// fokus pindah ke pane lain. Plugin clipboard-manager memakai API Windows
// langsung sehingga selalu bekerja.

import { readImage, readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

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

/**
 * Baca gambar dari clipboard (Win+Shift+S lalu Ctrl+V) sebagai data URL PNG.
 * Mengembalikan null kalau clipboard tidak berisi gambar. Gambar lebar
 * diturunkan skalanya (maks 1600px) supaya data URL-nya tidak membengkak
 * saat disimpan ke localStorage.
 */
export async function clipboardReadImage(): Promise<string | null> {
  try {
    const img = await readImage();
    const { width, height } = await img.size();
    if (!width || !height) return null;
    const rgba = await img.rgba();
    if (!rgba || rgba.length === 0) return null;

    const scale = width > 1600 ? 1600 / width : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const bmp = new ImageData(new Uint8ClampedArray(rgba), width, height);
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    tmp.getContext('2d')?.putImageData(bmp, 0, 0);
    ctx.drawImage(tmp, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
