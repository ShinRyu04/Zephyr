import { useA11y } from '../../lib/a11yStore';

const ZWSP = '\u200b';

export default function LiveRegion() {
  const pesan = useA11y((s) => s.pesan);
  const pesanPenting = useA11y((s) => s.pesanPenting);
  const urutan = useA11y((s) => s.urutan);

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
