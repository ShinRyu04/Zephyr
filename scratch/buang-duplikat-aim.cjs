/*
 * Remove the STALE duplicate of the Add Model styles from ai.css.
 *
 * `ai.css` carries an older copy of `.aim-add`, `.aim-preset`, `.aim-preset-btn`,
 * `.aim-preset-nama`, `.aim-preset-url` and `.aim-preset-btn.is-kustom` from the
 * first attempt at this dialog. `aim-models.css` is imported after it, so most
 * of the newer rules win — but `.aim-preset-btn` in the old copy declares
 * `flex-direction: column`, and the newer rule does not, so that one property
 * leaked through and the tiles rendered 93px tall with the name stacked under
 * the logo. That is the "still not similar" the reader kept seeing.
 *
 * Two owners for one class is the actual defect, so the old block is deleted
 * rather than patched: one stylesheet, one definition.
 */
const fs = require('fs');
const p = 'src/styles/ai.css';
const s = fs.readFileSync(p, 'utf8');

const mulai = s.indexOf('.aim-add {');
if (mulai < 0) {
  console.error('blok .aim-add tidak ketemu');
  process.exit(1);
}
/* The block ends right before `.aim-add-head`, which both copies define and
   which the newer stylesheet also owns. */
const akhir = s.indexOf('.aim-add-head {', mulai);
if (akhir < 0) {
  console.error('.aim-add-head tidak ketemu');
  process.exit(1);
}

const dibuang = s.slice(mulai, akhir);
if (!dibuang.includes('.aim-preset-btn')) {
  console.error('potongan tidak memuat .aim-preset-btn — batal, takut salah hapus');
  process.exit(1);
}

const catatan = `/*
 * The Add Model dialog's styles live in \`aim-models.css\` ONLY.
 *
 * A duplicate copy used to sit here, and because it declared
 * \`flex-direction: column\` on \`.aim-preset-btn\` — a property the newer rule does
 * not set — it leaked through and every provider tile rendered as a tall stacked
 * box instead of a single row. Measured 93px against the reference's ~44px.
 *
 * Deleted rather than overridden: one class, one owner.
 */

`;

fs.writeFileSync(p, s.slice(0, mulai) + catatan + s.slice(akhir));
console.log('dibuang', dibuang.length, 'karakter dari ai.css');
