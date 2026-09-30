import { useEffect, useMemo, useRef, useState } from 'react';
import { useT, tf } from '../../lib/i18n';
import { useSched, useSchedBuka, INTERVAL } from '../../lib/schedStore';
import { useNotesTodos, urutkan, type Item, type Kind } from '../../lib/notesTodosStore';
import { useStore } from '../../lib/store';
import type { CronJob } from '../../lib/commands';
import AiIkon from './AiIkon';

/*
 * Notes, todos and schedule in one floating panel.
 *
 * The three answer the same kind of question — "what did I write down" and
 * "what runs when" — and all three are read for a few seconds and closed. Three
 * separate panels would mean three buttons and three places to look, so they
 * share one shell with a tab strip; the schedule keeps its own store because
 * the jobs run in Rust, and the other two share `notesTodosStore`.
 *
 * The pin keeps the panel open when the user clicks away, for the case where
 * they are copying out of it.
 */

/** "every 30 min" / "daily at 09:00" — the interval, in words. */
function jadwal(j: CronJob, tr: (s: string) => string): string {
  if (j.at_hour !== null && j.at_hour !== undefined) {
    return `${tr('daily at')} ${String(j.at_hour).padStart(2, '0')}:00`;
  }
  if (j.every_minutes >= 1440) return tr('daily');
  if (j.every_minutes >= 60) {
    const h = j.every_minutes / 60;
    return `${tr('every')} ${h % 1 === 0 ? h : h.toFixed(1)} ${tr('hours')}`;
  }
  return `${tr('every')} ${j.every_minutes} ${tr('minutes')}`;
}

/** Relative "2h ago", or a dash for a job that has never run. */
function terakhir(ms: number | null, tr: (s: string) => string): string {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return tr('just now');
  if (s < 3600) return `${Math.floor(s / 60)}${tr('m ago')}`;
  if (s < 86_400) return `${Math.floor(s / 3600)}${tr('h ago')}`;
  return `${Math.floor(s / 86_400)}${tr('d ago')}`;
}

/** One note or todo row: checkbox (todos), text, pin, delete. */
function BarisItem({ it }: { it: Item }) {
  const tr = useT();
  const balikSelesai = useNotesTodos((s) => s.balikSelesai);
  const balikPin = useNotesTodos((s) => s.balikPin);
  const ubah = useNotesTodos((s) => s.ubah);
  const hapus = useNotesTodos((s) => s.hapus);

  const [sunting, setSunting] = useState(false);
  const [draf, setDraf] = useState(it.teks);

  const simpanTeks = () => {
    const v = draf.trim();
    if (v && v !== it.teks) ubah(it.id, v);
    else setDraf(it.teks);
    setSunting(false);
  };

  return (
    <div
      className={`nt-row${it.selesai ? ' is-selesai' : ''}${it.pin ? ' is-pin' : ''}`}
      data-testid={`nt-${it.id}`}
      data-kind={it.kind}
      data-selesai={it.selesai}
      data-pin={it.pin}
    >
      {it.kind === 'todos' && (
        <button
          className={`nt-cek${it.selesai ? ' is-on' : ''}`}
          data-testid={`nt-cek-${it.id}`}
          role="checkbox"
          aria-checked={it.selesai}
          aria-label={tr('Done')}
          title={tr('Done')}
          onClick={() => balikSelesai(it.id)}
        >
          {it.selesai && <AiIkon name="check" size={9} />}
        </button>
      )}

      {sunting ? (
        <input
          className="nt-edit"
          data-testid={`nt-edit-${it.id}`}
          value={draf}
          autoFocus
          onChange={(e) => setDraf(e.target.value)}
          onBlur={simpanTeks}
          onKeyDown={(e) => {
            if (e.key === 'Enter') simpanTeks();
            if (e.key === 'Escape') {
              setDraf(it.teks);
              setSunting(false);
            }
          }}
        />
      ) : (
        <span
          className="nt-teks"
          data-testid={`nt-teks-${it.id}`}
          title={tr('Double-click to edit')}
          onDoubleClick={() => {
            setDraf(it.teks);
            setSunting(true);
          }}
        >
          {it.teks}
        </span>
      )}

      <button
        className={`nt-pin${it.pin ? ' is-on' : ''}`}
        data-testid={`nt-pin-${it.id}`}
        role="switch"
        aria-checked={it.pin}
        aria-label={it.pin ? tr('Unpin') : tr('Pin to top')}
        title={it.pin ? tr('Unpin') : tr('Pin to top')}
        onClick={() => balikPin(it.id)}
      >
        <AiIkon name="pin" size={11} />
      </button>

      <button
        className="nt-hapus"
        data-testid={`nt-hapus-${it.id}`}
        aria-label={tr('Delete')}
        title={tr('Delete')}
        onClick={() => hapus(it.id)}
      >
        <AiIkon name="trash" size={11} />
      </button>
    </div>
  );
}

