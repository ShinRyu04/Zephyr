// SaveIssueDialog.tsx — dialog dua kasus simpan (fase 15.1):
//   missing : file tab sudah tidak ada di disk saat Ctrl+S → "buat baru?"
//   utf16   : tab UTF-16 read-only → "tulis ulang sebagai UTF-8?"
//
// Kenapa dialog terpisah dari ConfirmDialog: yang itu soal "buang perubahan",
// ini soal "menulis file yang tidak seperti yang kamu kira" — teks bahayanya
// harus spesifik.

import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';

export default function SaveIssueDialog() {
  const issue = useStore((s) => s.saveIssue);
  const resolve = useStore((s) => s.resolveSaveIssue);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (issue) okRef.current?.focus();
  }, [issue]);

  if (!issue) return null;

  const missing = issue.kind === 'missing';
  const title = missing
    ? `${issue.name} sudah tidak ada di disk`
    : `Simpan ${issue.name} sebagai UTF-8?`;
  const body = missing
    ? `File ini terhapus atau dipindahkan dari luar Zephyr (${issue.path}). Buat file baru di path yang sama dengan isi buffer saat ini?`
    : 'File aslinya UTF-16. Zephyr menuliskannya kembali sebagai UTF-8 — isi teks tetap sama, tetapi encoding di disk berubah dan file jadi bisa diedit.';
  const ok = missing ? 'Buat baru' : 'Tulis sebagai UTF-8';

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') void resolve('cancel');
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="si-title">
        <h2 className="modal-title" id="si-title" data-testid="save-issue-title">
          {title}
        </h2>
        <p className="modal-body" data-testid="save-issue-body">
          {body}
        </p>
        <div className="modal-actions">
          <button
            ref={okRef}
            className="btn btn-primary"
            data-testid="save-issue-ok"
            onClick={() => void resolve('ok')}
          >
            {ok}
          </button>
          <button
            className="btn"
            data-testid="save-issue-cancel"
            onClick={() => void resolve('cancel')}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
