import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT, tf } from '../../lib/i18n';
import { PROVIDERS } from '../../lib/modelCatalog';
import { TextInput } from '../settings/SettingsControls';

/*
 * The API-key editor, living INSIDE Chat Settings.
 *
 * It used to be a door: a single "Manage keys…" button that closed this page and
 * opened the editor-area Settings page at its Models section. That was the last
 * one left — models, sub-agents, tools, rules, context and the chat's own
 * appearance had all moved here, and the keys are the most chat-owned setting of
 * the lot: without one the chat cannot answer at all, and that is exactly when
 * the reader is standing in this panel looking at a 401.
 *
 * Sending them to another page to fix the thing that is broken in front of them
 * was the defect. The editor is small enough to keep here: the provider is
 * already chosen two rows up (`models.activeProvider`), so the control is one
 * masked field plus Save.
 *
 * Two things this deliberately does NOT do:
 *   - It never reads the key back. Rust keeps it in `secrets.json` and hands the
 *     frontend a mask; the field starts empty and a saved key shows as `••••`.
 *   - It does not offer a provider picker. Choosing a provider is `Active
 *     provider` above; two pickers for one value is how they drift apart.
 */
export function EditorKunci() {
  const tr = useT();
  const provider = useStore((s) => s.settings.models.activeProvider ?? 'custom');
  const label = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;

  const keys = useSettingsUi((s) => s.keys);
  const loadKeys = useSettingsUi((s) => s.loadKeys);
  const saveKey = useSettingsUi((s) => s.saveKey);

  const [nilai, setNilai] = useState('');
  const [sibuk, setSibuk] = useState(false);

  /*
   * `keys` is a masked list owned by the settings store, so it has to be fetched
   * once — the panel can open before anything else asked for it, and an empty
   * list would read as "no key stored" for a key that is stored.
   */
  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const baris = keys.find((k) => k.provider === provider);
  const adaKunci = Boolean(baris?.hasKey);

  const simpan = async (isi: string) => {
    setSibuk(true);
    /* An empty string is how the backend reads "remove the key", so the same
       call covers Save and Remove and neither can drift from the other. */
    await saveKey(provider, isi.trim());
    setNilai('');
    setSibuk(false);
  };

  return (
    <span className="cset-keys" data-testid="cset-keys">
      <span className="cset-keys-status" data-testid="cset-keys-status">
        {adaKunci
          ? tf('Saved: {mask}', { mask: baris?.preview ?? '' })
          : tr('No key saved for this provider yet.')}
      </span>
      <TextInput
        value={nilai}
        onChange={setNilai}
        label={tf('API key for {provider}', { provider: label })}
        placeholder={tr('Paste the key, then Save. An empty field removes it.')}
        testid="cset-keys-input"
        password
      />
      <span className="cset-keys-aksi">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-testid="cset-keys-save"
          disabled={sibuk}
          onClick={() => void simpan(nilai)}
        >
          {tr('Save')}
        </button>
        {adaKunci && (
          <button
            type="button"
            className="btn btn-sm"
            data-testid="cset-keys-hapus"
            disabled={sibuk}
            onClick={() => void simpan('')}
          >
            {tr('Remove')}
          </button>
        )}
      </span>
    </span>
  );
}