export default function NotesPanel() {
  const tr = useT();
  const buka = useSchedBuka((s) => s.buka);
  const setBuka = useSchedBuka((s) => s.setBuka);

  const tab = useNotesTodos((s) => s.tab);
  const setTab = useNotesTodos((s) => s.setTab);
  const cari = useNotesTodos((s) => s.cari);
  const setCari = useNotesTodos((s) => s.setCari);
  const pinPanel = useNotesTodos((s) => s.pinPanel);
  const setPinPanel = useNotesTodos((s) => s.setPinPanel);
  const items = useNotesTodos((s) => s.items);
  const tambah = useNotesTodos((s) => s.tambah);
  const bersihSelesai = useNotesTodos((s) => s.bersihSelesai);
  const dari = useNotesTodos((s) => s.dari);

  const daftar = useSched((s) => s.daftar);
  const memuatSched = useSched((s) => s.memuat);
  const errorSched = useSched((s) => s.error);
  const muatSched = useSched((s) => s.muat);
  const tambahSched = useSched((s) => s.tambah);
  const hapusSched = useSched((s) => s.hapus);
  const balikSched = useSched((s) => s.balik);

  const [draf, setDraf] = useState('');
  const [namaJob, setNamaJob] = useState('');
  const [perintah, setPerintah] = useState('');
  const [interval, setInterval] = useState<number>(60);
  const [sibuk, setSibuk] = useState(false);
  const cariRef = useRef<HTMLInputElement | null>(null);

  /* Hydrate once from settings, so a restart keeps the list. */
  useEffect(() => {
    const simpan = useStore.getState().settings as unknown as { notesTodos?: Item[] };
    dari(simpan.notesTodos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!buka) return;
    void muatSched();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setBuka(false);
      }
      /* Ctrl+F focuses the filter, matching the strip the panel shows. */
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        cariRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, muatSched, setBuka]);

  /*
   * Close on an outside click unless the panel is pinned.
   *
   * The pin exists for the case where the user is copying out of the panel, so
   * the click-away has to be suppressed while it is on — otherwise the panel
   * vanishes the moment they click into the editor.
   */
  useEffect(() => {
    if (!buka || pinPanel) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.nt-panel') || t?.closest('[data-testid="mb-schedule"]')) return;
      setBuka(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [buka, pinPanel, setBuka]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const kind: Kind = tab === 'notes' ? 'notes' : 'todos';
    return urutkan(items).filter(
      (i) => i.kind === kind && (q ? i.teks.toLowerCase().includes(q) : true),
    );
  }, [items, tab, cari]);

  const sisaTodo = items.filter((i) => i.kind === 'todos' && !i.selesai).length;
  const selesaiTodo = items.filter((i) => i.kind === 'todos' && i.selesai).length;
  const jumlahNotes = items.filter((i) => i.kind === 'notes').length;

  const kirimItem = () => {
    if (!draf.trim()) return;
    tambah(tab === 'notes' ? 'notes' : 'todos', draf);
    setDraf('');
  };

  const kirimJob = async () => {
    if (!namaJob.trim() || !perintah.trim() || sibuk) return;
    setSibuk(true);
    const ok = await tambahSched({ name: namaJob, command: perintah, everyMinutes: interval });
    setSibuk(false);
    if (ok) {
      setNamaJob('');
      setPerintah('');
    }
  };

  if (!buka) return null;

  const judulTab: { id: typeof tab; label: string; badge: number | null }[] = [
    { id: 'schedule', label: tr('Schedule'), badge: daftar.length || null },
    { id: 'notes', label: tr('Notes'), badge: jumlahNotes || null },
    { id: 'todos', label: tr('Todos'), badge: sisaTodo || null },
  ];

  return (
    <>
      {/* No scrim when pinned: the point of the pin is to keep reading the page
          behind the panel, and a dimmed backdrop would defeat that. */}
      {!pinPanel && (
        <div className="nt-scrim" data-testid="nt-scrim" onClick={() => setBuka(false)} />
      )}

      <div
        className={`nt-panel${pinPanel ? ' is-pin' : ''}`}
        data-testid="nt-panel"
        role="dialog"
        aria-label={tr('Notes & todos')}
      >
        <div className="nt-top">
          <input
            ref={cariRef}
            className="nt-cari"
            data-testid="nt-cari"
            placeholder={tr('Search')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            spellCheck={false}
            aria-label={tr('Search')}
          />
          <kbd className="nt-kbd">Ctrl+F</kbd>
          <button
            className={`nt-pinpanel${pinPanel ? ' is-on' : ''}`}
            data-testid="nt-pin-panel"
            role="switch"
            aria-checked={pinPanel}
            aria-label={pinPanel ? tr('Unpin panel') : tr('Pin panel open')}
            title={pinPanel ? tr('Unpin panel') : tr('Pin panel open')}
            onClick={() => setPinPanel(!pinPanel)}
          >
            <AiIkon name="pin" size={13} />
          </button>
          <button className="nt-x" data-testid="nt-tutup" title={tr('Close')} onClick={() => setBuka(false)}>
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="nt-tabs" role="tablist">
          {judulTab.map((t) => (
            <button
              key={t.id}
              className={`nt-tab${tab === t.id ? ' is-on' : ''}`}
              data-testid={`nt-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge !== null && <span className="nt-badge">{t.badge}</span>}
            </button>
          ))}
        </div>

        <div className="nt-body" data-testid="nt-body">
          {/* ── Schedule ─────────────────────────────────────────────── */}
          {tab === 'schedule' && (
            <>
              {errorSched && (
                <p className="nt-err" role="alert" data-testid="nt-err">
                  {errorSched}
                </p>
              )}

              {daftar.length === 0 && !memuatSched && (
                <p className="nt-kosong">{tr('Nothing scheduled yet. Add a command below.')}</p>
              )}

              {daftar.map((j) => (
                <div className={`sch-row${j.enabled ? '' : ' is-mati'}`} key={j.id} data-testid={`sched-${j.id}`}>
                  <button
                    className={`sch-tog${j.enabled ? ' is-on' : ''}`}
                    data-testid={`sched-${j.id}-tog`}
                    role="switch"
                    aria-checked={j.enabled}
                    title={j.enabled ? tr('Disable') : tr('Enable')}
                    aria-label={j.enabled ? tr('Disable') : tr('Enable')}
                    onClick={() => void balikSched(j.id, !j.enabled)}
                  >
                    <span className="sch-knob" aria-hidden="true" />
                  </button>
                  <div className="sch-isi">
                    <span className="sch-nama">{j.name}</span>
                    <code className="sch-cmd" title={j.command}>
                      {j.command}
                    </code>
                  </div>
                  <span className="sch-jadwal">{jadwal(j, tr)}</span>
                  <span className="sch-last" title={j.last_run ? new Date(j.last_run).toLocaleString() : undefined}>
                    {terakhir(j.last_run, tr)}
                  </span>
                  <button
                    className="sch-hapus"
                    data-testid={`sched-${j.id}-hapus`}
                    title={tr('Delete')}
                    aria-label={tr('Delete')}
                    onClick={() => void hapusSched(j.id)}
                  >
                    <AiIkon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* ── Notes / Todos ────────────────────────────────────────── */}
          {tab !== 'schedule' && (
            <>
              {tampil.length === 0 && (
                <p className="nt-kosong" data-testid="nt-kosong">
                  {cari.trim()
                    ? tr('Nothing matches that search.')
                    : tab === 'notes'
                      ? tr('No notes yet.')
                      : tr('No todos yet.')}
                </p>
              )}
              {tampil.map((it) => (
                <BarisItem key={it.id} it={it} />
              ))}
            </>
          )}
        </div>

        <div className="nt-add">
          {tab === 'schedule' ? (
            <>
              <input
                className="nt-in nt-in-nama"
                data-testid="sched-nama"
                placeholder={tr('Job name')}
                value={namaJob}
                onChange={(e) => setNamaJob(e.target.value)}
                spellCheck={false}
                aria-label={tr('Job name')}
              />
              <input
                className="nt-in nt-in-cmd"
                data-testid="sched-perintah"
                placeholder={tr('Command to run')}
                value={perintah}
                onChange={(e) => setPerintah(e.target.value)}
                spellCheck={false}
                aria-label={tr('Command to run')}
              />
              <select
                className="nt-in nt-in-int"
                data-testid="sched-interval"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                aria-label={tr('Interval')}
              >
                {INTERVAL.map((m) => (
                  <option key={m} value={m}>
                    {m >= 1440 ? tr('daily') : m >= 60 ? `${m / 60} ${tr('hours')}` : `${m} ${tr('minutes')}`}
                  </option>
                ))}
              </select>
              <button
                className="nt-btn"
                data-testid="sched-tambah"
                disabled={!namaJob.trim() || !perintah.trim() || sibuk}
                onClick={() => void kirimJob()}
              >
                {tr('Add')}
              </button>
            </>
          ) : (
            <>
              <input
                className="nt-in nt-in-teks"
                data-testid="nt-input"
                placeholder={tab === 'notes' ? tr('Write a note, then press Enter') : tr('Add a todo, then press Enter')}
                value={draf}
                onChange={(e) => setDraf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    kirimItem();
                  }
                }}
                spellCheck={false}
                aria-label={tab === 'notes' ? tr('New note') : tr('New todo')}
              />
              <button
                className="nt-btn"
                data-testid="nt-tambah"
                disabled={!draf.trim()}
                aria-label={tr('Add')}
                title={tr('Add')}
                onClick={kirimItem}
              >
                <AiIkon name="plus" size={13} />
              </button>
              {tab === 'todos' && selesaiTodo > 0 && (
                <button
                  className="nt-btn nt-btn-bersih"
                  data-testid="nt-bersih"
                  title={tf('Clear {n} done', { n: selesaiTodo })}
                  onClick={bersihSelesai}
                >
                  {tf('Clear {n} done', { n: selesaiTodo })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
