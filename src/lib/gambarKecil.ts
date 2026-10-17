/*
 * Shrink an image before it becomes an attachment.
 *
 * WHY this exists: an attachment travels to the provider as base64, and base64
 * is 4/3 of the file. A 1280x800 screenshot measured 638 KB on disk and
 * 850.834 characters as a data URL — more than TEN TIMES the whole request
 * budget, before a single line of conversation. The trimmer therefore had to
 * release the image to fit (that is what "request-nya terpotong batas gateway"
 * was), and the model answered about a picture it never received.
 *
 * Raising the budget is not the fix: the next screenshot is bigger. The image
 * is what has to get smaller — and the model does not need a 1280px original to
 * read what is on screen. Scaling to a readable width and re-encoding as JPEG
 * is the standard move for exactly this reason.
 *
 * Design notes:
 *  - Returns the ORIGINAL data URL when it already fits `batasChar` and is not
 *    bigger than the target dimensions. Re-encoding a small image only loses
 *    quality.
 *  - Falls back to the original on any failure (no canvas, decode error). A
 *    broken shrink must not lose the attachment the reader just pasted.
 *  - Never upscales.
 */

export interface OpsiKecil {
  /** Longest edge, in pixels. 1280 keeps UI text legible. */
  sisiMaks?: number;
  /** Target maximum length of the resulting data URL, in characters. */
  batasChar?: number;
  /** JPEG quality, 0..1. */
  mutu?: number;
}

export interface HasilKecil {
  dataUrl: string;
  /** True when the image was actually re-encoded. */
  dikecilkan: boolean;
  /** Length of the input, for reporting. */
  awalChar: number;
  akhirChar: number;
}

const SISI_MAKS_BAWAAN = 1280;
/*
 * The budget is what is LEFT after the fixed block, not the whole request.
 *
 * Measured: `PAYLOAD_MAX_CHARS` = 80.000, the agent system prompt alone is
 * ~41.000 characters, and the trimmer's own cap is 80.000 minus the tool specs
 * (~8.700) = ~71.300 for everything. That leaves roughly 30.000 characters for
 * images plus conversation text. A target of 160.000 (the first attempt) was
 * five times too large, so the trimmer kept releasing the image and the model
 * still answered about a picture it never got.
 *
 * 26.000 leaves ~4.000 for the user's text beside the system prompt. It is a
 * SMALL image on purpose: a readable screenshot at 26.000 characters is ~19 KB
 * of JPEG, which the model reads fine. The alternative - raising the request
 * budget until a 2 MB screenshot fits - would break the gateway instead.
 */
const BATAS_CHAR_BAWAAN = 26_000;
const MUTU_BAWAAN = 0.82;

/** True for a `data:image/...` URL. Other schemes (http/file) are left alone. */
export function adalahDataUrlGambar(s: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(s);
}

/**
 * Scale + re-encode a data URL so it fits the request budget.
 *
 * Async because image decoding is async. Pure with respect to app state: it
 * touches no store, so it can be unit-tested with any canvas implementation.
 */
export async function kecilkanGambar(
  dataUrl: string,
  opsi: OpsiKecil = {},
): Promise<HasilKecil> {
  const awalChar = dataUrl.length;
  const batas = opsi.batasChar ?? BATAS_CHAR_BAWAAN;
  const sisiMaks = opsi.sisiMaks ?? SISI_MAKS_BAWAAN;
  const mutu = opsi.mutu ?? MUTU_BAWAAN;

  const apaAdanya: HasilKecil = { dataUrl, dikecilkan: false, awalChar, akhirChar: awalChar };

  /* Only raster data URLs can be re-encoded here. */
  if (!adalahDataUrlGambar(dataUrl)) return apaAdanya;
  if (typeof document === 'undefined') return apaAdanya;

  let img: HTMLImageElement;
  try {
    img = await muatGambar(dataUrl);
  } catch {
    return apaAdanya;
  }

  const lebarAsli = img.naturalWidth || img.width;
  const tinggiAsli = img.naturalHeight || img.height;
  if (!lebarAsli || !tinggiAsli) return apaAdanya;

  const skala = Math.min(1, sisiMaks / Math.max(lebarAsli, tinggiAsli));
  const sudahKecil = skala === 1;
  /*
   * Small enough in BOTH senses: no rescale needed and the data URL already
   * fits. Returning here is what keeps a 40 KB icon byte-identical.
   */
  if (sudahKecil && awalChar <= batas) return apaAdanya;

  const lebar = Math.max(1, Math.round(lebarAsli * skala));
  const tinggi = Math.max(1, Math.round(tinggiAsli * skala));

  try {
    const kanvas = document.createElement('canvas');
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const ctx = kanvas.getContext('2d');
    if (!ctx) return apaAdanya;
    /* White matte: a transparent PNG turned into JPEG would otherwise go black. */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.drawImage(img, 0, 0, lebar, tinggi);

    /*
     * Walk the quality down, then the PIXELS down, until it fits.
     *
     * One pass of fixed qualities was measured insufficient: a dense 1280x800
     * screenshot stayed at 119.135 characters when the target was 26.000, which
     * is still over the room left in the request - the trimmer would then
     * release the image again. Halving the canvas repeatedly is what actually
     * converges on text-dense screenshots.
     */
    let hasil = kanvas.toDataURL('image/jpeg', mutu);
    const kandidatMutu = [mutu, 0.7, 0.6, 0.5, 0.42, 0.35];
    for (const q of kandidatMutu) {
      const coba = kanvas.toDataURL('image/jpeg', q);
      if (coba.length < hasil.length) hasil = coba;
      if (hasil.length <= batas) break;
    }

    let sumber: HTMLCanvasElement = kanvas;
    for (let putaran = 0; hasil.length > batas && putaran < 6; putaran += 1) {
      const k2 = document.createElement('canvas');
      k2.width = Math.max(1, Math.round(sumber.width / 2));
      k2.height = Math.max(1, Math.round(sumber.height / 2));
      const c2 = k2.getContext('2d');
      if (!c2) break;
      c2.fillStyle = '#fff';
      c2.fillRect(0, 0, k2.width, k2.height);
      c2.drawImage(sumber, 0, 0, k2.width, k2.height);
      sumber = k2;
      for (const q of [0.6, 0.5, 0.42]) {
        const coba = k2.toDataURL('image/jpeg', q);
        if (coba.length < hasil.length) hasil = coba;
        if (hasil.length <= batas) break;
      }
    }

    /*
     * If re-encoding made it BIGGER (a tiny PNG is often smaller than the same
     * JPEG), keep the original: the point is to fit, not to convert formats.
     */
    if (hasil.length >= awalChar) return apaAdanya;

    return { dataUrl: hasil, dikecilkan: true, awalChar, akhirChar: hasil.length };
  } catch {
    return apaAdanya;
  }
}

function muatGambar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}
