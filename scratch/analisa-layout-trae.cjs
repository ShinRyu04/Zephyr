/*
 * Derive TRAE's control layout from the OCR coordinates.
 *
 * THE MEASUREMENTS (screenshot 855px wide, content starts at x=17):
 *
 *   Section text  : x=17 (heading), x=33 (description)
 *   Toggle labels : IDE at x=725, SOLO at x=709 — RIGHT-ALIGNED to the page
 *   Review Scope  : dropdown text starts x=608, chevron ends ~x=730
 *   Terminal Env  : dropdown text starts x=654, chevron ~x=790
 *
 * THE CONCLUSION, and it is the thing the Zephyr page currently gets wrong:
 * TRAE puts the controls in a RIGHT-HAND COLUMN at a fixed x, and the IDE/SOLO
 * pair is right-aligned against the page edge — not stacked under the heading in
 * a left-hand flow. The heading and description occupy the left ~580px and the
 * controls sit opposite them, so the eye reads "what is this" then "is it on".
 *
 * That is why the current build reads as a form rather than as TRAE's list: the
 * controls are under the text instead of beside it.
 */
const fs = require('fs');

/* Straight from the OCR pass; kept here so the numbers are auditable. */
const OCR = {
  lebarHalaman: 855,
  teksKiri: 17,
  deskripsiKiri: 33,
  ideX: [725, 725, 725, 725],       // empat saklar IDE
  soloX: [709, 709, 709, 709],      // empat saklar SOLO
  reviewScopeX: 608,
  terminalEnvX: 654,
  autoOpenX: 615,
  volumeX: 523,
  yIde: [136, 338, 511, 691],
  ySolo: [174, 376, 548, 741],
};

/*
 * A toggle's track sits to the RIGHT of its label. If the label "IDE" starts at
 * x=725 and the page ends at 855, the track occupies roughly x=725..790 — a 65px
 * label-plus-track unit ending ~65px from the right edge.
 */
const kananKosong = OCR.lebarHalaman - (OCR.ideX[0] + 60);
console.log('lebar halaman :', OCR.lebarHalaman);
console.log('kolom teks    :', OCR.teksKiri, '→ ~580 (deskripsi berhenti di sini)');
console.log('saklar IDE    : x =', OCR.ideX.join(', '));
console.log('saklar SOLO   : x =', OCR.soloX.join(', '));
console.log('jarak IDE→SOLO: vertikal', OCR.ySolo[0] - OCR.yIde[0], 'px (dua baris, bukan satu baris)');
console.log('margin kanan  :', kananKosong, 'px');

/*
 * The gap between the two switches vertically is 38px, which at TRAE's 28px row
 * pitch is TWO rows — so IDE and SOLO are stacked, not side by side.
 */
console.log('\nKESIMPULAN:');
console.log('  1. Kontrol ada di KOLOM KANAN, bukan di bawah teks.');
console.log('  2. IDE dan SOLO DITUMPUK vertikal (jarak 38px = 2 baris), bukan sebaris.');
console.log('  3. Saklar rata kanan, ~65px dari tepi kanan.');
console.log('  4. Deskripsi kiri dibatasi ~580px supaya tidak menabrak kolom kontrol.');
