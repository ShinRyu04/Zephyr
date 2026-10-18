import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/components/terminal/PaneIcons.tsx';
let s = readFileSync(P, 'utf8');

/*
 * `omp` and `qoder` were drawn with `stroke` and no `fill`, so their marks
 * rendered as hairlines - the CDP check reported `fill: none` for both, which is
 * why they looked missing in the menu.
 *
 * They are redrawn as SOLID silhouettes here: a filled glyph reads at 14px where
 * a 1.5px stroke turns to mush, and the terminal list is scanned, not studied.
 */

const ompBaru = `    case 'omp':
      /*
       * OMP's mark: the Pi glyph, solid, in the violet the project ships it in.
       *
       * Drawn filled rather than stroked. The stroked version rendered as three
       * hairlines that vanished at 14px - measured: \`fill: none\` in the live DOM,
       * which is exactly the "icon is missing" the reader saw. A filled glyph
       * survives the size.
       *
       * Its own case rather than an alias of \`pi\`: two separate CLIs, and a
       * future divergence should not silently recolour the other one.
       */
      return (
        <svg {...p} viewBox="0 0 16 16" aria-label="OMP">
          <path d="M3.2 4.2h9.6v1.9H9.1v5.7H6.9V6.1H3.2z" fill="#8b5cf6" />
        </svg>
      );
`;

const qoderBaru = `    case 'qoder':
    case 'qodercli':
      /*
       * Qoder's mark: a rabbit head in the brand green.
       *
       * Filled, not stroked - the stroked ears disappeared at 14px (measured
       * \`fill: none\` in the live DOM). Ears and muzzle are separate filled
       * shapes so the silhouette stays readable when the icon is tiny.
       */
      return (
        <svg {...p} viewBox="0 0 16 16" aria-label="Qoder CLI">
          <path d="M5.1 6.6C5.1 4.2 5.8 2.2 6.6 2.2c.7 0 1.2 1.4 1.3 3.3z" fill="#00C853" />
          <path d="M10.9 6.6c0-2.4-.7-4.4-1.5-4.4-.7 0-1.2 1.4-1.3 3.3z" fill="#00C853" />
          <path d="M8 5.3c2.2 0 3.9 1.6 3.9 3.5S10.2 12.3 8 12.3 4.1 10.7 4.1 8.8 5.8 5.3 8 5.3z" fill="#00C853" />
          <circle cx="6.7" cy="8.5" r="0.55" fill="#fff" />
          <circle cx="9.3" cy="8.5" r="0.55" fill="#fff" />
        </svg>
      );
`;

function ganti(sumber, mulai, akhir, baru) {
  const i = sumber.indexOf(mulai);
  const j = sumber.indexOf(akhir);
  if (i < 0 || j < 0 || j < i) {
    console.error(`GAGAL: blok tidak ditemukan (${mulai} .. ${akhir})`);
    process.exit(1);
  }
  return sumber.slice(0, i) + baru + sumber.slice(j);
}

s = ganti(s, "    case 'omp':", "    case 'qoder':", ompBaru);
s = ganti(s, "    case 'qoder':", "    default:", qoderBaru);
writeFileSync(P, s);
console.log('ok: omp + qoder digambar solid');
