import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/components/terminal/PaneIcons.tsx';
let s = readFileSync(P, 'utf8');

/*
 * Rewrite the Hermes branch so the silhouette sits on a light tile in BLACK,
 * instead of being painted in currentColor (which inverted the artwork on a dark
 * panel: black hair became white hair).
 *
 * Done by locating the branch textually and replacing the three wrapper lines -
 * the paths themselves are untouched vendor data and must not be retyped.
 */
const awal = s.indexOf("    case 'hermes':");
const akhir = s.indexOf("    case 'grok':");
if (awal < 0 || akhir < 0 || akhir < awal) {
  console.error('GAGAL: blok hermes tidak ditemukan');
  process.exit(1);
}

const blok = s.slice(awal, akhir);
const sebelumPath = blok.indexOf('<svg');
const sesudahSvgTutup = blok.lastIndexOf('</svg>');
if (sebelumPath < 0 || sesudahSvgTutup < 0) {
  console.error('GAGAL: <svg> hermes tidak ditemukan');
  process.exit(1);
}

/* Keep the paths verbatim - only swap the wrapper and the fill. */
const isiSvg = blok.slice(blok.indexOf('>', sebelumPath) + 1, sesudahSvgTutup);
const paths = isiSvg.replace(/fill="currentColor"/g, '');

const komentar = `    case 'hermes':
      /*
       * The mark as its owner ships it: "Hermes Agent Logo - Black", the asset
       * from zonalogo.com. Copied verbatim, all three paths, transform wrapper
       * dropped - the file's viewBox is 200 square around 24-unit coordinates
       * scaled by 8.333, so the same coordinates sit in a 24 viewBox.
       *
       * Drawn as an APP ICON: black artwork on a light tile, identical in both
       * themes.
       *
       * It used to be painted in \`currentColor\`, on the reasoning that a black
       * mark on a dark sidebar is an invisible mark. That reasoning was wrong
       * for THIS mark: Hermes is a solid silhouette - its hair is black in the
       * vendor asset - so \`currentColor\` inverted the artwork. On a dark panel
       * the hair turned white and the mark stopped looking like the product.
       * The reader said it plainly: "hermes rambut nya putih, ga kek asli nya
       * yg rambutnya hitam, jdi kebalik pas mode gelap".
       *
       * Keeping the black fill and giving it a light tile preserves the artwork
       * instead of recolouring it per theme, which is what "asli" means.
       */
      return (
        <svg {...p} viewBox="0 0 24 24" aria-label="Hermes Agent">
          <rect width="24" height="24" rx="5" fill="#f5f0e8" />
          <g transform="translate(2.4 2.4) scale(0.8)" fill="#14171a">${paths}
          </g>
        </svg>
      );
`;

s = s.slice(0, awal) + komentar + s.slice(akhir);
writeFileSync(P, s);
console.log('ok: blok hermes ditulis ulang (path tidak diubah)');
