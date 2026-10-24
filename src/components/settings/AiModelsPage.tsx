/*
 * AI Models, in the shape of the reference product.
 *
 * THE SHAPE (measured from the reference screenshots, not guessed):
 *
 *   Models                                              + Add Model
 *   Model Management
 *   Add or manage available models. Built-in models use the
 *   default stable version. Configure an API to access other models.
 *
 *   ▸ Built-in                                        12
 *   ▸ Custom                                           3
 *
 * The content column is 800px wide and CENTRED. That number is not a preference:
 * measuring the reference gave a 800px column inside a 912px pane, with 53px on
 * the left and 60px on the right — i.e. centred, and the asymmetry is the
 * scrollbar. A left-aligned cap of the same width is what produced the "huge
 * empty strip on the right" complaint: the leftover width all piled up on one
 * side, so a deliberate measure read as a layout bug.
 *
 * WHY THE COLUMN CAPS AT ALL: past ~800px a row of "name — provider — actions"
 * stretches until the three cells no longer relate to each other, and the eye
 * has to travel the full window width to read one line. The cap is released on
 * narrow windows via `min(800px, 100%)`, so nothing is ever squeezed.
 *
 * WHY GROUPS COLLAPSE: the reader arrives either to look at what they have
 * (built-in) or at what they added (custom), rarely both. Counts on the headers
 * mean the answer to "did my key work" is visible without expanding anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useTanya } from '../../lib/tanyaStore';
import {
  PROVIDERS,
  ModelLogo,
  ProviderLogo,
  idProviderNyata,
  providerTersimpanValid,
  type ProviderModel,
} from '../../lib/modelCatalog';
import { HYDRA_MODEL_ID } from '../../lib/hydraModel';
import { AddModelDialog, namaProvider, type BarisModel } from './AiModelsDialog';

interface Baris {
  id: string;
  label: string;
  provider: string;
  ctx?: number;
  tools: boolean;
  vision: boolean;
  note?: string;
  hydra?: boolean;
  /** Came from the provider's own /models answer, not the shipped catalogue. */
  terdeteksi?: boolean;
  /** Present only for rows the reader added, so they can be removed again. */
  custom?: boolean;
}

const POLA_VISION = /multimodal|vision|gambar|image|lihat/i;
const POLA_TOOLS = /agent|agentik|tool|coding|code|penalaran|reason/i;

/**
 * Window size for the table.
 *
 * NOT `fmtCtx`: that one appends "ctx" (redundant under a column headed
 * "Context Size") and prints `1048576` as `1.048576M`, which reads as a
 * precision claim nobody made. One decimal is the most a catalogue figure can
 * honestly support.
 */
