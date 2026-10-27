/*
 * The two dialogs the Agents editor opens: the avatar picker and Smart Generate.
 *
 * WHY THEY ARE MODALS, and not inline controls:
 *
 * The previous editor put ten small icon buttons in a row under the avatar.
 * That is a *palette*, not a choice - it shows every option at once, in a size
 * too small to tell a dragon from a robot, and it leaves the avatar itself
 * unclickable even though it is the obvious thing to click.
 *
 * The reference does the opposite: the avatar IS the button, and pressing it
 * opens a dialog with one large preview, a "Try Another" shuffle, and an
 * upload. Smart Generate is the same shape - a dialog with a prompt box and a
 * Generate button - because a generator that writes into the form as you watch
 * gives you no chance to describe what you want first.
 *
 * Both dialogs share one backdrop/modal shell so Escape, the focus ring and the
 * close button behave the same in each.
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { IKON_SUBAGENT, ikonSubagent } from '../../lib/subagentIcons';
import { kecilkanGambar } from '../../lib/gambarKecil';

/*
 * The avatar set, in the order the picker shows it.
 *
 * `robot` first because it is the default and the one the reference leads with;
 * the rest follow the order they are declared in `subagentIcons.ts`, so adding a
 * new mark there makes it available here with no second list to update.
 */
const AVATAR: string[] = (() => {
  const id = IKON_SUBAGENT.map((i) => i.id);
  const robot = id.indexOf('robot');
  if (robot > 0) {
    const sisa = [...id];
    sisa.splice(robot, 1);
    return ['robot', ...sisa];
  }
  return id;
})();

/* ── Shell ────────────────────────────────────────────────────────────────── */

function Dialog({
  judul,
  onTutup,
  children,
  testid,
}: {
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /*
   * Escape closes, and focus starts inside the dialog.
   *
   * Without the focus move, a keyboard user who pressed the avatar is left with
   * the caret behind the backdrop - the dialog is visible but unreachable, and
   * Tab walks the page underneath it.
   */
  /*
   * The close callback is held in a ref, and the effect runs ONCE.
   *
   * WHY: `onTutup` is an inline arrow from the parent, so it is a NEW function
   * reference on every render. With `[onTutup]` as the dependency the effect
   * re-ran after every keystroke — and each run called `focus()`, pulling focus
   * out of the field the reader had just clicked into. The symptom is "the input
   * cannot be typed in", which looks like a CSS or pointer-events bug and is
   * neither.
   */
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;

  useEffect(() => {
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutupRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* Empty on purpose: focus and the listener are set once for the dialog's
       lifetime. Re-running them is what broke typing. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" data-testid={testid}>
      <div
        className="modal agset-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        tabIndex={-1}
      >
        <h2 className="modal-title">{judul}</h2>
        {children}
      </div>
    </div>
  );
}

/** Read a picked image file as a data URL, so the shared downscaler can run. */
function berkasKeDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('could not read the image'));
    r.readAsDataURL(f);
  });
}

/* ── Avatar picker ────────────────────────────────────────────────────────── */

