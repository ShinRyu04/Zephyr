import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { ALL_MODELS, PROVIDERS, PROVIDER_BY_ID, baseUrlEfektif } from '../../lib/modelCatalog';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { listModels } from '../../lib/commands';
import {
  ALAT,
  kosongkanSubagent,
  useSubagentCustom,
  type AlatId,
  type SubagentCustom,
} from '../../lib/subagentCustom';
import AlatIkon from './AlatIkon';
import { IKON_SUBAGENT, ikonSubagent, IKON_LABEL } from '../../lib/subagentIcons';

/*
 * Editor for one custom sub-agent. Follows the app's dialog conventions
 * (.modal-backdrop / .modal / .modal-actions, focus trap, Escape to close) so
 * it behaves like every other dialog in Zephyr.
 *
 * The tool picker is a row of toggleable chips rather than a multi-select: the
 * list is short, the choice is read-only, and a chip shows its state without
 * opening anything. Write tools are absent on purpose — a custom worker runs
 * unsupervised, so the picker only offers reads. The one writing worker stays
 * the built-in "kerja" role, which is gated by the allowWrite setting.
 */

interface Props {
  /** Existing definition to edit, or null for a new one. */
  awal: SubagentCustom | null;
}

export default function SubagentCustomModal({ awal }: Props) {
  const tr = useT();
  const tutup = useSubagentCustom((s) => s.tutup);
  const simpan = useSubagentCustom((s) => s.simpan);
  const hapus = useSubagentCustom((s) => s.hapus);

  const [nama, setNama] = useState(awal?.nama ?? '');
  const [deskripsi, setDeskripsi] = useState(awal?.deskripsi ?? '');
  const [alat, setAlat] = useState<AlatId[]>(awal?.alat ?? kosongkanSubagent().alat);
  const [prompt, setPrompt] = useState(awal?.prompt ?? '');
  const [model, setModel] = useState(awal?.model ?? '');
  const [ikon, setIkon] = useState(awal?.ikon ?? 'umum');
  const [menuBuka, setMenuBuka] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const trapRef = useFocusTrap<HTMLDivElement>({ aktif: true, onEscape: () => tutup() });

  /*
   * Models come from the same static catalog the model picker uses, so a worker
   * can only be pinned to something the app can actually reach. The first entry
   * is always "same as chat", which is the default and needs no key of its own.
   *
   * The list is filtered the same way the chat picker filters it: a provider is
   * offered only when it has a key AND an endpoint. Before this, every provider
   * in the catalog was listed, so a worker could be pinned to a provider the app
   * has no key for and would fail at run time with a 401 — the failure looked
   * like a subagent bug, not a missing key.
   *
   * The catalog is a module constant, not a store value: reading it through a
   * selector that built a new array each render sent zustand's `===` check into
   * an infinite update loop.
   */
  const keys = useAi((s) => s.keys);
  const baseUrlOv = useStore((s) => s.settings.models.providers);
  const daftar = useSubagentCustom((s) => s.daftar);
  const perbarui = useSubagentCustom((s) => s.simpan);
  /*
   * Models the provider reports, pulled once when the dialog opens.
   *
   * The static catalogue only knows the placeholder ids (`custom-model`), so a
   * worker could not be pinned to a real one until the user had opened the chat
   * picker at least once — the list here was two entries long while the provider
   * served eighteen. Fetching on open fixes that without a second click.
   *
   * A failure is not surfaced: offline or a bad key just means the static list
   * is used, which is the behaviour before this existed.
   */
  const [live, setLive] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let batal = false;
    const muat = async () => {
      const siap = PROVIDERS.filter(
        (p) =>
          keys.some((k) => k.provider === p.id && k.hasKey) &&
          baseUrlEfektif(p.id, baseUrlOv).length > 0,
      );
      const hasil: Record<string, string[]> = {};
      for (const p of siap) {
        try {
          const b = baseUrlOv[p.id]?.baseUrl || p.baseUrl || undefined;
          const ids = await listModels(p.id, b);
          if (ids.length > 0) hasil[p.id] = ids;
        } catch {
          /* provider offline: keep the static list */
        }
      }
      if (!batal && Object.keys(hasil).length > 0) setLive(hasil);
    };
    void muat();
    return () => {
      batal = true;
    };
    // The list is a snapshot for this dialog: re-fetching on every keystroke in
    // the name field would hammer the provider for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opsiModel = useMemo(() => {
    const siap = PROVIDERS.filter(
      (p) =>
        keys.some((k) => k.provider === p.id && k.hasKey) &&
        baseUrlEfektif(p.id, baseUrlOv).length > 0,
    );
    const boleh = new Set(siap.map((p) => p.id));

    // Static catalogue first, then anything the provider reports that the
    // catalogue has never heard of. The placeholder ids (`custom-model`) are
    // dropped once a live list exists: pinning a worker to "type a model name"
    // is never what the user means.
    const statis = ALL_MODELS.filter((m) => boleh.has(m.provider));
    const idStatis = new Set(statis.map((m) => m.id));
    const hidup = Object.entries(live).flatMap(([p, ids]) =>
      ids
        .filter((id) => !idStatis.has(id))
        .map((id) => ({
          id,
          label: `${PROVIDER_BY_ID.get(p)?.label ?? p} · ${id}`,
          provider: p,
        })),
    );

    return [
      { id: '', label: 'Sama seperti chat (bawaan)', provider: '' },
      ...statis.map((m) => ({
        id: m.id,
        label: `${m.providerLabel} · ${m.label}`,
        provider: m.provider,
      })),
      ...hidup,
    ];
  }, [keys, baseUrlOv, live]);

  /*
   * Heal agents saved against the placeholder id.
   *
   * Before the picker fetched live models, `custom-model` was the only row
   * available for an OpenAI-compatible provider, so every agent created then
   * was pinned to it — an id the provider does not serve, which makes the run
   * fail with a "model not found" the user cannot explain. Once the real list
   * arrives, re-point those agents at the provider's first live model and write
   * it back, so the fix persists instead of being re-derived on every open.
   */
  useEffect(() => {
    const idsHidup = Object.values(live).flat();
    if (idsHidup.length === 0) return;
    const rusak = daftar.filter((a) => a.model === 'custom-model');
    if (rusak.length === 0) return;
    for (const a of rusak) {
      const ganti = a.provider ? live[a.provider]?.[0] : idsHidup[0];
      if (ganti) void perbarui({ ...a, model: ganti });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, daftar]);

  /* The label shown on the closed button: the chosen model, or the default. */
  const labelModel = useMemo(() => {
    if (!model) return 'Sama seperti chat (bawaan)';
    const m = opsiModel.find((x) => (x.id || '') === model);
    /*
     * Show the stored id even when it is not in the fetched list.
     *
     * Agents created before the picker fetched live models were saved with the
     * catalogue placeholder (`custom-model`), and that id is absent once the
     * real list arrives — so `find` missed and the button fell back to "type the
     * model name", hiding what was actually stored. Echoing the id keeps the
     * button truthful whatever the list contains.
     */
    return m?.label ?? model;
  }, [opsiModel, model]);

  /* Click outside / Escape closes the model menu, like the chat picker. */
  useEffect(() => {
    if (!menuBuka) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuBuka(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuBuka(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuBuka]);

  const namaTerpakai = useSubagentCustom((s) =>
    s.daftar.some((x) => x.nama.toLowerCase() === nama.trim().toLowerCase() && x.id !== awal?.id),
  );
  const bisaSimpan = nama.trim().length > 0 && alat.length > 0 && !namaTerpakai;

  const toggleAlat = (id: AlatId) => {
    setAlat((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  };

  const kirim = async () => {
    if (!bisaSimpan || sibuk) return;
    setSibuk(true);
    const pilih = opsiModel.find((m) => m.id === model);
    await simpan({
      nama: nama.trim(),
      deskripsi: deskripsi.trim(),
      alat,
      prompt: prompt.trim(),
      model,
      provider: pilih?.provider ?? '',
      aktif: awal?.aktif ?? true,
      ikon,
    });
    setSibuk(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutup();
      // Ctrl+Enter saves from anywhere in the dialog, including the textarea,
      // where plain Enter has to stay a newline.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void kirim();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => tutup()}>
      <div
        className="modal subagent-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-title"
        data-testid="subagent-custom-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="subagent-head">
          <h2 className="modal-title" id="sc-title">
            {awal ? tr('Ubah sub-agent') : tr('Sub-agent baru')}
          </h2>
          <button
            className="btn btn-icon"
            data-testid="sc-tutup"
            aria-label={tr('Subagent: tutup')}
            onClick={() => tutup()}
          >
            ✕
          </button>
        </div>

        <div className="modal-body subagent-form">
          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: nama')}</span>
            <input
              className="input"
              data-testid="sc-nama"
              value={nama}
              autoFocus
              placeholder={tr('mis. Pemeta tes')}
              onChange={(e) => setNama(e.target.value)}
            />
            {namaTerpakai && (
              <span className="subagent-warn" data-testid="sc-nama-bentrok">
                {tr('Nama itu sudah dipakai sub-agent lain.')}
              </span>
            )}
          </label>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: deskripsi')}</span>
            <input
              className="input"
              data-testid="sc-deskripsi"
              value={deskripsi}
              placeholder={tr('Satu baris — AI membacanya untuk memutuskan kapan mendelegasikan ke sini')}
              onChange={(e) => setDeskripsi(e.target.value)}
            />
          </label>

          <div className="subagent-field">
            <span className="subagent-label">{tr('Subagent: alat')}</span>
            <div className="subagent-chips" data-testid="sc-alat">
              {ALAT.map((a) => {
                const aktif = alat.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`subagent-chip${aktif ? ' is-on' : ''}`}
                    data-testid={`sc-alat-${a.id}`}
                    aria-pressed={aktif}
                    title={tr(a.hint)}
                    onClick={() => toggleAlat(a.id)}
                  >
                    <span className="subagent-chip-ikon" aria-hidden="true">
                      <AlatIkon id={a.id} />
                    </span>
                    {tr(a.label)}
                    {/*
                     * A check mark, not just a colour shift: the on/off state
                     * has to survive a monochrome screen and a colour-blind
                     * reader. The icon slot keeps its width so the row does not
                     * reflow when a chip is toggled.
                     */}
                    {aktif && (
                      <span className="subagent-chip-tanda" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.2 8.4l3.2 3.2 6.4-7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span className="subagent-hint">{tr('Hanya baca. Pilih minimal satu.')}</span>
          </div>

          <div className="subagent-field">
            <span className="subagent-label">{tr('Subagent: ikon')}</span>
            <div className="subagent-ikon-pilih" data-testid="sc-ikon" role="radiogroup">
              {IKON_SUBAGENT.map((ik) => {
                const dipilih = ikon === ik.id;
                return (
                  <button
                    key={ik.id}
                    type="button"
                    role="radio"
                    aria-checked={dipilih}
                    className={`subagent-ikon-btn${dipilih ? ' is-on' : ''}`}
                    data-testid={`sc-ikon-${ik.id}`}
                    data-ikon={ik.id}
                    title={tr(IKON_LABEL[ik.id])}
                    onClick={() => setIkon(ik.id)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={ikonSubagent(ik.id).d} />
                    </svg>
                  </button>
                );
              })}
            </div>
            <span className="subagent-hint">
              {tr(IKON_LABEL[ikon as keyof typeof IKON_LABEL] ?? IKON_LABEL.umum)}
            </span>
          </div>

          <label className="subagent-field">
            <span className="subagent-label">{tr('Subagent: system prompt')}</span>
            <textarea
              className="input subagent-prompt"
              data-testid="sc-prompt"
              value={prompt}
              rows={10}
              spellCheck={false}
              placeholder={tr('Persona dan aturan untuk pekerja ini. Ia berjalan dengan riwayat bersih dan hanya alat di atas.')}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>

          <div className="subagent-field">
            <span className="subagent-label">{tr('Subagent: model')}</span>
            {/*
              * A custom dropdown, not a <select>.
              *
              * The native control renders one flat list of twenty-odd entries
              * with no way to show which provider each one belongs to and no
              * room for the model's context size — and on Windows the popup is
              * drawn by the OS at its own width, so the ids were clipped. This
              * is the same list the chat picker draws: grouped by provider, with
              * the provider's own mark.
              */}
            <div className="sc-model-wrap" ref={menuRef}>
              <button
                type="button"
                className="input sc-model-btn"
                data-testid="sc-model"
                aria-haspopup="listbox"
                aria-expanded={menuBuka}
                onClick={() => setMenuBuka((v) => !v)}
              >
                <span className="sc-model-teks">{labelModel}</span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={menuBuka ? 'M4 9.5l4-3.5 4 3.5' : 'M4 6.5l4 3.5 4-3.5'} />
                </svg>
              </button>

              {menuBuka && (
                <div className="sc-model-menu" data-testid="sc-model-menu" role="listbox">
                  {opsiModel.length === 1 && (
                    <p className="sc-model-kosong">{tr('Belum ada provider dengan API key. Isi di Settings → AI Models.')}</p>
                  )}
                  {opsiModel.map((m) => (
                    <button
                      key={m.id || 'chat'}
                      type="button"
                      role="option"
                      aria-selected={(m.id || '') === (model || '')}
                      className={`sc-model-item${(m.id || '') === (model || '') ? ' is-on' : ''}`}
                      data-testid={`sc-model-${m.id || 'chat'}`}
                      data-provider={m.provider || ''}
                      onClick={() => {
                        setModel(m.id);
                        setMenuBuka(false);
                      }}
                    >
                      <span className="sc-model-nama">{m.id ? m.label : tr('Sama seperti chat (bawaan)')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="subagent-hint">
              {tr('Jalankan pekerja ini di model sendiri (mis. yang lebih murah untuk pencarian besar). Bawaan = sama seperti chat.')}
            </span>
          </div>
        </div>

        <div className="modal-actions">
          {awal && (
            <button
              className="btn btn-danger"
              data-testid="sc-hapus"
              onClick={() => void hapus(awal.id)}
            >
              {tr('Subagent: hapus')}
            </button>
          )}
          <span className="subagent-spacer" />
          <button className="btn" data-testid="sc-batal" onClick={() => tutup()}>
            {tr('Subagent: batal')}
          </button>
          <button
            className="btn btn-primary"
            data-testid="sc-simpan"
            disabled={!bisaSimpan || sibuk}
            onClick={() => void kirim()}
          >
            {tr('Subagent: simpan')}
          </button>
        </div>
      </div>
    </div>
  );
}
