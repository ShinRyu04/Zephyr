import { useState } from 'react';
import { useExtApproval } from '../../lib/extApprovalStore';

export default function ExtApprovalModal() {
  const kepala = useExtApproval((s) => s.antrean[0]);
  const putuskan = useExtApproval((s) => s.putuskan);
  const [sibuk, setSibuk] = useState(false);

  if (!kepala) return null;

  const argsTeks = kepala.args.length > 0 ? kepala.args.join(' ') : '(no arguments)';

  return (
    <div className="modal-backdrop" role="presentation" data-testid="ext-approval">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="ext-approval-title">
        <h2 className="modal-title" id="ext-approval-title">
          External runtime permission
        </h2>

        <p className="set-note">
          Extension <strong>{kepala.extId}</strong> is asking to run{' '}
          <code>{kepala.runtime}</code> - <code>{kepala.binPath}</code> - with
          arguments <code>{argsTeks}</code>.
        </p>

        <p className="set-note">
          Execution is performed by Zephyr on the Rust side, only through this binary, with
          an automatic timeout. The extension gets no other system access. The permission
          is stored in Settings → Extensions and can be revoked at any time.
        </p>

        <div className="modal-actions">
          <button
            className="btn"
            data-testid="ext-approval-tolak"
            disabled={sibuk}
            onClick={() => void putuskan(false)}
          >
            Deny
          </button>
          <button
            className="btn btn-primary"
            data-testid="ext-approval-izinkan"
            disabled={sibuk}
            onClick={async () => {
              setSibuk(true);
              await putuskan(true);
              setSibuk(false);
            }}
          >
            Allow &amp; run
          </button>
        </div>
      </div>
    </div>
  );
}
