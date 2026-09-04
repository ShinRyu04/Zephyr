// LiveRegion.tsx — satu live region untuk seluruh app (fase 31).
//
// Dua region, dua peran:
//   polite    → hasil operasi, perubahan state (tidak memotong user)
//   assertive → error yang harus didengar sekarang
//
// JEBAKAN: screen reader MENGABAIKAN penulisan ulang teks yang identik.
// Mengumumkan "3 hasil" dua kali hanya terdengar sekali. Solusinya menempel
// zero-width space (U+200B) sebanyak `urutan % 2` — teks jadi BERBEDA secara
// DOM tapi identik saat dibacakan. Menaruh penghitung di atribut TIDAK cukup:
// perubahan atribut pada anak tidak memicu pembacaan ulang region.

import { useA11y } from '../../lib/a11yStore';

const ZWSP = '\u200b';

export default function LiveRegion() {
  const pesan = useA11y((s) => s.pesan);
  const pesanPenting = useA11y((s) => s.pesanPenting);
  const urutan = useA11y((s) => s.urutan);

  // Selang-seling 0/1 zero-width space supaya teks selalu berubah.
  const beda = ZWSP.repeat(urutan % 2);

  return (
    <>
      <div
        className="a11y-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="a11y-live-polite"
        data-urutan={urutan}
      >
        {pesan ? pesan + beda : ''}
      </div>

      <div
        className="a11y-live"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="a11y-live-assertive"
        data-urutan={urutan}
      >
        {pesanPenting ? pesanPenting + beda : ''}
      </div>
    </>
  );
}
