import * as cmd from '../../lib/commands';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';

/*
 * "My avatar" — the picture beside your own messages, edited in Chat Settings.
 *
 * It lived in the editor-area Settings page, under its Agents section, and this
 * row was a button that closed the chat settings page to go and find it. The
 * picture is shown in the chat and nowhere else, so the row that names it is
 * where it has to be editable.
 *
 * The image is stored as a data URL, the same shape the Settings page wrote: a
 * path breaks the moment the file moves, and an avatar is small enough that
 * copying its bytes into settings costs nothing.
 */
export function PemilihAvatar() {
  const tr = useT();
  const foto = useStore((s) => s.settings.agents?.userAvatarPath ?? '');
  const apply = useStore((s) => s.applySettings);

  const pilih = async () => {
    try {
      const f = await cmd.fileDialogOpen(false);
      const path = Array.isArray(f) ? f[0] : f;
      if (!path) return;
      const img = await cmd.bgImageRead(path);
      await apply({ agents: { userAvatarPath: img.data_url } });
    } catch {
      /* dialog cancelled / permission denied - not an error */
    }
  };

  return (
    <span className="cset-avatar" data-testid="cset-myavatar">
      {foto ? (
        <img
          className="cset-avatar-preview"
          src={foto}
          alt=""
          data-testid="cset-myavatar-preview"
        />
      ) : (
        <span className="cset-avatar-kosong" aria-hidden="true" data-testid="cset-myavatar-kosong" />
      )}
      <button type="button" className="btn btn-sm" data-testid="cset-myavatar-pilih" onClick={() => void pilih()}>
        {foto ? tr('Change…') : tr('Choose…')}
      </button>
      {foto && (
        <button
          type="button"
          className="btn btn-sm"
          data-testid="cset-myavatar-hapus"
          onClick={() => void apply({ agents: { userAvatarPath: '' } })}
        >
          {tr('Reset')}
        </button>
      )}
    </span>
  );
}
