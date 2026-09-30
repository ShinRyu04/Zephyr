import { useEffect, useMemo, useState } from 'react';
import { useSubAgent, batasParalel } from '../../lib/subagentStore';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import ModelMenu from './ModelMenu';
import { modelDariPrefix } from '../../lib/subagentRoles';
import { PROVIDERS, baseUrlEfektif, findModel, MODEL_BY_ID } from '../../lib/modelCatalog';

export default function SubAgentBar({ selaluTerbuka = false }: { selaluTerbuka?: boolean }) {
  const tr = useT();

  const adaHasil = useSubAgent((s) => s.agents.length > 0);

  /*
   * The form folds itself in the tab once a batch exists.
   *
   * It is 125px and the bottom panel is 231px, so an open form pushed the agent
   * rows below the fold — and the rows are the one thing the tab exists to show.
   *
   * `bukaManual` holds the user's own choice and starts null, meaning "no choice
   * yet, follow the results". A useState initializer cannot do this: it runs
   * once, before any agents exist, so the form would stay open forever. Deriving
   * the value means the fold reacts to the first batch appearing.
   */
  const [bukaManual, setBukaManual] = useState<boolean | null>(null);
  const buka = bukaManual ?? (selaluTerbuka && !adaHasil);
  const [teks, setTeks] = useState('');
  const [modelPerBaris, setModelPerBaris] = useState<Record<number, string>>({});
  const [barisMenu, setBarisMenu] = useState<number | null>(null);
  /* Where to draw the per-row model menu; measured when it opens. */
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const jalankan = useSubAgent((s) => s.jalankan);
  const sibuk = useSubAgent((s) => s.sibuk);

  const agentBusy = useAi((s) => s.agentBusy);
  const pending = useAi((s) => s.pending);
  const aiModel = useAi((s) => s.model);
  const aiProvider = useAi((s) => s.provider);

  const maks = batasParalel();
  const tugas = teks
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  // The batch model is chosen ONCE, in the Subagents tab header
  // (ModelSelector target="subagent", which shows "Follow chat" when it is
  // empty). Each LINE can still override it, but through a badge on the row
  // rather than a dropdown on every line: N lines used to mean N <select>
  // elements, which was noisy and a second, conflicting place to set the same
  // thing. A badge is also visible at a glance, so a mixed batch is obvious.
  const baris = useMemo(
    () =>
      tugas.map((t) => {
        const { model, provider, sisa } = modelDariPrefix(t);
        return { mentah: t, teks: sisa, tag: model ? { model, provider } : null };
      }),
    [teks],
  );

  // The batch model is the one the tab header picked: settings.subagent.model
  // when it is set, otherwise the chat model (that is what "Follow chat" means).
  // The header stores a bare model id, so the provider is recovered from the
  // catalogue; without that, findModel would fall back to `custom` and print the
  // raw id instead of "Gemini 3.7 Flash".
  const subModel = useStore((s) => s.settings.subagent?.model ?? '');
  const subProvider = useStore((s) => s.settings.subagent?.provider ?? '');
  const ikutChat = subModel.trim() === '';
  const labelBatch = (() => {
    if (ikutChat) return findModel(aiModel, aiProvider).label;
    const slash = subModel.indexOf('/');
    const id = slash > 0 ? subModel.slice(slash + 1) : subModel;
    const prov =
      subProvider ||
      (slash > 0 ? subModel.slice(0, slash) : '') ||
      MODEL_BY_ID.get(id)?.provider;
    return findModel(id, prov || undefined).label;
  })();

  // Same rule the header picker uses: only a provider that can actually send is
  // offered, so a row can never be pointed at a setup that would fail.
  const keys = useAi((s) => s.keys);
  const baseUrlOv = useStore((s) => s.settings.models.providers);
  const remoteUi = useSettingsUi((s) => s.remoteModels);
  const fetchingModels = useSettingsUi((s) => s.fetchingModels);

  const providerSiap = useMemo(
    () =>
      PROVIDERS.filter(
        (p) =>
          keys.some((k) => k.provider === p.id && k.hasKey) &&
          baseUrlEfektif(p.id, baseUrlOv).length > 0,
      ),
    [keys, baseUrlOv],
  );

  const opsiModel = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const p of providerSiap) {
      const idStatis = new Set(p.models.map((m) => m.id));
      for (const m of p.models) out.push({ value: `${p.id}/${m.id}`, label: `${p.label}: ${m.label}` });
      /*
       * Provider ids the catalogue has never heard of.
       *
       * Without these the list showed only the shipped ids, and for a gateway
       * that serves its own names the picker offered a single placeholder row.
       */
      for (const id of remoteUi[p.id] ?? []) {
        if (!idStatis.has(id)) out.push({ value: `${p.id}/${id}`, label: `${p.label}: ${id}` });
      }
    }
    return out;
    /*
     * `providerSiap` and `remoteUi`, not `keys`/`baseUrlOv`.
     *
     * The list is derived from both, so depending on the inputs it was already
     * derived from meant the memo never recomputed when the live models
     * arrived: the fetch succeeded, the store filled, and the menu still showed
     * the static catalogue alone.
     */
  }, [providerSiap, remoteUi]);
  /* Kept so the batch label can name the model a row falls back to. */
  void opsiModel;

  /*
   * Fetch the live list when the form opens.
   *
   * One request per provider that can send, skipped once the list is known;
   * without it the picker only had the static catalogue and a custom gateway
   * showed a single row.
   */
  useEffect(() => {
    if (!buka || fetchingModels) return;
    for (const p of providerSiap) {
      if ((remoteUi[p.id]?.length ?? 0) > 0) continue;
      void useSettingsUi.getState().refreshRemoteModels(p.id);
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, providerSiap]);

  // A line resolves to: its own [model:...] tag, then the batch pick on this
  // row, then the batch default from the header.
  const modelBaris = (i: number) => {
    const tag = baris[i]?.tag;
    const pilih = modelPerBaris[i];
    const nilai = pilih ?? (tag ? `${tag.provider ?? ''}/${tag.model}` : '');
    if (!nilai) return null;
    const slash = nilai.indexOf('/');
    const id = slash > 0 ? nilai.slice(slash + 1) : nilai;
    const prov = slash > 0 ? nilai.slice(0, slash) : '';
    return findModel(id, prov || MODEL_BY_ID.get(id)?.provider).label;
  };

  const terlalu = tugas.length > maks;
  const bisaJalan = tugas.length > 0 && !terlalu && !sibuk && !agentBusy && !pending;

  const go = async () => {
    if (!bisaJalan) return;
    // A per-row pick becomes a [model:provider/id] tag on that task line, which
    // is where the batch receives it.
    const denganModel = tugas.map((t, i) => {
      const m = modelPerBaris[i];
      return m ? `[model:${m}] ${t}` : t;
    });
    await jalankan(denganModel);
    setTeks('');
    setModelPerBaris({});
    setBarisMenu(null);
    // The form stays open so the next batch can be queued right away;
    // closing it would force one extra click every time.
  };

  /*
   * The button replaces the form in two cases: the user closed the popover in
   * chat, or the tab folded it because a batch already exists. Both mean the
   * same thing here — show the one-line opener.
   */
  if (!buka) {
    return (
      <button
        className="sub-open"
        data-testid="sub-open"
        title={tr('Run several tasks at once (in parallel)')}
        onClick={() => setBukaManual(true)}
      >
        {tr('Parallel tasks')}
        <span className="sub-open-maks">max {maks}</span>
      </button>
    );
  }

  return (
    <div className="sub-form" data-testid="sub-form">
      <div className="sub-form-head">
        <span className="sub-form-judul">{tr('Parallel tasks')}</span>
        <span className="sub-form-hint">{tr('One line = one subagent')}</span>
        {!selaluTerbuka && (
          <button
            className="sub-form-close"
            data-testid="sub-close"
            title={tr('Close')}
            onClick={() => setBukaManual(false)}
          >
            ✕
          </button>
        )}
      </div>
      <textarea
        className="sub-input"
        data-testid="sub-input"
        /*
         * Two rows minimum, growing with the task list (capped at four).
         *
         * The floor is two because the placeholder itself is two lines: at
         * rows={1} the second line was clipped mid-glyph and read as a broken
         * input. Above two, the box tracks the number of tasks typed.
         */
        rows={selaluTerbuka ? Math.min(4, Math.max(2, tugas.length)) : 2}
        value={teks}
        placeholder={tr('Find usages of function X\nCheck for bugs in module Y')}
        title={tr('Enter sends · Shift+Enter for a new line')}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {

          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void go();
          }
        }}
      />
      {baris.length > 0 && (
        <ul className="sub-daftar" data-testid="sub-daftar">
          {baris.map((b, i) => {
            const label = modelBaris(i);
            const adaTag = !!b.tag || !!modelPerBaris[i];
            return (
              <li
                className="sub-daftar-baris"
                key={`${i}-${b.mentah.slice(0, 12)}`}
                data-testid={`sub-daftar-${i}`}
              >
                <span className="sub-daftar-caret" aria-hidden="true">
                  ▸
                </span>
                <span className="sub-daftar-teks" title={b.mentah}>
                  {b.teks.length > 48 ? `${b.teks.slice(0, 48)}…` : b.teks}
                </span>
                <button
                  className={`sub-daftar-model${adaTag ? ' is-override' : ''}`}
                  data-testid={`sub-daftar-model-${i}`}
                  data-override={adaTag ? '1' : '0'}
                  title={tr('Model the subagent uses. Follow chat = same as the conversation.')}
                  onClick={(e) => {
                    if (barisMenu === i) {
                      setBarisMenu(null);
                      return;
                    }
                    /*
                     * Measure before opening.
                     *
                     * The menu is `position: fixed` so the row's scroll
                     * container cannot clip it, which means it no longer
                     * inherits its position — the button's rect is read here
                     * and used as inline coordinates. `bottom` is kept as well
                     * so a button near the window's lower edge grows upward.
                     */
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuRect({
                      /* Right-aligned to the button, so the menu does not run
                         past the panel's right edge. */
                      left: Math.max(8, r.right - 280),
                      top: r.bottom + 4,
                      bottom: window.innerHeight - r.top + 4,
                    });
                    setBarisMenu(i);
                  }}
                >
                  {label ?? tr('Follow chat')}
                </button>
                {barisMenu === i && menuRect && (
                  <ModelMenu
                    rect={menuRect}
                    nilai={{
                      provider: modelPerBaris[i]?.split('/')[0] ?? b.tag?.provider ?? '',
                      model: modelPerBaris[i]?.split('/').slice(1).join('/') ?? b.tag?.model ?? '',
                    }}
                    pilih={(v) => {
                      if (!v.model) {
                        /* "Follow chat": drop the per-row override entirely, so
                           the row falls back to the batch pick. */
                        setModelPerBaris((prev) => {
                          const next = { ...prev };
                          delete next[i];
                          return next;
                        });
                        return;
                      }
                      setModelPerBaris((prev) => ({ ...prev, [i]: `${v.provider}/${v.model}` }));
                    }}
                    tutup={() => setBarisMenu(null)}
                    pfx={`sub-daftar-menu-${i}`}
                    ikutChat={tr('Follow chat')}
                    chatLabel={labelBatch}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="sub-form-foot">
        <span className={`sub-count${terlalu ? ' is-err' : ''}`}>
          {tugas.length}/{maks} {tr('subagent')}
        </span>
        <span className="sub-spacer" />
        {/*
         * The model picker lives in the tab header only.
         *
         * It used to be here as well, and the header copy was added when the
         * form started folding itself — so the tab showed two identical
         * "Follow chat" controls. The header one is the survivor: the form can
         * be collapsed, the header cannot.
         */}
        {/*
         * Round send button, same shape and states as the chat's.
         *
         * A wide "Run" label made the form footer read as a toolbar with two
         * competing buttons; the chat already taught the user that this action
         * is the round one on the right. Same icon, same size, same disabled
         * treatment, so the two panels behave alike.
         */}
        <button
          className="ai-round-btn is-send sub-run-btn"
          data-testid="sub-run"
          disabled={!bisaJalan}
          title={sibuk ? tr('Running…') : tr('Run')}
          aria-label={sibuk ? tr('Running…') : tr('Run')}
          onClick={() => void go()}
        >
          {sibuk ? <AiIkon name="stop" size={13} /> : <AiIkon name="send" size={14} />}
        </button>
      </div>
    </div>
  );
}
