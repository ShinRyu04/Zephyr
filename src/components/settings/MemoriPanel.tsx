/*
 * MemoriPanel — the Settings page that lets the reader SEE and DELETE what
 * Zeph remembers between sessions.
 *
 * Why a page of its own: memory is not a preference, it is a claim about the
 * user that was written by the model. Every other control in Settings changes
 * how Zeph behaves from now on; the control here takes back something Zeph
 * believes it was told. That is a destructive action, so it lives on a page the
 * reader opens on purpose rather than in the chat stream, where the wrong click
 * deletes the wrong entry with no confirmation.
 *
 * Scope of this page, deliberately:
 *   - READ: the entries that are visible from the open folder, split into the
 *     global layer (follows the user across projects) and this project's layer.
 *   - DELETE: one entry at a time.
 * It does NOT write memory. Remembering is the model's job, and a text box here
 * would be a second, silently different way to say the same thing.
 *
 * Why `aiMemori` is called directly instead of through a store: the module keeps
 * the loaded document in its own cache (`dokumenTersimpan()`), and `hapus()`
 * writes the file AND refreshes that cache, so the block injected into the next
 * prompt changes without a reload. A copy of the entries held in React state
 * would go stale the moment the model writes a new entry to the same file, so
 * every action here (mount, reload, delete) re-reads through `muatLengkap()`.
 *
 * Every label goes through the dictionary: this page ships in the same 10
 * languages as the rest of Settings, and the keys are `settings.memori*` in
 * `src/lib/i18n.ts`.
 */
import { useCallback, useEffect, useState } from 'react';
import AiIkon from '../ai/AiIkon';
import { useT, useTf } from '../../lib/i18n';
import { useSettingsUi } from '../../lib/settingsStore';
import { useStore } from '../../lib/store';
import {
  hapus,
  kunciProyek,
  muatLengkap,
  type DokumenMemori,
  type EntriMemori,
  type JenisMemori,
} from '../../lib/aiMemori';

/*
 * One dictionary key per kind, kept as a map rather than built from the kind
 * string ("jenis" + "keputusan"): the key would then depend on the literal
 * spelling of the type, and a renamed kind would render its own key in the UI.
 */
const JENIS_KEY: Record<JenisMemori, string> = {
  keputusan: 'settings.memori.jenisKeputusan',
  preferensi: 'settings.memori.jenisPreferensi',
  kerja: 'settings.memori.jenisKerja',
  lain: 'settings.memori.jenisLain',
};

/** Newest first; `waktu` is ISO 8601, so the string order is the time order. */
function terbaruDulu(entri: EntriMemori[]): EntriMemori[] {
  return [...entri].sort((a, b) => (a.waktu === b.waktu ? 0 : a.waktu < b.waktu ? 1 : -1));
}

export default function MemoriPanel() {
  const tr = useT();
  const tf = useTf();
  const root = useStore((s) => s.workspace);
  const setMessage = useSettingsUi((s) => s.setMessage);

  const [dok, setDok] = useState<DokumenMemori | null>(null);
  const [catatan, setCatatan] = useState<string[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const hasil = await muatLengkap();
      setDok(hasil.dok);
      setCatatan(hasil.catatan);
    } catch (e) {
      /* Unreadable store: show it as a note instead of an empty list. "Nothing
         remembered" and "could not read what is remembered" are different
         claims, and only one of them is true here. */
      setDok(null);
      setCatatan([e instanceof Error ? e.message : String(e)]);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const buang = async (id: string) => {
    setSibuk(id);
    try {
      const terhapus = await hapus(id);
      if (!terhapus) setMessage(tr('settings.memori.gagalHapus'));
      await muat();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(null);
    }
  };

  const kunci = kunciProyek(root);
  const semua = dok?.entri ?? [];
  const global = terbaruDulu(semua.filter((e) => e.lapis === 'global'));
  const proyek = terbaruDulu(
    semua.filter((e) => e.lapis === 'proyek' && kunci !== null && e.proyek === kunci),
  );

  const baris = (e: EntriMemori) => (
    <div className="set-row" key={e.id} data-testid={`memori-baris-${e.id}`}>
      <div className="set-row-label">
        {/* `e.teks` is raw data written by the model, not a key: it is rendered
            as-is and never passed through the dictionary. */}
        <span className="set-label">{e.teks}</span>
        <span className="set-hint" data-testid={`memori-meta-${e.id}`}>
          {e.tanggal} · {tr(JENIS_KEY[e.jenis])}
        </span>
      </div>
      <div className="set-row-control">
        <button
          className="btn btn-sm btn-icon"
          type="button"
          title={tr('settings.memori.hapus')}
          aria-label={`${tr('settings.memori.hapus')}: ${e.teks}`}
          data-testid={`memori-hapus-${e.id}`}
          disabled={sibuk === e.id}
          onClick={() => void buang(e.id)}
        >
          <AiIkon name="trash" size={14} />
        </button>
      </div>
    </div>
  );

  const kosong = <p className="set-note">{tr('settings.memori.kosong')}</p>;

  return (
    /* No `Section` wrapper here on purpose: that component renders its title
       inside the page's own heading slot, and this page is reached as its own
       section, so the heading below is the page heading. */
    <section className="set-section" data-testid="set-memori">
      <h2 className="set-h2">{tr('settings.memori.judul')}</h2>
      <p className="set-note">{tr('settings.memori.deskripsi')}</p>

      <div className="set-row">
        <div className="set-row-label">
          <span className="set-label" data-testid="memori-jumlah">
            {memuat ? tr('settings.memori.memuat') : tf('settings.memori.jumlah', { n: global.length + proyek.length })}
          </span>
        </div>
        <div className="set-row-control">
          <button
            className="btn btn-sm"
            type="button"
            data-testid="memori-muat-ulang"
            disabled={memuat}
            onClick={() => void muat()}
          >
            {tr('settings.memori.muatUlang')}
          </button>
        </div>
      </div>

      {catatan.length > 0 && (
        <div className="set-note is-warn" data-testid="memori-catatan" role="status">
          <div>{tr('settings.memori.rusak')}</div>
          {/* The notes are the module's own diagnostics, in its own words; kept
              verbatim so they stay searchable in the issue tracker. */}
          <ul>
            {catatan.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="set-h2 set-h2-sub">{tr('settings.memori.lapisGlobal')}</h3>
      {global.length ? global.map(baris) : kosong}

      <h3 className="set-h2 set-h2-sub">{tr('settings.memori.lapisProyek')}</h3>
      {kunci === null ? (
        <p className="set-note" data-testid="memori-tanpa-proyek">
          {tr('settings.memori.tanpaProyek')}
        </p>
      ) : proyek.length ? (
        proyek.map(baris)
      ) : (
        kosong
      )}
    </section>
  );
}