function ukuranKonteks(ctx?: number): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) {
    const jt = ctx / 1_000_000;
    return `${Number.isInteger(jt) ? jt : jt.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  return `${Math.round(ctx / 1000)}K`;
}

/**
 * The provider's NAME for a row's subtitle.
 *
 * Rows printed the raw provider id — "gemini", "zai", "openrouter" — which is a
 * key, not something anyone says: the picker and Add Model both call the same
 * thing "Google Gemini". A row that names its provider differently from the
 * dialog it was added from reads as belonging to something else.
 */
function providerNama(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function barisDari(p: string, m: ProviderModel): Baris {
  const note = m.note ?? '';
  return {
    id: m.id,
    label: m.label || m.id,
    provider: p,
    ctx: m.ctx,
    tools: POLA_TOOLS.test(note),
    vision: POLA_VISION.test(note),
    note: note || undefined,
  };
}

/* ── One collapsible group ───────────────────────────────────────────────── */
function Grup({
  label,
  jumlah,
  buka,
  onToggle,
  testid,
  keci,
  aksi,
  children,
}: {
  label: string;
  jumlah: number;
  buka: boolean;
  onToggle: () => void;
  testid: string;
  /** Sub-grup di dalam grup Custom: indentasi lebih rapat, bobot lebih kecil. */
  keci?: boolean;
  /**
   * Tombol di ujung kanan header (mis. hapus provider).
   *
   * `stopPropagation`-nya ada DI DALAM tombol, bukan di sini: klik tombol tidak
   * boleh ikut melipat/membuka grupnya.
   */
  aksi?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={`aim-grup-bar${keci ? ' is-keci' : ''}`}>
        <button
          type="button"
          className={`aim-grup-head${buka ? ' is-buka' : ''}${keci ? ' is-keci' : ''}`}
          data-testid={testid}
          aria-expanded={buka}
          onClick={onToggle}
        >
          <AiIkon name={buka ? 'chev-down' : 'chev-right'} size={11} />
          <span className="aim-grup-nama">{label}</span>
          <span className="aim-grup-jml">{jumlah}</span>
        </button>
        {aksi && <span className="aim-grup-aksi">{aksi}</span>}
      </div>
      {buka && <div className={`aim-grup-isi${keci ? ' is-keci' : ''}`}>{children}</div>}
    </>
  );
}

export default function AiModelsPage() {
  const tr = useT();
  const models = useStore((s) => s.settings.models);
  const apply = useStore((s) => s.applySettings);
  const ui = useSettingsUi();
  const tanya = useTanya((s) => s.tanya);

  const [cari, setCari] = useState('');
  const [bukaBuiltin, setBukaBuiltin] = useState(true);
  const [bukaCustom, setBukaCustom] = useState(true);
  /* Sub-grup per custom provider; tidak ada entri = terbuka. */
  const [bukaSub, setBukaSub] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ awal: BarisModel | null } | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /*
   * Load the key masks ONCE.
   *
   * The dependency used to be `[ui]`, and `ui` is the WHOLE store object — its
   * identity changes on every store write, and `loadKeys()` itself writes to the
   * store. So the effect re-ran, loaded, wrote, re-ran: an endless loop that the
   * reader saw as the page blinking. A ref guard makes it run exactly once, and
   * the action is read off the store at call time rather than captured.
   */
  const sudahMuat = useRef(false);
  useEffect(() => {
    if (sudahMuat.current) return;
    sudahMuat.current = true;
    void useSettingsUi.getState().loadKeys();
  }, []);

  const kustom = models?.custom ?? [];

  /* ── Built-in: everything the catalogue ships ─────────────────────────── */
  const builtin = useMemo(() => {
    const daftar: Baris[] = PROVIDERS.flatMap((p) =>
      (p.models ?? [])
        /* Placeholder rows ("type a name") are prompts, not models. */
        .filter((m) => m.id && m.id !== 'custom-model' && m.id !== 'local-default')
        .map((m) => barisDari(p.id, m)),
    );
    /*
     * HydraFusion is a model in the picker, so it is a row here too — with the
     * capabilities it actually has. It routes to models that carry tools and it
     * can pass images to a vision model, but it is NOT itself a model with a
     * context window, so the ctx cell stays blank instead of borrowing one.
     */
    daftar.unshift({
      id: HYDRA_MODEL_ID,
      label: 'HydraFusion',
      provider: 'hydra',
      tools: true,
      vision: true,
      note: tr('Research preview'),
      hydra: true,
    });
    return daftar;
  }, [tr]);

  /* ── Custom: what the reader added or detected ────────────────────────── */
  const custom: Baris[] = useMemo(
    () =>
      kustom.map((c) => ({
        id: c.id,
        label: c.label || c.id,
        provider: c.provider,
        ctx: c.ctx,
        tools: false,
        vision: false,
        terdeteksi: c.terdeteksi,
        custom: true,
      })),
    [kustom],
  );

  const cocok = useCallback(
    (b: Baris) => {
      const q = cari.trim().toLowerCase();
      if (!q) return true;
      return (
        b.label.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.provider.toLowerCase().includes(q)
      );
    },
    [cari],
  );

  const builtinTampil = useMemo(() => builtin.filter(cocok), [builtin, cocok]);
  const customTampil = useMemo(() => custom.filter(cocok), [custom, cocok]);

  /*
   * Model custom dikelompokkan per provider, bukan dicampur jadi satu daftar.
   * Urutan grup mengikuti urutan kemunculan model, jadi tidak melompat-lompat
   * setiap kali satu model disunting.
   */
  const grupCustom = useMemo(() => {
    const peta = new Map<string, Baris[]>();
    for (const b of customTampil) {
      const isi = peta.get(b.provider);
      if (isi) isi.push(b);
      else peta.set(b.provider, [b]);
    }
    return [...peta.entries()];
  }, [customTampil]);

  /*
   * Provider custom yang MASIH punya key/URL tersimpan tapi nol model tampil.
   *
   * Tanpa ini sebuah gateway yang Refresh-nya gagal (atau memang balas list
   * kosong) lenyap dari halaman — tidak ada baris, tidak ada grup, jadi tidak
   * ada pula cara menghapusnya. Daftar ini memastikan setiap provider yang
   * pernah dibuat tetap terlihat beserta tombol hapusnya, supaya daftar tidak
   * numpuk oleh provider mati.
   */
  const providerKosong = useMemo(() => {
    const tampil = new Set(grupCustom.map(([pid]) => pid));
    const prov = models?.providers ?? {};
    const ids = new Set<string>(Object.keys(prov).filter((k) => k.startsWith('custom')));
    for (const k of ui.keys) if (k.hasKey && k.provider.startsWith('custom-')) ids.add(k.provider);
    for (const c of kustom) ids.add(c.provider);
    return [...ids].filter((pid) => !tampil.has(pid)).sort();
  }, [grupCustom, models, ui.keys, kustom]);

  /*
   * Saving the dialog's result.
   *
   * Add and Edit share one path: a row with the same `provider/id` is REPLACED
   * rather than duplicated, so pressing Add twice on the same model cannot
   * produce two identical lines that then both appear in the picker.
   */
  const simpanBaris = async (rows: BarisModel[]) => {
    const sekarang = useStore.getState().settings.models;
    const lama = sekarang?.custom ?? [];
    const peta = new Map(lama.map((c) => [c.provider + '/' + c.id, c]));
    for (const r of rows) {
      peta.set(r.provider + '/' + r.id, {
        id: r.id,
        label: r.label || r.id,
        provider: r.provider,
        baseUrl: r.baseUrl,
        ctx: r.ctx,
        terdeteksi: r.terdeteksi,
      });
    }
    /*
     * URL gateway IKUT ditulis ke `providers[pid]`, bukan hanya ke baris model.
     *
     * `models.custom[].baseUrl` hanya URL per model. Yang dibaca pemilih model
     * sebagai bukti "provider ini ada dan bisa dikirim" adalah
     * `models.providers[pid].baseUrl` - `baseUrlEfektif` tidak pernah melihat
     * daftar custom. Dulu fungsi ini hanya menulis `custom`, jadi gateway yang
     * baru ditambahkan punya key dan model tetapi tetap dinilai "belum siap":
     * provider-nya tidak muncul di pemilih model walau API key-nya sudah masuk.
     */
    const provLama = sekarang?.providers ?? {};
    const provBaru: Record<string, { baseUrl?: string; fullUrl?: boolean }> = {};
    for (const r of rows) {
      const url = r.baseUrl?.trim();
      if (!url) continue;
      const ada = provLama[r.provider];
      if (ada?.baseUrl === url) continue;
      provBaru[r.provider] = { ...(ada ?? {}), baseUrl: url };
    }

    await apply({
      models: {
        custom: [...peta.values()],
        ...(Object.keys(provBaru).length > 0
          ? { providers: { ...provLama, ...provBaru } }
          : {}),
      },
    });
    setDialog(null);
    setBukaCustom(true);
    setPesan(
      rows.length > 1
        ? tr('Added ') + rows.length + tr(' model(s).')
        : tr('Model added.'),
    );
  };

  const hapusBaris = async (b: Baris) => {
    const sekarang = useStore.getState().settings.models;
    const lama = sekarang?.custom ?? [];
    await apply({
      models: {
        custom: lama.filter((c) => !(c.provider === b.provider && c.id === b.id)),
      },
    });
    setPesan(tr('Model removed.'));
  };

  /*
   * Hapus SATU PROVIDER custom sekaligus isinya, biar daftar tidak numpuk.
   *
   * Yang dibersihkan tiga tempat, bukan cuma `models.custom`:
   *  - `models.custom`   — semua baris model milik provider itu.
   *  - `models.providers` — baseUrl tersimpan; tanpa ini provider "mati" tetap
   *    punya endpoint di settings dan Rust tetap memakainya sebagai fallback.
   *  - API key di `secrets.json` lewat `saveKey(provider, '')` — tanpa ini key
   *    yatim tetap terenkripsi di disk selamanya.
   *
   * Konfirmasi dulu: satu klik salah tidak boleh menghabiskey sebuah gateway
   * yang key-nya mungkin tidak disimpan di tempat lain.
   */
  const hapusProvider = async (pid: string) => {
    const nama = namaProvider(pid) || pid;
    /* In-app dialog instead of `window.confirm`: this wipes the provider's
       models, its saved base URL AND its API key from disk. A WebView2 confirm
       blocks the renderer and renders outside the app's theme. */
    const lanjut = await tanya({
      judul: 'Delete provider ' + nama + '?',
      isi: 'Its models, saved URL and API key will be removed.',
      ok: 'Delete',
      bahaya: true,
    });
    if (!lanjut) return;
    const sekarang = useStore.getState().settings.models;
    const lama = sekarang?.custom ?? [];
    /* PENTING: simpan settings itu deep-merge (RFC 7386). Mengirim objek `prov`
       yang key-nya sudah di-delete TIDAK menghapus apa pun — merge hanya melihat
       key yang ADA di patch. Hapus wajib lewat penanda `null`, yang dibuang
       `mergeDalam` (frontend) dan `deep_merge` (Rust). */
    await apply({ models: { custom: lama.filter((c) => c.provider !== pid), providers: { [pid]: null } } });
    await useSettingsUi.getState().saveKey(pid, '');
    setPesan(tr('Provider removed: ') + nama + '.');
  };

  const aktif = models?.activeProvider ?? '';

  /*
   * Pilihan "Active provider" harus menampilkan provider yang BENAR-BENAR
   * dipakai, bukan nilai mentah `activeProvider`.
   *
   * Dua nilai mentah yang bermasalah:
   *  - `'custom'` adalah slot kosong tanpa URL. Kalau tersimpan, `<select>`
   *    tidak punya `<option>` bernilai itu, jadi browser menampilkan opsi
   *    PERTAMA di daftar - dan pembaca melihat "selalu Gemini" padahal yang
   *    tersimpan adalah slot kosong. Slot itu juga tidak bisa dipilih lagi,
   *    jadi jangan dimasukkan ke daftar pilihan.
   *  - `'auto'` bukan provider nyata; resolver memilih kandidat pertama yang
   *    punya key. Menampilkannya sebagai pilihan berarti pembaca melihat satu
   *    provider padahal nilai tersimpannya lain, dan mengganti ke provider
   *    yang sama tidak menulis apa pun.
   *
   * Karena itu nilai mentah dipetakan ke provider nyata yang setara, dan
   * `aktifTampil` diberi nilai itu supaya `<select>` menunjuk opsi yang ada.
   */
  const idProviderTampil = useCallback(
    (id: string): string => {
      if (!id) return '';
      /*
       * Slot `custom` tanpa nama: tampilkan gateway yang BENAR-BENAR punya URL.
       *
       * Mengembalikan '' di sini tidak membuat dropdown kosong — `<select>`
       * dengan nilai yang tidak punya `<option>` menampilkan opsi PERTAMA, jadi
       * pembaca melihat "Gemini" padahal `activeProvider` berisi 'custom'. Itu
       * juga yang membuat tombol "Custom" terasa tidak bisa ditekan: nilainya
       * ditolak tanpa pesan, dan kotaknya tetap menunjuk provider lain.
       */
      if (id === 'custom') {
        const nyata = providerTersimpanValid('custom', models?.providers);
        return nyata === 'custom' ? 'custom' : nyata;
      }
      if (id !== 'auto') return id;
      const punyaKey = (p: string) => ui.keys.some((k) => k.provider === p && k.hasKey);
      const katalog = PROVIDERS.find((p) => punyaKey(p.id));
      if (katalog) return katalog.id;
      const kustomPertama = (models?.custom ?? []).find((c) => c.provider !== 'custom');
      return kustomPertama?.provider ?? '';
    },
    [ui.keys, models],
  );

  const pilihanAktif = useMemo(() => {
    /*
     * Slot `custom` hanya ikut bila ia benar-benar dikonfigurasi (punya URL).
     *
     * Ia ada di katalog bawaan, jadi dulu SELALU muncul sebagai opsi — padahal
     * memilihnya ditolak `onChange` (slot itu tidak punya endpoint). Opsi yang
     * tidak bisa dipilih adalah bug tampilan: pembaca menekan "Custom", tidak
     * terjadi apa-apa, dan dropdown kembali ke provider lain.
     */
    const customSiap = !!models?.providers?.custom?.baseUrl?.trim();
    const hasil: { id: string; label: string }[] = PROVIDERS.filter(
      (p) => p.id !== 'custom' || customSiap,
    ).map((p) => ({
      id: p.id,
      label: namaProvider(p.id) || p.id,
    }));
    /* Provider custom yang nyata (punya URL atau key) - bukan slot kosong. */
    const tambahan = new Set<string>();
    for (const c of models?.custom ?? []) {
      if (c.provider && c.provider !== 'custom') tambahan.add(c.provider);
    }
    for (const k of ui.keys) {
      /*
       * Hanya id provider yang NYATA. `secrets.json` juga menyimpan slot yang
       * bukan provider (mis. payload login `github`); dulu slot itu muncul
       * sebagai opsi di daftar ini, dan memilihnya membuat setiap kiriman
       * gagal dengan `unknown provider has no base URL`.
       */
      if (
        k.hasKey &&
        k.provider !== 'custom' &&
        !k.provider.startsWith('hydra') &&
        idProviderNyata(k.provider)
      ) {
        tambahan.add(k.provider);
      }
    }
    for (const pid of [...tambahan].sort()) {
      if (hasil.some((h) => h.id === pid)) continue;
      hasil.push({ id: pid, label: namaProvider(pid) || pid });
    }
    return hasil;
  }, [models, ui.keys]);

  const aktifTampil = idProviderTampil(aktif);

  /* ── One row ──────────────────────────────────────────────────────────── */
  const barisJSX = (b: Baris) => {
    const siap = aktif === b.provider;
    return (
      <div
        key={`${b.provider}/${b.id}`}
        className={`aim-baris${siap ? ' is-aktif' : ''}`}
        data-testid="aim-table-row"
        data-model={b.id}
        data-provider={b.provider}
      >
        <span className="aim-logo" aria-hidden="true">
          {/*
            * THE MODEL's mark, not the provider's.
            *
            * This row used to draw `ProviderLogo id={b.provider}`, so every model
            * on OpenRouter showed the OpenRouter logo and every model on
            * SiliconFlow showed the Qwen logo — the row said "DeepSeek" next to a
            * picture that was not DeepSeek's. That is the mismatch the reader
            * kept pointing at.
            *
            * `ModelLogo` derives the family from the model ID (see
            * `modelFamily`), so a model detected from any gateway gets its own
            * brand without per-model configuration.
            *
            * HydraFusion is the exception: it is not a model from any vendor but
            * a router built into Zephyr, so `modelFamily` fell through to the
            * two-letter "HY" monogram. It gets the sparkle instead — the same
            * mark the live line sweeps while a run works — so the router reads as
            * "Zephyr decides", not as a company abbreviated HY.
            */}
          {b.hydra ? <AiIkon name="thought" size={16} /> : <ModelLogo id={b.id} size={16} />}
        </span>

        <span className="aim-baris-teks">
          <span className="aim-nama">
            {b.label}
            {b.terdeteksi && <span className="aim-tag-deteksi">{tr('detected')}</span>}
            {siap && <span className="aim-aktif-chip">{tr('active')}</span>}
          </span>
          <span className="aim-sub-teks">
            {b.hydra
              ? tr('the app picks the model and the workflow per task')
              : providerNama(b.provider)}
            {b.note && !b.hydra ? ' · ' + b.note : ''}
          </span>
        </span>

        <span className="aim-ctx" title={tr('Context size')}>
          {ukuranKonteks(b.ctx)}
        </span>

        <span className="aim-baris-aksi">
          {b.custom ? (
            <button
              type="button"
              className="aim-aksi-btn is-hapus"
              data-testid={`aim-hapus-${b.provider}-${b.id}`}
              onClick={() => void hapusBaris(b)}
            >
              <AiIkon name="trash" size={11} />
              {tr('Delete')}
            </button>
          ) : (
            <button
              type="button"
              className="aim-aksi-btn"
              data-testid={`aim-pakai-${b.provider}-${b.id}`}
              disabled={siap}
              onClick={() => {
                /*
                 * Provider DAN model, bukan provider saja.
                 *
                 * Mengirim `activeProvider` tanpa `model` membuat panel
                 * menyinkronkan provider baru tapi tidak tahu model mana yang
                 * dimaksud, lalu memilih ulang model dari katalog — pilihan
                 * yang baru diklik reader tertimpa.
                 */
                void apply({
                  models: {
                    activeProvider: b.provider,
                    providers: {
                      ...(models?.providers ?? {}),
                      [b.provider]: { ...(models?.providers?.[b.provider] ?? {}), model: b.id },
                    },
                  },
                });
                setPesan(tr('Active model set to ') + b.label + '.');
              }}
            >
              {siap ? tr('In use') : tr('Use')}
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="panel-page" data-testid="aim-page">
      <div className="panel-page-body aim-body" data-testid="aim-page-content">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="aim-head">
          <div>
            <h2 className="panel-page-title" style={{ marginBottom: 2 }}>
              {tr('Models')}
            </h2>
            <p className="aim-sub">
              {tr(
                'Add or manage available models. Built-in models use the default stable version. Configure an API to access other models.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="aim-btn-utama is-utama"
            data-testid="aim-tambah"
            onClick={() => setDialog({ awal: null })}
          >
            <AiIkon name="plus" size={12} /> {tr('Add Model')}
          </button>
        </header>

        {pesan && (
          <p className="aim-pesan" data-testid="aim-pesan" role="status">
            {pesan}
          </p>
        )}

        {/* Search sits under the header, full width — the reference's place. */}
        <input
          className="aim-cari-atas"
          data-testid="aim-cari"
          placeholder={tr('Search models…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />

        {/* ── Built-in ───────────────────────────────────────────────── */}
        <Grup
          label={tr('Built-in')}
          jumlah={builtinTampil.length}
          buka={bukaBuiltin}
          onToggle={() => setBukaBuiltin((v) => !v)}
          testid="aim-grup-builtin"
        >
          {builtinTampil.length === 0 ? (
            <p className="aim-kosong-kecil">{tr('No built-in model matches that search.')}</p>
          ) : (
            builtinTampil.map(barisJSX)
          )}
        </Grup>

        {/* ── Custom: one sub-group per custom provider ────────────────── */}
        {/*
          * Dulu semua model custom digabung di satu grup "Custom", jadi dua
          * gateway berbeda ("geraikita" dan "modelrouter") tampak sebagai satu
          * daftar tanpa pemisah — jumlah per provider tidak terlihat dan model
          * dengan id sama dari dua gateway tidak bisa dibedakan.
          */}
        <Grup
          label={tr('Custom')}
          jumlah={customTampil.length}
          buka={bukaCustom}
          onToggle={() => setBukaCustom((v) => !v)}
          testid="aim-grup-custom"
        >
          {customTampil.length === 0 && providerKosong.length === 0 ? (
            <p className="aim-kosong-kecil" data-testid="aim-custom-kosong">
              {tr('No custom models yet. Press Add Model, paste a key, then Refresh.')}
            </p>
          ) : (
            <>
              {grupCustom.map(([pid, baris]) => (
                <Grup
                  key={pid}
                  keci
                  label={pid === 'custom' ? tr('Custom') : namaProvider(pid) || pid}
                  jumlah={baris.length}
                  buka={bukaSub[pid] ?? true}
                  onToggle={() => setBukaSub((s) => ({ ...s, [pid]: !(s[pid] ?? true) }))}
                  testid={`aim-grup-custom-${pid}`}
                  aksi={
                    <button
                      type="button"
                      className="aim-aksi-btn is-hapus is-keci"
                      data-testid={`aim-hapus-provider-${pid}`}
                      title={tr('Delete provider')}
                      onClick={(e) => {
                        e.stopPropagation();
                        void hapusProvider(pid);
                      }}
                    >
                      <AiIkon name="trash" size={11} />
                      {tr('Delete')}
                    </button>
                  }
                >
                  {baris.map(barisJSX)}
                </Grup>
              ))}
              {providerKosong.map((pid) => (
                <div
                  key={pid}
                  className="aim-grup-bar is-keci is-kosong"
                  data-testid={`aim-provider-kosong-${pid}`}
                >
                  <span className="aim-grup-head is-keci is-mati">
                    <ProviderLogo id={pid} size={12} />
                    <span className="aim-grup-nama">{namaProvider(pid) || pid}</span>
                    <span className="aim-grup-jml">0</span>
                  </span>
                  <span className="aim-grup-aksi">
                    <button
                      type="button"
                      className="aim-aksi-btn is-hapus is-keci"
                      data-testid={`aim-hapus-provider-${pid}`}
                      title={tr('Delete provider')}
                      onClick={() => void hapusProvider(pid)}
                    >
                      <AiIkon name="trash" size={11} />
                      {tr('Delete')}
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}
        </Grup>

        {/* ── Active provider, kept reachable without leaving the page ── */}
        <div className="aim-aktif">
          <span className="aim-aktif-label">{tr('Active provider')}</span>
          <select
            className="aim-pil"
            data-testid="aim-aktif-pil"
            value={aktifTampil}
            onChange={(e) => {
              /*
               * Nilai mentah 'custom' tidak pernah boleh ditulis lagi.
               *
               * Slot itu tidak punya endpoint, jadi menyimpannya berarti
               * "provider aktif" tidak menunjuk apa pun dan pembaca melihat
               * provider pertama di daftar (Gemini). Pilihan kosong ditolak.
               */
              /* Nilai kosong tetap ditolak; 'custom' hanya ada di daftar bila
                 sudah punya URL, jadi ia boleh dipilih seperti provider lain. */
              const v = e.target.value;
              if (!v) return;
              void apply({ models: { activeProvider: v } });
            }}
          >
            {aktifTampil === '' && <option value="">{tr('(not set)')}</option>}
            {pilihanAktif.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {ui.keys.some((k) => k.provider === p.id && k.hasKey) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dialog && (
        <AddModelDialog
          awal={dialog.awal}
          onSimpan={simpanBaris}
          onTutup={() => setDialog(null)}
        />
      )}
    </div>
  );
}
