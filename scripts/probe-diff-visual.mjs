/*
 * Screenshot-style probe: what the diff rows and the composer ACTUALLY look
 * like once the app is running.
 *
 * The unit tests prove the card exists; they cannot see that an added line's
 * text is still painted the theme's green on a green wash, or that the field
 * inside the composer draws a second darker box. Both were reported by the
 * reader, so both are measured here from computed styles - not from the source.
 *
 * Usage: node scripts/probe-diff-visual.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = daftar.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5173'));
if (!page) {
  console.error('tidak ada halaman dev di port', port);
  process.exit(1);
}
const { cdp } = await Cdp.attach(port, page.title);

const hasil = await cdp.eval(`(() => {
  const hex = (w) => {
    const m = w.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return w;
    const p = m[1].split(',').map((n) => parseFloat(n));
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return 'transparan';
    return '#' + [p[0], p[1], p[2]].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  };
  const baris = [...document.querySelectorAll('.dv-baris')];
  const ubah = baris.filter((b) => b.dataset.kind !== 'sama');

  const contoh = ubah.slice(0, 4).map((b) => {
    /*
     * Read the cell that actually holds code. An added row leaves the LEFT
     * cell empty, and an empty cell has no wash to report - that is what made
     * an earlier run claim "transparan" while the CSS was in fact applied.
     */
    const selIsi = [...b.querySelectorAll('.dv-teks')].find((c) => c.textContent.trim() !== '');
    const tok = [...b.querySelectorAll('.dv-tok')].slice(0, 5).map((t) => ({
      kelas: t.className.replace('dv-tok dv-tok-', ''),
      teks: t.textContent,
      warna: hex(getComputedStyle(t).color),
    }));
    const teks = selIsi ?? null;
    const gutter = b.querySelector('.dv-no-baru') ?? b.querySelector('.dv-no');
    return {
      jenis: b.dataset.kind,
      cuplikan: (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70),
      latarSel: teks ? hex(getComputedStyle(teks).backgroundColor) : '-',
      warnaSel: teks ? hex(getComputedStyle(teks).color) : '-',
      token: tok,
      gutterLatar: gutter ? hex(getComputedStyle(gutter).backgroundColor) : '-',
    };
  });

  /* The composer: three bands inside one card, field transparent. */
  const row = document.querySelector('.ai-input-row');
  const input = document.querySelector('.ai-input');
  const tb = document.querySelector('.ai-input-toolbar');
  const judul = document.querySelector('.ai-draft-judul');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const composer = row ? {
    latarKartu: hex(cs(row).backgroundColor),
    radius: cs(row).borderRadius,
    marginKiri: cs(row).marginLeft,
    latarField: hex(cs(input).backgroundColor),
    latarToolbar: tb ? hex(cs(tb).backgroundColor) : '-',
    borderToolbarAtas: tb ? cs(tb).borderTopWidth : '-',
    judulAda: !!judul,
    judulTeks: judul ? judul.textContent.trim().slice(0, 50) : '',
  } : null;

  return { jumlahBaris: baris.length, diubah: ubah.length, contoh, composer };
})()`);

console.log(JSON.stringify(hasil, null, 2));
cdp.close();
process.exit(0);