export function AvatarPicker({
  nilai,
  onPilih,
  onTutup,
  onGambar,
  onGagal,
}: {
  nilai: string;
  onPilih: (id: string) => void;
  onTutup: () => void;
  /** Uploaded picture: base64 payload (no prefix) and the original file name. */
  onGambar?: (base64: string, namaBerkas: string) => void;
  onGagal?: (pesan: string) => void;
}) {
  const tr = useT();
  const [calon, setCalon] = useState(nilai || 'robot');
  const berkasRef = useRef<HTMLInputElement | null>(null);

  /*
   * "Try Another" picks a mark that is NOT the current one.
   *
   * Picking at random from the whole list would sometimes return the same mark,
   * and a shuffle that visibly does nothing reads as a broken button. Looping
   * until it differs guarantees the preview changes on every press.
   */
  const acak = () => {
    if (AVATAR.length < 2) return;
    let berikut = calon;
    while (berikut === calon) {
      berikut = AVATAR[Math.floor(Math.random() * AVATAR.length)];
    }
    setCalon(berikut);
  };

  return (
    <Dialog judul={tr('Change Avatar')} onTutup={onTutup} testid="agx-avatar-modal">
      <div className="agset-dialog-tengah">
        <span className="agset-avatar agset-avatar-jumbo" aria-hidden="true" data-testid="agx-avatar-calon">
          <AiIkon name={ikonSubagent(calon).id as never} size={44} />
        </span>
      </div>

      {/*
        * The full set as a grid. The reference shows one avatar at a time and
        * relies on Try Another; a grid is strictly better here because Zephyr
        * ships a small, known set and a reader who wants the dragon should not
        * have to press a shuffle button eight times to find it.
        */}
      <div className="agset-avatar-grid" data-testid="agx-avatar-grid">
        {AVATAR.map((id) => (
          <button
            key={id}
            type="button"
            className={`agset-avatar-pil${calon === id ? ' is-on' : ''}`}
            data-testid={`agx-avatar-${id}`}
            title={id}
            onClick={() => setCalon(id)}
          >
            <AiIkon name={ikonSubagent(id).id as never} size={20} />
          </button>
        ))}
      </div>

      <div className="agset-dialog-aksi">
        <button type="button" className="agset-btn-batal" data-testid="agx-avatar-acak" onClick={acak}>
          {tr('Try Another')}
        </button>
        <button
          type="button"
          className="agset-btn-batal"
          data-testid="agx-avatar-unggah"
          onClick={() => berkasRef.current?.click()}
        >
          {tr('Upload from Local')}
        </button>
        {/*
          * Uploading replaces the drawn mark with a real picture.
          *
          * The file is downscaled HERE, before it leaves the webview: an agent
          * avatar renders at 13-44 px, and shipping a 4 MB photo into the data
          * folder would be a waste that also makes the picker slow. 128 px is
          * four times the largest size it is ever drawn at.
          *
          * The parent saves the bytes; this dialog only reports what was picked
          * so a failed write can be shown instead of silently keeping the old
          * mark.
          */}
        <input
          ref={berkasRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          data-testid="agx-avatar-berkas"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            void berkasKeDataUrl(f)
              .then((dataUrl) => kecilkanGambar(dataUrl, { sisiMaks: 128, batasChar: 400_000 }))
              .then((h) => onGambar?.(h.dataUrl.replace(/^data:[^,]*,/, ''), f.name))
              .catch((err: unknown) =>
                onGagal?.(String((err as { message?: string })?.message ?? err)),
              )
              .finally(() => onTutup());
          }}
        />
        {nilai ? (
          <button
            type="button"
            className="agset-btn-batal"
            data-testid="agx-avatar-hapus"
            onClick={() => {
              onGambar?.('', '');
              onTutup();
            }}
          >
            {tr('Remove avatar')}
          </button>
        ) : null}
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="agx-avatar-pakai"
          onClick={() => {
            onPilih(calon);
            onTutup();
          }}
        >
          {tr('Use')}
        </button>
        <button type="button" className="btn" data-testid="agx-avatar-batal" onClick={onTutup}>
          {tr('Cancel')}
        </button>
      </div>
    </Dialog>
  );
}

/* ── Smart Generate ───────────────────────────────────────────────────────── */

export function SmartGenerate({
  onHasil,
  onTutup,
}: {
  onHasil: (nama: string, prompt: string) => void;
  onTutup: () => void;
}) {
  const tr = useT();
  const [teks, setTeks] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  /*
   * The generator writes a DRAFT from what the reader typed.
   *
   * It does not call a model. A button that secretly spends tokens on every
   * press is a surprise, and the result would still need editing. What this
   * does is turn a sentence into the two fields the editor actually has - a
   * short name and a prompt - which is the part people stare at. The reader
   * then edits both in the form, where every other field lives.
   */
  const hasilkan = () => {
    const t = teks.trim();
    if (!t) {
      setGalat(tr('Describe what the agent should do first.'));
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      /* Name: the first few words, trimmed to the 20-char limit the field has. */
      const kata = t.split(/\s+/).filter(Boolean);
      let nama = kata.slice(0, 3).join(' ');
      if (nama.length > 20) nama = nama.slice(0, 20).trimEnd();
      if (!nama) nama = tr('New Agent');

      const prompt = [
        tr('You are a focused assistant. Your job:'),
        t,
        '',
        tr('Work only on that. Read before you change anything, keep edits small, and say what you did when you are done.'),
      ].join('\n');

      onHasil(nama, prompt);
      onTutup();
    } catch (e) {
      setGalat(String(e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Dialog judul={tr('Smart Generate')} onTutup={onTutup} testid="agx-smart-modal">
      <p className="agset-muted" style={{ marginBottom: 10 }}>
        {tr('Describe the agent in one or two sentences. It writes a draft you can edit.')}
      </p>

      <label className="agset-field">
        <span className="agset-field-label">
          {tr('What should this agent do?')}
          <em>{teks.length}/500</em>
        </span>
        <textarea
          data-testid="agx-smart-teks"
          className="agset-smart-teks"
          rows={6}
          maxLength={500}
          value={teks}
          placeholder={tr('e.g. Reviews pull requests for missing tests and unclear names')}
          onChange={(e) => setTeks(e.target.value)}
        />
      </label>

      {galat && (
        <p className="agset-galat" data-testid="agx-smart-galat">
          {galat}
        </p>
      )}

      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="agx-smart-generate"
          disabled={sibuk}
          onClick={hasilkan}
        >
          {sibuk ? tr('Generating…') : tr('Generate')}
        </button>
        <button type="button" className="btn" data-testid="agx-smart-batal" onClick={onTutup}>
          {tr('Cancel')}
        </button>
      </div>
    </Dialog>
  );
}
