import { useStore, useActiveTab } from '../../lib/store';
import { useT } from '../../lib/i18n';

const fmt = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

export default function ReadOnlyBanner() {
  const tr = useT();
  const tab = useActiveTab();
  const saveTabAs = useStore((s) => s.saveTabAs);
  const setSaveIssue = useStore((s) => s.setSaveIssue);

  if (!tab || !tab.readOnly) return null;

  const isUtf16 = tab.encoding === 'utf16le' || tab.encoding === 'utf16be';

  return (
    <div className="ro-banner" data-testid="ro-banner" data-kind={isUtf16 ? 'utf16' : 'big'}>
      <svg viewBox="0 0 16 16" className="ro-ico" aria-hidden="true">
        <path
          d="M8 1.8l6 11.4H2z M8 6.2v3.1 M8 11.1v.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <span className="ro-text" data-testid="ro-note">
        {tab.note || 'File dibuka baca-saja'}
        {tab.bytes ? ` (${fmt(tab.bytes)})` : ''}
      </span>
      {isUtf16 ? (
        <button
          className="btn btn-sm"
          data-testid="ro-save-utf8"
          title={tr('Tulis ulang file ini sebagai UTF-8 supaya bisa diedit')}
          onClick={() =>
            setSaveIssue({
              kind: 'utf16',
              tabId: tab.id,
              path: tab.path ?? '',
              name: tab.name,
            })
          }
        >
          Simpan sebagai UTF-8
        </button>
      ) : (
        <button
          className="btn btn-sm"
          data-testid="ro-save-copy"
          title={tr('Simpan salinan yang bisa diedit')}
          onClick={() => void saveTabAs(tab.id)}
        >
          Simpan salinan…
        </button>
      )}
    </div>
  );
}
