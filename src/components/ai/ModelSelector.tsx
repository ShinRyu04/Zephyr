import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { bukaPanel } from '../../lib/bukaPanel';
import { useT } from '../../lib/i18n';
import {
  baseUrlEfektif,
  ALL_MODELS,
  deteksiKemampuan,
  fmtCtx,
  findModel,
  isPlaceholderModel,
  MODEL_BY_ID,
  modelTersedia,
  PROVIDERS,
  PROVIDER_BY_ID,
  ProviderLogo,
  ModelLogo,
} from '../../lib/modelCatalog';
import { HYDRA_MODEL_ID, pilihHydra } from '../../lib/hydraModel';
import { namaProvider } from '../settings/AiModelsDialog';
import ZephyrLogo from '../shell/ZephyrLogo';
import AiIkon from './AiIkon';
import ModelDetailPanel from './ModelDetailPanel';

const LS_SAVED = 'zephyr.ai.custommodels.v1';

function loadSaved(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(LS_SAVED);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export type TargetModel = 'chat' | 'subagent';


export default function ModelSelector({ target = 'chat' }: { target?: TargetModel } = {}) {
  const tr = useT();
  const aiModel = useAi((s) => s.model);
  const aiProvider = useAi((s) => s.provider);
  const openAi = useAi((s) => s.modelMenuOpen);
  const keys = useAi((s) => s.keys);
  /* Slot yang isinya ada di `secrets.json` — bukti langsung, tidak bisa basi
     selama `disk` baru dibaca. Lihat `apiKeyDisk.ts`. */
  const disk = useAi((s) => s.disk);
  const setOpenAi = useAi((s) => s.setModelMenuOpen);
  const setAiModel = useAi((s) => s.setModel);
  const applySettings = useStore((s) => s.applySettings);
  const subCfg = useStore((s) => s.settings.subagent);
  /*
   * HydraFusion is SELECTED, not enabled. Reading the model selection (not the
   * `hydrafusion.enabled` flag) is what keeps the picker, the chip and the send
   * paths telling the reader the same story.
   */
  const hydraDipilih = !target || target === 'chat' ? pilihHydra(aiModel) : false;
  const wrap = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const sub = target === 'subagent';
  const pfx = sub ? 'sub' : 'ai';

  const [openSub, setOpenSub] = useState(false);
  const open = sub ? openSub : openAi;
  const setOpen = sub ? setOpenSub : setOpenAi;

  const model = sub ? (subCfg?.model ?? '') : aiModel;
  const provider = sub ? (subCfg?.provider ?? '') : aiProvider;

  const ikutChat = sub && !model.trim();

  const [cari, setCari] = useState('');
  const [saved] = useState<Record<string, string[]>>(loadSaved);

  const [remote, setRemote] = useState<Record<string, string[]>>({});
  /*
   * The full metadata each provider reported, keyed by provider then model id.
   *
   * Read from the SHARED store rather than kept here: pressing Refresh in
   * Settings fills the same map, so a list pulled there is already annotated
   * when the picker opens. Holding a private copy would mean refreshing in one
   * place and seeing nothing in the other.
   */
  const laporan = useSettingsUi((s) => s.remoteInfo);
  /*
   * Fetching is tracked PER PROVIDER, not as one boolean.
   *
   * A single `fetching` flag guarded the entry of `loadRemote` (`if (fetching)
   * return`), while Refresh walked the providers in a loop. The first call set
   * the flag, every later provider in the same loop returned immediately, and a
   * second press of the button did nothing at all because the flag was still
   * the one the loop had set. That is the reported "tombol refresh ga
   * berfungsi" — both automatic (menu open) and manual.
   */
  const [fetching, setFetching] = useState<Record<string, true>>({});
  const sedangAmbil = Object.keys(fetching).length > 0;

  /*
   * Which model the detail card is describing — and WHERE that row is.
   *
   * The card follows the pointer: it appears beside the row being pointed at,
   * not beside the whole menu. Storing the row's own rect (not just its id) is
   * what makes that possible; the id alone told us what to describe but not
   * where to draw it, so the card sat in a fixed spot and looked disconnected
   * from the row under the cursor.
   */
  const [intip, setIntip] = useState<{
    id: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);

  /* Called by every model row on hover/focus. */
  const tunjuk = (id: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setIntip({ id, top: b.top, bottom: b.bottom, left: b.left, right: b.right });
  };

  const baseUrlOv = useStore((s) => s.settings.models.providers);

  const efektif = ikutChat ? findModel(aiModel, aiProvider) : findModel(model, provider || undefined);
  const adaKey = (id: string) => keys.some((k) => k.provider === id && k.hasKey);

  // A stored key is not enough on its own: without an endpoint there is nowhere
  // to send the request. `custom` ships an empty base URL on purpose, so before
  // this it was listed - and badged "key saved" - while every send failed.
  const baseUrl = baseUrlEfektif(efektif.provider, baseUrlOv);

  // Same rule for the picker: a provider is offered only when it can actually
  // send - key present AND an endpoint to send to.
  //
  // `custom-*` providers (multi-gateway, fase multi-provider) are NOT in the
  // PROVIDERS catalogue, so they are appended here from the stored key list.
  // Without this, a model added under "geraikita" never appears in the picker
  // at all - the key exists, the endpoint exists, but no group is built.
  const providerSiap = useMemo(() => {
    /*
     * BUG: provider "hilang" lalu muncul pesan "belum ada API key" padahal
     * key-nya tersimpan.
     *
     * `katalog` dulu menuntut `adaKey(p.id)`, dan `adaKey` membaca array `keys`
     * milik aiStore. Array itu diisi `getPublicModels`, yang MENGURUTKAN ulang
     * dan menambahkan entri tanpa key. Kalau satu entri gagal didekripsi,
     * `has_key` menjadi false dan provider itu lenyap dari picker - persis
     * keluhan "disuruh masukin API key" setelah Refresh.
     *
     * Sekarang provider dianggap siap bila SALAH SATU dari dua bukti ada:
     *  - `keys` bilang hasKey, ATAU
     *  - settings menyimpan baseUrl untuk provider itu (artinya reader sudah
     *    mengonfigurasinya; key-nya bisa saja sedang tidak terbaca sementara).
     * Provider yang benar-benar belum dikonfigurasi tetap tersembunyi, jadi
     * pesan "belum ada API key" masih jujur untuk kasus itu.
     */
    const punyaUrl = (id: string) => baseUrlEfektif(id, baseUrlOv).length > 0;
    const siapPakai = (id: string) => adaKey(id) || punyaUrl(id) || disk.has(id);

    const katalog = PROVIDERS.filter((p) => siapPakai(p.id) && punyaUrl(p.id));
    /*
     * `custom-*` dikumpulkan dari DUA sumber, bukan hanya `keys`.
     *
     * Dulu hanya dari `keys`. Kalau `getPublicModels` tidak memuat sebuah
     * gateway (key gagal didekripsi, atau entri belum terbaca), gateway itu
     * lenyap dari picker walaupun URL dan modelnya masih tersimpan di
     * settings - lalu reader melihat "belum ada API key" untuk provider yang
     * jelas-jelas sudah dikonfigurasi. Sekarang settings.models.providers dan
     * settings.models.custom ikut menjadi bukti keberadaannya.
     */
    const idKustom = new Set<string>();
    for (const k of keys) if (k.provider.startsWith('custom-')) idKustom.add(k.provider);
    for (const id of Object.keys(baseUrlOv ?? {})) if (id.startsWith('custom-')) idKustom.add(id);
    for (const c of useStore.getState().settings.models.custom ?? []) {
      if (c.provider.startsWith('custom-')) idKustom.add(c.provider);
    }
    const kustom = [...idKustom]
      .filter((id) => siapPakai(id) && punyaUrl(id))
      .sort()
      .map((id) => ({
        id,
        label: namaProvider(id) || id,
        freeText: true,
        models: [] as never[],
      }));
    return [...katalog, ...kustom];
  }, [keys, baseUrlOv, disk]);
  /*
   * The list follows the ACTIVE provider, not every provider that has a key.
   *
   * `providerSiap` answers "which providers could send" - it was also used as
   * the list of groups, so choosing a custom active provider still showed the
   * whole built-in catalogue above it, and clicking one of those rows silently
   * moved `activeProvider` away from the reader's choice. The picker should show
   * the models of the provider that is actually selected.
   *
   * Two deliberate exceptions:
   *  - the catalogue provider that owns the CURRENT selection is always kept, so
   *    the chip can still name what is selected even if it is not "ready";
   *  - sub-agent rows (`ikutChat`) keep the old behaviour: a per-row override is
   *    a one-off choice and needs to reach every provider, not just the chat's.
   */
  const penyediaTampil = useMemo(() => {
    if (ikutChat) return providerSiap;
    /*
     * `provider` is the surface's selection (chat or sub-agent); `efektif` is
     * what will really send after `auto` is resolved, so it wins when set.
     */
    const fokus = (efektif.provider || provider || '').trim();
    if (!fokus || fokus === 'custom') {
      /* The bare `custom` slot: it is in the catalogue, so it is here already. */
      return providerSiap.filter((p) => p.id === fokus || p.id === efektif.provider);
    }
    const ada = providerSiap.find((p) => p.id === fokus);
    if (ada) return [ada];
    /*
     * Not "ready" (no key readable, no endpoint stored) but still selected: keep
     * it so the reader can see and change the model instead of an empty menu.
     */
    const katalog = PROVIDER_BY_ID.get(fokus);
    return katalog
      ? [katalog]
      : [
          {
            id: fokus,
            label: namaProvider(fokus) || fokus,
            freeText: true,
            models: [] as never[],
          },
        ];
  }, [ikutChat, providerSiap, efektif.provider, provider]);

  /*
   * Only catalogue providers can be "hidden": a custom-* provider exists
   * solely because the reader created it, so it is never counted as hidden.
   */
  const providerTersembunyi =
    PROVIDERS.filter((p) => !providerSiap.some((s) => s.id === p.id)).length;

  /*
   * `p` = the provider group the row (or the typed name) came from.
   *
   * It has to reach setModel: a row sits inside one provider's group, and the
   * click means "this model, from this provider". Dropping it left the previous
   * provider active - the composer showed "Anthropic - gemini-3.8-flash" and
   * sent Gemini's model to Anthropic's endpoint.
   */
  const pakai = (m: string, p?: string) => {
    if (sub) {
      void applySettings({ subagent: p ? { model: m, provider: p } : { model: m } } as never);
    } else void setAiModel(m, p);
  };

  useEffect(() => {
    if (!open) return;
    /*
     * The hovered-row card must not survive a close/open cycle.
     *
     * `intip` kept the LAST row the pointer had touched. Reopening the menu
     * then rendered that stale card immediately — before any new hover — at
     * coordinates measured against the PREVIOUS opening, and with `rect` null
     * (the fresh menu is not measured yet) the panel fell back to the window's
     * top-left corner. The reader pressed the button and a wrong model's
     * "Available for" card appeared above the list. Clearing on every open
     * means the card only ever describes a row under the pointer NOW.
     */
    setIntip(null);
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (open) setCari('');
  }, [open]);

  /*
   * Pull the key list whenever the menu OPENS, not once at mount.
   *
   * The provider list is built from `keys`, so an empty store meant the menu
   * opened with no providers at all and only filled in after the first send
   * happened to call loadKeys — the "custom provider shows up late" symptom.
   * Making it run on mount fixed that one, and introduced a worse one: the
   * snapshot never refreshed again. A key saved in Settings afterwards went
   * into `useSettingsUi`'s own copy and never reached this store, so the menu
   * kept the pre-save snapshot and hid the provider forever — the user saw
   * "key saved" and a passing connection test in Settings, and "providers
   * hidden because there is no API key yet" in the picker. Only a reload
   * reconciled the two.
   *
   * Re-reading on open costs one IPC that lists providers and masks keys; it
   * does not touch the network. That is cheap enough to be unconditional, and
   * being unconditional is the point — a condition based on "was a key saved
   * since?" is another piece of state that can itself go stale.
   */
  useEffect(() => {
    if (!open) return;
    void useAi.getState().loadKeys();
  }, [open]);

  /*
   * Fetch the live model list the moment the menu opens.
   *
   * `loadRemote` only ran from the refresh button in the footer, so a user who
   * never pressed it saw the static catalogue alone — for `custom` that is a
   * single placeholder row ("Type the model name"), which reads as "my models
   * are missing" even though the provider serves eighteen of them. Fetching on
   * open costs one request per open and makes the list correct by default.
   *
   * `remote` is checked first so reopening the menu does not re-hit the API for
   * a list already in memory.
   */
  useEffect(() => {
    if (!open || penyediaTampil.length === 0) return;
    const belum = penyediaTampil.filter((p) => (remote[p.id]?.length ?? 0) === 0);
    if (belum.length === 0) return;
    void Promise.all(belum.map((p) => loadRemote(p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, penyediaTampil]);

  const loadRemote = async (p: string) => {
    /*
     * Only the SAME provider is skipped, and only while its own request is in
     * flight. Pressing Refresh again after a failure must work: before this,
     * one provider already spinning made every later call return at the door.
     */
    if (fetching[p]) return;
    /*
     * `custom-*` has no catalogue default, so an empty base URL means the
     * request would go nowhere. Read it through `baseUrlEfektif`, which is the
     * same rule the picker uses to decide the provider is ready - two copies of
     * that logic is how a provider was listed and then failed to refresh.
     * The check happens BEFORE the spinner so a skip cannot leave it spinning.
     */
    const b = baseUrlEfektif(p, useStore.getState().settings.models.providers) || undefined;
    if (!b) return;
    setFetching((f) => ({ ...f, [p]: true }));
    try {
      /* `fullUrl` ikut dikirim: tanpa ini daftar model diambil dari
         `{base}/models` padahal endpoint-nya dikonfigurasi sebagai URL penuh. */
      const fu =
        (useStore.getState().settings.models.providers ?? {})[p]?.fullUrl === true
          ? true
          : undefined;
      const info = await cmd.listModels(p, b, fu);
      /*
       * Both halves are kept: the ids feed the list, and the rest of each row
       * feeds the detail panel. Storing only ids is what made every model look
       * like a name with a token count — the provider HAD said whether it takes
       * an image, and that answer was being discarded right here.
       */
      setRemote((r) => ({ ...r, [p]: info.map((m) => m.id) }));
      useSettingsUi.setState((s) => ({
        remoteInfo: info.some((m) => m.input_modalities || m.supported_parameters || m.pricing)
          ? { ...s.remoteInfo, [p]: Object.fromEntries(info.map((m) => [m.id, m])) }
          : s.remoteInfo,
      }));
    } catch {
      /* no key / offline - the stored list is still shown */
    } finally {
      setFetching((f) => {
        const n = { ...f };
        delete n[p];
        return n;
      });
    }
  };

  /* One refresh pulls the live list for every provider that can send, so the
     footer action does not depend on which group the user is looking at.
     `Promise.all`, not a serial loop: a gateway that hangs for 30s must not
     delay the next one, and an empty list must be re-fetched even when a stale
     one is already in memory (a Refresh that returns the old list is a Refresh
     that did nothing). */
  const refreshSemua = async () => {
    /*
     * Disk dibaca ulang lebih dulu: tombol ini yang ditekan orang setelah
     * memasukkan key, dan `keys`/`siapPakai` yang basi membuat provider baru
     * tetap dianggap "belum siap" walau key-nya sudah ditulis.
     */
    await useAi.getState().loadKeys();
    await Promise.all(penyediaTampil.map((p) => loadRemote(p.id)));
  };

  /*
   * Flip the menu to the button's RIGHT edge when opening left would leave the
   * screen.
   *
   * WHY measured instead of a CSS class: the button sits in the chat header,
   * which is at the window's right edge whenever the chat is docked right or
   * maximised (measured: button x=1211 of a 1536 viewport). A 361px menu anchored
   * to the button's LEFT edge ends at 1572 — 36px past the window — and the row
   * badges are clipped. That is the reported "terlalu ujung ga kliatan". The old
   * `.ai-panel.is-kanan` class cannot carry this fix: `AiPanel` hard-codes that
   * class OFF so every home shares one layout.
   *
   * Measured at open time and written as an inline style, so it is right in all
   * four homes (bottom dock, right column, editor tab, popped-out window) without
   * a flag per home. It re-runs when the query changes because the result list
   * (and so the menu's width) changes with it.
   */
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const anchor = wrap.current;
    if (!el || !anchor) return;
    /* Start from the CSS default so a re-open cannot inherit the previous flip. */
    el.style.left = '0';
    el.style.right = 'auto';
    const w = el.getBoundingClientRect().width;
    const a = anchor.getBoundingClientRect();
    if (a.left + w > window.innerWidth - 8) {
      el.style.left = 'auto';
      el.style.right = '0';
    }
  }, [open, cari]);

  /*
   * Which way the menu opens — and the answer is DOWN.
   *
   * It used to be hardcoded UPWARD (`bottom: calc(100% + 6px)`) on the argument
   * that the model chip sits at the bottom of the composer, so a downward menu
   * would fall off the window. That reasoning produced the wrong behaviour: the
   * box then floated above the button with a gap, reading as an unrelated panel
   * rather than as the button's own list — the "kotak nya kok diatas terus"
   * report, twice.
   *
   * WHY IT STILL WENT UP. The chip sits at the BOTTOM of the composer, so the
   * room below it is tiny by construction: measured on a 816px-tall window, the
   * button ends at 775 and there are 27px left. The old rule flipped upward
   * whenever the room below was under 120px, which on this layout is ALWAYS.
   * The downward path was dead code.
   *
   * So the rule is now: a menu with room below opens below; one without opens
   * UP, which is correct for a bottom-docked composer — a dropdown at the bottom
   * of a window opens upward, the way a native select does. What was actually
   * broken was the SIZE: in the upward branch the height was clamped against
   * `a.top`, the distance to the top of the WINDOW, while the visible space is
   * only the panel the chip lives in. The menu was allowed 490px inside a panel
   * that starts 686px above it, and the list was clipped by the panel's own
   * `overflow: hidden` — the "muncul ke atas terus kepotong" report.
   *
   * The clamp now uses the PANEL's top edge, not the window's, so the menu can
   * never be taller than the box it is drawn inside.
   */
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const anchor = wrap.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const JARAK = 6;

    /*
     * The box the menu is actually painted inside.
     *
     * `.ai-model-menu` is absolutely positioned within the chat panel, and that
     * panel clips (`overflow: hidden`). Measuring against `window.innerHeight`
     * ignores the clip, so the menu was sized for space it did not have. The
     * nearest scrollport's top edge is the real ceiling.
     */
    const panel = anchor.closest('.ai-panel') ?? anchor.parentElement;
    const pr = panel?.getBoundingClientRect();
    const atap = Math.max(pr?.top ?? 0, 0) + 8;
    const dasar = Math.min(pr?.bottom ?? window.innerHeight, window.innerHeight) - 8;

    const ruangBawah = dasar - a.bottom - JARAK;
    const ruangAtas = a.top - JARAK - atap;

    /*
     * Prefer DOWN, but only when it buys a usable list. `MIN_BAWAH` is the
     * height below which a downward menu is a 2-row scroll box - at that point
     * opening upward is strictly better, and it is also what every native
     * dropdown does when it sits near the bottom edge.
     */
    const MIN_BAWAH = 220;
    const keBawah = ruangBawah >= Math.min(MIN_BAWAH, ruangAtas);

    if (keBawah) {
      el.style.top = `calc(100% + ${JARAK}px)`;
      el.style.bottom = 'auto';
      el.style.maxHeight = `${Math.min(ruangBawah, Math.round((dasar - atap) * 0.8))}px`;
    } else {
      el.style.top = 'auto';
      el.style.bottom = `calc(100% + ${JARAK}px)`;
      /* Never taller than the room ABOVE it inside the panel - the old code
         measured to the window and overflowed the panel. */
      el.style.maxHeight = `${Math.min(ruangAtas, Math.round((dasar - atap) * 0.8))}px`;
    }
  }, [open, cari]);

  /*
   * "Edit models" opens CHAT SETTINGS on Models.
   *
   * The old body did four things to reach a section: close the menu, switch the
   * activity bar to Settings, force the sidebar open, then ask for 'models' on a
   * page across the window. None of that survives: the model settings are a pop-up
   * now, so reaching them is one call and this panel stays where it is.
   */
  const bukaModels = () => {
    setOpen(false);
    bukaPanel('models');
  };

  const hasilCari = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return [];
    const boleh = new Set(providerSiap.map((p) => p.id));
    const katalog = ALL_MODELS.filter(
      (m) =>
        boleh.has(m.provider) &&
        !isPlaceholderModel(m.id) &&
        (m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    ).map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      note: tr(m.note ?? ''),
      ctx: m.ctx ? fmtCtx(m.ctx) : '',
    }));
    const live = Object.entries(remote)
      .filter(([p]) => boleh.has(p))
      .flatMap(([p, ids]) =>
        ids
          .filter((id) => !MODEL_BY_ID.has(id) && id.toLowerCase().includes(q))
          .map((id) => ({ id, label: id, provider: p, note: tr('from provider'), ctx: '' })),
      );
    /* Saved custom models, so search finds a gateway model that is not live. */
    const kustom = (useStore.getState().settings.models.custom ?? [])
      .filter(
        (c) =>
          boleh.has(c.provider) &&
          !isPlaceholderModel(c.id) &&
          (c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)),
      )
      .map((c) => ({
        id: c.id,
        label: c.label || c.id,
        provider: c.provider,
        note: '',
        ctx: c.ctx ? fmtCtx(c.ctx) : '',
      }));
    return [...katalog, ...live, ...kustom].slice(0, 40);
  }, [cari, providerSiap, remote, tr]);

  const modeCari = cari.trim().length > 0;

  /*
   * Where the floating detail card goes — anchored to the ROW, not the menu.
   *
   * Two independent decisions:
   *
   *  1. VERTICAL: the card's top lines up with the row being pointed at, so it
   *     reads as belonging to that row. If the row is near the bottom of the
   *     window the card is nudged up just enough to stay on screen — a small
   *     correction, not a jump to the menu's own top.
   *
   *  2. HORIZONTAL: beside the menu. To the right of it when there is room, to
   *     the left otherwise, and over the menu's own right edge as a last resort
   *     (a narrow window), where `pointer-events: none` keeps it harmless.
   *
   * The row rect is measured at hover time by `tunjuk`, which is why `intip`
   * carries coordinates and not just an id.
   */
  const kartuRect = useMemo(() => {
    const menu = menuRef.current?.getBoundingClientRect();
    if (!menu || !intip) return null;
    const LEBAR = 208;
    const JARAK = 8;
    const TINGGI = 240;

    const kanan = menu.right + JARAK;
    const adaKanan = kanan + LEBAR <= window.innerWidth - 8;
    const kiri = menu.left - JARAK - LEBAR;
    const adaKiri = kiri >= 8;

    /* Line up with the row, then pull up only as far as the window demands. */
    const top = Math.max(8, Math.min(intip.top, window.innerHeight - TINGGI - 8));

    return {
      left: adaKanan ? kanan : adaKiri ? kiri : Math.max(8, window.innerWidth - LEBAR - 8),
      top,
      width: LEBAR,
    };
  }, [open, intip, cari]);

  /*
   * Flat list: every usable model in one scrollable list, grouped under a
   * provider heading, the way the reference picker does it.
   *
   * The two-level drill-down this replaces asked for the provider first and
   * only then showed models — two clicks plus a back button to answer one
   * question, and the second screen hid the first. Providers with no key stay
   * out (they cannot send); the note at the bottom says how many were hidden.
   */
  const daftarModel = useMemo(
    () =>
      penyediaTampil.map((p) => {
        const uiRemote = useSettingsUi.getState().remoteModels[p.id] ?? [];
        /*
         * What the provider's own list said, both copies merged.
         *
         * This is the ONLY evidence used to decide whether a row is locked, and
         * it is why `hidup` is computed here rather than inferred from the
         * catalogue: "the provider did not list this model" is a claim we can
         * only make when the provider actually answered. An empty list means it
         * never answered — a keyless provider, an offline endpoint, a gateway
         * with no `/models` route — and locking every row in that case would be
         * a lie dressed as a status icon.
         */
        const hidup = [...(remote[p.id] ?? []), ...uiRemote];
        const adaLaporan = hidup.length > 0;
        /*
         * Models the reader ADDED under this provider (settings.models.custom).
         *
         * `modelTersedia` cannot see them for a `custom-*` provider: it resolves
         * the catalogue by id and returns [] for an id it does not know. Without
         * this merge the picker would show an empty group for a gateway that
         * has three saved models — exactly the "modelnya ga kebaca" report.
         */
        const customRows = (useStore.getState().settings.models.custom ?? [])
          .filter((c) => c.provider === p.id && !isPlaceholderModel(c.id))
          .map((c) => ({ id: c.id, label: c.label || c.id, note: '', ctx: c.ctx }));
        const items = [
          ...customRows,
          ...modelTersedia(
            p.id,
            remote[p.id] ?? [],
            uiRemote,
            saved[p.id] ?? [],
            laporan[p.id] ?? {},
          ),
        ]
          .filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i)
          .map((m) => ({
            ...m,
            note: m.note ? tr(m.note) : '',
            ctx: m.ctx ? fmtCtx(m.ctx) : '',
            dikunci: adaLaporan && !hidup.includes(m.id),
          }));
        return {
          provider: p.id,
          label: p.label,
          freeText: !!p.freeText,
          items,
        };
      }),
    [penyediaTampil, remote, saved, laporan, tr],
  );

  /*
   * One flat list, the way the reference picker draws it.
   *
   * The provider headings are GONE. They were collapsible buttons with a model
   * count, which turned a list of names into a list of sections: with three
   * providers configured the reader had to fold two of them shut before seeing
   * any models at all, and the first screen of the menu was three headings and
   * nothing else. The reference shows models immediately under one title.
   *
   * The provider is still recoverable — as a quiet tag beside the name, and
   * only when there is more than one provider to tell apart. With a single
   * provider the row is exactly what the reference shows: mark, name, status.
   */
  const barisDatar = useMemo(
    () =>
      daftarModel.flatMap((g) =>
        g.items.map((m) => ({ ...m, provider: g.provider, providerLabel: g.label })),
      ),
    [daftarModel],
  );

  /*
   * Two sections, the way the reference picker draws them: built-in providers
   * first, then the reader's own gateways under "Custom Models".
   *
   * A single flat list could not tell "gemini-3-flash from Google" apart from
   * "glm-5.3-flash from geraikita" without a tag on every row; the section
   * header says it once, and the row suffix repeats it only where it matters.
   */
  const barisBawaan = useMemo(
    () => barisDatar.filter((m) => !m.provider.startsWith('custom')),
    [barisDatar],
  );
  const barisKustom = useMemo(
    () => barisDatar.filter((m) => m.provider.startsWith('custom')),
    [barisDatar],
  );

  /*
   * Custom rows grouped under their gateway's own name, the way the reference
   * picker draws third-party sections: a quiet header ("Geraikita"), then that
   * gateway's models beneath it. One header per provider, in first-seen order.
   */
  const grupKustom = useMemo(() => {
    const out: { provider: string; label: string; rows: typeof barisKustom }[] = [];
    for (const m of barisKustom) {
      let g = out.find((x) => x.provider === m.provider);
      if (!g) {
        g = { provider: m.provider, label: m.providerLabel, rows: [] };
        out.push(g);
      }
      g.rows.push(m);
    }
    return out;
  }, [barisKustom]);

  /* With one provider the tag would repeat the same word on every row. */
  const perluTagProvider = daftarModel.length > 1;

  /*
   * Every model currently on screen, flattened.
   *
   * The detail panel needs to look a model up by id alone, and a hovered row
   * does not carry its own group once it is in a list. Building the index once
   * per render is cheaper than threading the group through every row's state.
   */
  const modelById = useMemo(() => {
    const m = new Map<string, (typeof daftarModel)[number]['items'][number]>();
    for (const g of daftarModel) for (const it of g.items) if (!m.has(it.id)) m.set(it.id, it);
    return m;
  }, [daftarModel]);

  /*
   * What the detail panel is describing.
   *
   * Hovered row first, then the ACTIVE model so the column is never blank. The
   * active model is looked up through `modelTersedia` too, which means a model
   * that is selected but not in the current provider's list still resolves
   * through the catalogue — better than an empty panel.
   */
  const detail = useMemo(() => {
    if (intip) {
      const hit = modelById.get(intip.id);
      if (hit) return hit;
    }
    const aktif = modelById.get(efektif.id);
    if (aktif) return aktif;
    /* Last resort: the catalogue entry for the selected model. */
    if (!efektif.id) return null;
    const lap = laporan[efektif.provider]?.[efektif.id];
    return {
      id: efektif.id,
      label: efektif.label,
      note: '',
      ctx: efektif.ctx ? fmtCtx(efektif.ctx) : '',
      bisa: deteksiKemampuan(efektif.id, lap),
      biaya: 'Billed by token',
    };
  }, [intip, modelById, efektif, laporan]);

  /*
   * One row, shared by both sections.
   *
   * The gateway name is NOT in the row: it sits in the group header above
   * ("Geraikita"), the way the reference picker labels third-party sections.
   * Repeating it on every row would make the list a wall of parentheses.
   */
  const baris = (m: (typeof barisDatar)[number], kustom: boolean) => {
    const nama = tr(m.label);
    return (
      <button
        key={`m:${m.provider}:${m.id}`}
        role="option"
        aria-selected={m.id === efektif.id}
        className={`ai-model-item${m.id === efektif.id ? ' is-active' : ''}${intip?.id === m.id ? ' is-intip' : ''}`}
        data-model-item={m.id}
        data-provider={m.provider}
        data-terkunci={m.dikunci ? '1' : '0'}
        data-baseurl={PROVIDER_BY_ID.get(m.provider)?.baseUrl}
        title={
          m.dikunci
            ? tr(
                'This provider does not list this model for the current key. It is still selectable, but it may be refused.',
              )
            : m.note || undefined
        }
        onMouseEnter={tunjuk(m.id)}
        onFocus={tunjuk(m.id)}
        onClick={() => {
          pakai(m.id, m.provider);
          setOpen(false);
        }}
      >
        <ModelLogo id={m.id} size={15} />
        <span className="ai-mi-name">{nama}</span>
        {!kustom && perluTagProvider && <span className="ai-mi-tag">{m.providerLabel}</span>}
        {m.dikunci ? (
          <span className="ai-mi-lock" aria-label={tr('Not listed by this provider')}>
            <AiIkon name="lock" size={12} />
          </span>
        ) : m.id === efektif.id ? (
          <span className="pick-check">✓</span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="ai-model-wrap" ref={wrap}>
      <button
        className="ai-model-btn"
        data-testid={`${pfx}-model-btn`}
        data-model={efektif.id}
        data-provider={efektif.provider}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${efektif.providerLabel} - ${baseUrl || tr('base URL not set')}`}
        onClick={() => setOpen(!open)}
      >
        <ProviderLogo id={efektif.provider} size={15} />
        <span className="ai-model-name">
          {ikutChat ? tr('Follow chat') : hydraDipilih ? 'HydraFusion' : efektif.label}
        </span>
        {/* Closed: the list below is folded, so the caret points DOWN. It used
            to be hardcoded to `chev-up`, which told the reader the menu was
            already open while it was shut - measured live against the
            reference, whose caret points down whenever the menu is closed. */}
        <AiIkon name={open ? 'chev-up' : 'chev-down'} size={11} />
      </button>

      {open && (
        <div
          className="ai-model-menu"
          ref={menuRef}
          role="listbox"
          data-testid={`${pfx}-model-menu`}
          data-tahap={modeCari ? 'cari' : 'daftar'}
        >
          {/*
            * The header, in the reference product's shape: a title that says
            * what the list IS, then the icon actions at its right edge.
            *
            * The search field used to be the whole header row, which made the
            * box look like a search dialog rather than a list of models. The
            * reference leads with "Built-in Models" and an info dot; search is
            * still here, one row down, because this list runs to seventy-odd
            * rows once a few providers are configured.
            */}
          <div className="ai-mp-head">
            <span className="ai-mp-head-judul">{tr('Built-in Models')}</span>
            <button
              type="button"
              className={`ai-model-refresh${sedangAmbil ? ' is-putar' : ''}`}
              data-testid={`${pfx}-model-refresh`}
              title={sedangAmbil ? tr('Refreshing…') : tr('Refresh models')}
              aria-label={tr('Refresh models')}
              disabled={sedangAmbil || penyediaTampil.length === 0}
              onClick={() => void refreshSemua()}
            >
              <AiIkon name="refresh" size={13} />
            </button>
            <span
              className="ai-mp-head-info"
              data-testid={`${pfx}-model-info`}
              title={tr(
                'Every model the providers you have a key for can serve. A padlock marks a model the provider does not list for this account — it is still selectable.',
              )}
              aria-label={tr('About this list')}
            >
              <AiIkon name="info" size={13} />
            </span>
          </div>

          <div className="ai-mp-cari">
            <span className="ai-mp-cari-ikon" aria-hidden="true">
              <AiIkon name="search" size={12} />
            </span>
            <input
              type="text"
              className="ai-model-input"
              data-testid={`${pfx}-model-cari`}
              placeholder={tr('Search models…')}
              value={cari}
              spellCheck={false}
              onChange={(e) => setCari(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && modeCari && hasilCari[0]) {
                  pakai(hasilCari[0].id, hasilCari[0].provider);
                  setOpen(false);
                }
              }}
            />
            {cari && (
              <button
                type="button"
                className="ai-model-refresh is-kecil"
                data-testid={`${pfx}-model-cari-bersih`}
                title={tr('Clear search')}
                onClick={() => setCari('')}
              >
                ×
              </button>
            )}
          </div>

          {/*
            * Two columns from here down: the list on the left, the detail panel
            * on the right.
            *
            * The panel is a SIBLING of the scroll container, not a child of it,
            * so it stays put while the list scrolls — that is what makes hovering
            * row 30 still show row 30's details instead of scrolling the answer
            * out of view.
            */}
          {/*
            * The list, and NOTHING beside it.
            *
            * The detail panel used to live in here as a second column, which
            * squeezed the list to 241px and made the panel look like part of the
            * menu. It is not: it is a card that appears NEXT TO the menu when the
            * reader points at a row, the way the reference product does it. See
            * the floating card rendered after this block.
            */}
          <div className="ai-mp-daftar" onMouseLeave={() => setIntip(null)}>
          {modeCari ? (
            hasilCari.length === 0 ? (
              <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
                {tr('No matching model')}
              </div>
            ) : (
              hasilCari.map((m) => (
                <button
                  key={`c:${m.provider}:${m.id}`}
                  role="option"
                  aria-selected={m.id === efektif.id}
                  className={`ai-model-item${m.id === efektif.id ? ' is-active' : ''}${intip?.id === m.id ? ' is-intip' : ''}`}
                  data-model-item={m.id}
                  data-provider={m.provider}
                  onMouseEnter={tunjuk(m.id)}
                  onFocus={tunjuk(m.id)}
                  onClick={() => {
                    pakai(m.id, m.provider);
                    setOpen(false);
                  }}
                >
                  <ModelLogo id={m.id} size={15} />
                  <span className="ai-mi-name">{tr(m.label)}</span>
                  <span className="ai-mi-badge">
                    {[m.ctx, m.note].filter(Boolean).join(' · ')}
                  </span>
                  {m.id === efektif.id && <span className="pick-check">✓</span>}
                </button>
              ))
            )
          ) : penyediaTampil.length === 0 ? (
            <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
              {tr('No API key installed yet. Add a key first to pick a model.')}
              <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={bukaModels}>
                {tr('Open AI Models')}
              </button>
            </div>
          ) : (
            <>
              {/*
                * HydraFusion is a MODEL, and it is always in this list.
                *
                * The reference product states the contract plainly: "you select
                * HydraFusion like any other model, and it chooses a workflow".
                * It is therefore a row here, not a switch in another panel.
                *
                * WHY it used to be gated behind `hydraOn`: the row only rendered
                * when the setting was ALREADY on, so the only way to reach it was
                * to turn the setting on first — and with the setting on, every
                * turn was routed whether or not the reader ever picked it. That
                * circularity is exactly the "HydraFusion engages by itself"
                * complaint. Selecting this row now SETS THE MODEL (the
                * `hydrafusion` sentinel); the send paths read the selection, not
                * the flag.
                */}
              {!sub && (
                <button
                  type="button"
                  role="option"
                  aria-selected={hydraDipilih}
                  className={`ai-model-item is-hydra${hydraDipilih ? ' is-active' : ''}`}
                  data-testid="ai-model-hydra"
                  title={tr(
                    'Routes the first eligible turn and may use several models. Premium usage varies with the selected route.',
                  )}
                  onClick={() => {
                    setAiModel(HYDRA_MODEL_ID, aiProvider || undefined);
                    setOpen(false);
                  }}
                >
                  {/*
                    * The Zephyr mark, then the name. Nothing else.
                    *
                    * This row used to carry two badges — "Research preview" and
                    * a sentence explaining what the feature does. In a list of
                    * model names they made HydraFusion the only row with prose,
                    * so it read as an advertisement wedged between the models
                    * rather than as one of them. The explanation still exists,
                    * as the row's `title` tooltip.
                    */}
                  <span className="ai-mi-logo" aria-hidden="true">
                    <ZephyrLogo size={15} glyphOnly />
                  </span>
                  <span className="ai-mi-name">HydraFusion</span>
                  {hydraDipilih && <span className="pick-check">✓</span>}
                </button>
              )}

              {sub && (
                <button
                  type="button"
                  role="option"
                  aria-selected={ikutChat}
                  className={`ai-model-item${ikutChat ? ' is-active' : ''}`}
                  data-testid="sub-model-ikut"
                  onClick={() => {
                    void applySettings({ subagent: { model: '', provider: '' } } as never);
                    setOpen(false);
                  }}
                >
                  <span className="ai-mi-name">{tr('Follow the chat model')}</span>
                  <span className="ai-mi-badge">{tr('same as the conversation')}</span>
                  {ikutChat && <span className="pick-check">✓</span>}
                </button>
              )}

              {/*
                * Two sections, the reference picker's shape: built-in models
                * first, the reader's own gateways under a quiet "Custom Models"
                * heading.
                *
                * The row is the reference product's row: mark, name, then the
                * status at the right edge — a padlock when the provider's own
                * list did not include this model, a tick when it is the one
                * selected. A custom row carries its gateway name in the label,
                * "GLM 5.3 Flash (geraikita)", because two gateways can serve the
                * same model id and the name is the only way to tell them apart.
                */}
              {barisBawaan.map((m) => baris(m, false))}

              {/*
                * The reader's own gateways: one "Custom Models" label, then a
                * header per gateway (logo + name) with its models beneath —
                * the shape the reference picker uses for third-party sections.
                * The gateway name lives in the HEADER now, so the row itself
                * carries the bare model name again.
                */}
              {grupKustom.length > 0 && (
                <div className="ai-mp-seksi" aria-hidden="true">
                  {tr('Custom Models')}
                </div>
              )}
              {grupKustom.map((g) => (
                <Fragment key={`s:${g.provider}`}>
                  <div className="ai-mp-prov" aria-hidden="true">
                    <ProviderLogo id={g.provider} size={13} />
                    <span>{namaProvider(g.provider) || g.label}</span>
                  </div>
                  {g.rows.map((m) => baris(m, true))}
                </Fragment>
              ))}

              {providerTersembunyi > 0 && (
                <div className="ai-mp-note" data-testid={`${pfx}-mp-note`}>
                  {providerTersembunyi} {tr('providers hidden because there is no API key yet.')}
                </div>
              )}
            </>
          )}
          </div>

          {/*
            * The footer, in the reference product's shape: one quiet row -
            * mark, then label - separated by a hairline, not a full-width
            * raised button.
            *
            * The raised button made the footer the brightest, heaviest block in
            * a menu whose real content is the list above it; it read as the
            * submit row of a form. As a plain row it is still the obvious way
            * out of "my model is not in this list", without competing with the
            * models.
            */}
          <div className="ai-mp-foot">
            <button
              type="button"
              className="ai-mp-add"
              data-testid={`${pfx}-model-edit`}
              title={tr('Add Model')}
              onClick={bukaModels}
            >
              <AiIkon name="gear" size={13} />
              <span>{tr('Add Model')}</span>
            </button>
          </div>
        </div>
      )}

      {/*
        * The detail card, OUTSIDE the dropdown.
        *
        * It is a sibling of the menu, not a column inside it. Two reasons, and
        * the second is the one that was reported:
        *
        *  1. Inside the menu it stole 178px from the list, so every model name
        *     was squeezed into 241px and the list itself stopped looking like
        *     the reference.
        *  2. It read as part of the menu. It is not — it is a description of
        *     whatever the pointer is over, and the reference product floats it
        *     BESIDE the list, so the menu keeps its own shape.
        *
        * `position: fixed` with a measured rect, because the menu lives inside
        * the chat panel's own stacking context and an absolutely positioned
        * card would be clipped by the panel's `overflow`.
        */}
      {open && intip && detail && (
        <ModelDetailPanel
          model={detail}
          testid={`${pfx}-model-detail`}
          mengambang
          rect={kartuRect}
        />
      )}    </div>
  );
}
