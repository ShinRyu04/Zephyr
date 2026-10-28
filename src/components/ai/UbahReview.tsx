import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import type { AntrianPesan } from '../../lib/aiStore';
import { useDiff, useDiffBerkas } from '../../lib/diffStore';
import { useStore } from '../../lib/store';
import { asZephyrError, fsDelete, fsWrite } from '../../lib/commands';
import { tf, useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import FileIkon from './FileIkon';
import '../../styles/ai-perubahan.css';

/*
 * The turn review card, above the composer — MAIN WINDOW ONLY.
 *
 * In the Agents window this card does not render at all: that window's right
 * panel already tracks the run automatically (Task Summary: Todo / Context /
 * Files), and a second copy above the composer would duplicate it. The reader
 * decided this after seeing both side by side (2026-10-28).
 *
 * Shape (the reference product's):
 *
 *   tertutup — satu strip tipis di atas composer:
 *     [☑] [🗂] [☰]  2 files to review        Undo All  [ Keep All ]  ×
 *
 *   klik tab / kalimat status — panel DROP-UP melayang ke ATAS strip,
 *     isinya mengikuti tab yang dipilih (todo | berkas | queue).
 *
 * The strip is an ARRAY of tabs, so adding a fourth section is one entry, not
 * a fourth hand-written branch. Today: todos (the agent's plan), files (what
 * the turn wrote), queue (messages the reader typed while the agent worked).
 *
 * Scope: the CURRENT turn. `diffStore` resets every turn; `agentTodos` is the
 * live checklist the agent rewrites via todo_write. × hides the card until
 * the next turn begins.
 */
/* Beku: identitas stabil untuk selector - jangan bikin array baru per render. */
const KOSONG_ANTRIAN: AntrianPesan[] = [];

export default function UbahReview({
  permukaan = 'main',
  composerId = '',
}: {
  permukaan?: 'main' | 'agents';
  /**
   * Permukaan yang PUNYA kartu ini.
   *
   * Dulu nilainya di-hardcode `''` (permukaan utama), sehingga antrean yang
   * diketik dari tab editor (`composerId="editor"`) ditulis ke lane `editor`
   * tetapi kartu di tab itu membaca lane `''`: pesannya terkirim oleh drain,
   * namun tidak pernah muncul di tab Queue mana pun - terbaca sebagai "tidak
   * masuk antrean". Sekarang kartu membaca lane permukaannya sendiri.
   */
  composerId?: string;
}) {
  const tr = useT();
  const todos = useAi((s) => s.agentTodos);
  const berkas = useDiffBerkas();
  const turnId = useDiff((s) => s.turnId);

  const antrianStore = useAi((s) => s.antrians[composerId]);
  const buangAntrian = useAi((s) => s.buangAntrian);
  const kosongkanAntrian = useAi((s) => s.kosongkanAntrian);
  const kirimAntrian = useAi((s) => s.kirimAntrian);

  const [sibuk, setSibuk] = useState(false);
  const [buka, setBuka] = useState(false);
  /* Tab yang dipilih pembaca; null = otomatis (berkas > todo > queue). */
  const [tabDipilih, setTabDipilih] = useState<string | null>(null);

  /* Dismissed for THIS turn. A new turn (new diffStore turnId) brings the card
     back - the reader dismissed the old answer, not every future one. */
  const [ditutup, setDitutup] = useState(false);
  useEffect(() => {
    setDitutup(false);
  }, [turnId]);

  /*
   * Tunjukkan antrean SAAT pesan masuk.
   *
   * Kartu ini sengaja terlipat (satu strip tipis) sampai pembaca membukanya -
   * bentuk yang benar untuk berkas/todo yang bisa menunggu. Antrean tidak bisa
   * menunggu: pesannya baru diketik, dan pembaca yang tidak melihat apa pun
   * menyimpulkan pesannya hilang. Karena itu setiap kali jumlah baris antrean
   * BERTAMBAH, kartu membuka tab Queue sendiri - sekali, bukan tiap render.
   * Penambahan dilacak lewat panjang sebelumnya (ref), bukan efek pada array:
   * selector tetap mengembalikan nilai primitif dan tidak ada re-render loop.
   */
  const jumlahAntrian = antrianStore?.length ?? 0;
  const jumlahSebelumRef = useRef(jumlahAntrian);
  useEffect(() => {
    if (jumlahAntrian > jumlahSebelumRef.current) {
      setTabDipilih('queue');
      setBuka(true);
      setDitutup(false);
    }
    jumlahSebelumRef.current = jumlahAntrian;
  }, [jumlahAntrian]);

  /* Agent window: kartu ini tidak dirender - Task Summary panel kanan yang
     mengurus todos dan perubahan secara otomatis. Gerbangnya SETELAH semua
     hooks supaya urutan hook tetap konsisten antar render. */
  if (permukaan === 'agents') return null;

  const adaTodos = todos.length > 0;
  const adaBerkas = berkas.length > 0;
  const antrian = antrianStore ?? KOSONG_ANTRIAN;
  const adaAntrian = antrian.length > 0;
  const semuaSelesai = adaTodos && todos.every((t) => t.status === 'done');

  /* Tab bersifat data-driven: satu entri = satu tab di strip. Urutannya
     urutan tampil di strip. */
  const TABS: { id: string; judul: string; ada: boolean; ikon: ReactNode }[] = [
    {
      id: 'todo',
      judul: tr('Task list'),
      ada: adaTodos,
      ikon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path
            d="M2.5 4.2l1.6 1.6 3-3.1M2.5 11.2l1.6 1.6 3-3.1M9 4.6h4.6M9 11.6h4.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: 'berkas',
      judul: adaBerkas
        ? berkas.length === 1
          ? tr('1 file to review')
          : tf('{n} files to review', { n: berkas.length })
        : tr('Files'),
      ada: adaBerkas,
      ikon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2.5" width="12" height="5" rx="1.5" />
          <rect x="2" y="9" width="12" height="5" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'queue',
      judul: tr('Queue'),
      ada: adaAntrian,
      ikon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h7" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const tabHidup = TABS.filter((t) => t.ada);
  const tabAktif = tabDipilih ?? (tabHidup[0]?.id ?? 'berkas');
  const tabAktifData = tabHidup.find((t) => t.id === tabAktif);

  /* Tidak ada tab yang berisi, atau kartu di-dismiss: tanpa kartu. */
  if (!tabHidup.length || ditutup) return null;

  /*
   * Undo All = put every file back the way it was before the agent wrote it.
   *
   * `sebelum === null` means the file did not exist, so "before" is "gone":
   * deleting it is the only honest restore. Each file is restored on its own so
   * one refusal (a locked file, a rules block) cannot leave the rest untouched;
   * the failures are counted and reported instead of being swallowed.
   *
   * The open tab is reloaded from disk afterwards. Without that the editor keeps
   * showing the agent's version while the file on disk has been reverted - the
   * worst of both, and the user would save it right back.
   */
  const undoAll = async () => {
    if (sibuk) return;
    setSibuk(true);
    let gagal = 0;
    let pesanGagal = '';
    for (const b of [...useDiff.getState().berkas]) {
      try {
        if (b.sebelum === null) await fsDelete([b.path]);
        else await fsWrite(b.path, b.sebelum, undefined, undefined, { wasExisting: true });
        await useStore.getState().reloadTabFromDisk(b.path);
        useDiff.getState().buang(b.path);
      } catch (e) {
        gagal++;
        if (!pesanGagal) pesanGagal = asZephyrError(e).message;
      }
    }
    setSibuk(false);
    useAi
      .getState()
      .setToast(
        gagal === 0
          ? tr('All changes undone')
          : `${tf('{n} files could not be undone', { n: gagal })} — ${pesanGagal}`,
      );
  };

  /* Keep All = accept what is on disk. The list empties, so the section
     disappears; nothing is written, because the files already hold the kept
     version. */
  const keepAll = () => {
    if (sibuk) return;
    for (const b of [...useDiff.getState().berkas]) useDiff.getState().buang(b.path);
    useAi.getState().setToast(tr('Changes kept'));
  };

  const bukaDiff = (path: string) => {
    useDiff.getState().pilih(path);
    useStore.getState().bukaViewAi('diff-view');
  };

  /* Kalimat status strip: angka berkas saat tab berkas aktif, hitungan antrian
     saat queue, kalimat rencana saat todo. */
  const statusTeks =
    tabAktif === 'berkas'
      ? (tabAktifData?.judul ?? judulBerkasLabel(berkas.length, tr))
      : tabAktif === 'queue'
        ? tf('{n} pesan mengantre', { n: antrian.length })
        : adaTodos
          ? semuaSelesai
            ? tr('Misi selesai')
            : tr('Task list')
          : (tabAktifData?.judul ?? '');

  return (
    <section
      className="ai-review"
      data-testid="ai-review"
      data-open={buka ? '1' : '0'}
    >
      {/* Panel drop-up: dirender hanya saat terbuka, melayang di atas strip. */}
      {buka && (
        <div className="ai-review-badan" data-tab={tabAktif}>
          {tabAktif === 'todo' && adaTodos && (
            <div className="ai-review-todos" data-testid="ai-review-todos">
              {todos.map((t, i) => (
                <div className={`ai-review-todo is-${t.status}`} key={t.id ?? i}>
                  <span className="ai-review-todo-cek" aria-hidden="true">
                    {t.status === 'done' ? (
                      <svg width="12" height="12" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="7.2" fill="var(--success)" />
                        <path
                          d="M5 8.2l2 2 4-4.4"
                          stroke="var(--bg0)"
                          strokeWidth="1.8"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : t.status === 'in_progress' ? (
                      <span className="ai-review-todo-spin" />
                    ) : (
                      <span className="ai-review-todo-pend" />
                    )}
                  </span>
                  <span className="ai-review-todo-label" title={t.content}>
                    {t.content}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tabAktif === 'berkas' && adaBerkas && (
            <div className="ai-review-berkas" data-testid="ai-review-berkas">
              <div className="ai-review-gulir">
                {berkas.map((b) => {
                  const nama = b.path.split(/[\\/]/).pop() ?? b.path;
                  return (
                    <button
                      type="button"
                      className="ai-review-baris"
                      data-testid="ai-review-baris"
                      key={b.path}
                      title={b.path}
                      onClick={() => bukaDiff(b.path)}
                    >
                      <span className="ai-review-berkas-ikon" aria-hidden="true">
                        <FileIkon nama={nama} />
                      </span>
                      <span className="ai-review-nama">{nama.replace(/\.[^.]+$/, '') || nama}</span>
                      <span className="ai-review-dir">.{b.path.replace(/\\/g, '/')}</span>
                      <span className="ai-review-stat">
                        <span className="ai-ubah-tambah">+{b.tambah}</span>
                        <span className="ai-ubah-hapus">−{b.hapus}</span>
                      </span>
                      <span className="ai-review-baris-diff" aria-hidden="true">
                        <AiIkon name="diff" size={11} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tabAktif === 'queue' && adaAntrian && (
            <div className="ai-review-queue" data-testid="ai-review-queue">
              <div className="ai-review-gulir">
                {antrian.map((a, i) => (
                  <div className="ai-review-antrian" key={a.id ?? i}>
                    <span className="ai-review-antrian-no" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="ai-review-antrian-teks" title={a.teks}>
                      {a.teks}
                    </span>
                    {a.images.length > 0 && (
                      <span className="ai-review-antrian-img">
                        <AiIkon name="image" size={11} />
                        {a.images.length}
                      </span>
                    )}
                    {/*
                      * Kirim per baris - aksi yang dicari lebih dulu daripada
                      * hapus, jadi ia di depan tombol buang. `sekarang: true`
                      * memotong giliran yang sedang jalan dan mengirim baris ini
                      * (lihat `kirimAntrian` di aiStore); tanpa itu, menekan
                      * kirim saat sibuk tidak melakukan apa pun.
                      */}
                    <button
                      type="button"
                      className="ai-review-antrian-kirim"
                      data-testid={`ai-review-antrian-kirim-${i}`}
                      title={tr('Send this now')}
                      aria-label={tr('Send this now')}
                      onClick={() => void kirimAntrian(i, composerId, { sekarang: true })}
                    >
                      <AiIkon name="send" size={11} />
                    </button>
                    <button
                      type="button"
                      className="ai-review-antrian-buang"
                      title={tr('Hapus dari antrian')}
                      aria-label={tr('Hapus dari antrian')}
                      onClick={() => buangAntrian(a.id ?? i, composerId)}
                    >
                      <AiIkon name="close" size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="ai-review-antrian-bersih"
                onClick={() => kosongkanAntrian(composerId)}
              >
                {tr('Kosongkan antrian')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Strip: deretan TAB + kalimat status + aksi + dismiss. */}
      <div className="ai-review-kaki">
        <div className="ai-review-kaki-ikon">
          {tabHidup.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`ai-review-mark${tabAktif === t.id && buka ? ' is-aktif' : ''}`}
              data-testid={`ai-review-tab-${t.id}`}
              title={t.judul}
              onClick={() => {
                if (tabAktif === t.id && buka) setBuka(false);
                else {
                  setTabDipilih(t.id);
                  setBuka(true);
                }
              }}
            >
              {t.ikon}
            </button>
          ))}
        </div>
        {/* Kalimat status = tombol buka/tutup drop-up. */}
        <button
          type="button"
          className="ai-review-status"
          aria-expanded={buka}
          onClick={() => setBuka((v) => !v)}
        >
          {statusTeks}
        </button>
        <div className="ai-review-aksi">
          {tabAktif === 'berkas' && adaBerkas && (
            <>
              <button
                type="button"
                className="ai-review-undo"
                data-testid="ai-review-undo"
                disabled={sibuk}
                onClick={() => void undoAll()}
              >
                {sibuk ? tr('Undoing…') : tr('Undo All')}
              </button>
              <button
                type="button"
                className="ai-review-keep"
                data-testid="ai-review-keep"
                disabled={sibuk}
                onClick={keepAll}
              >
                {tr('Keep All')}
              </button>
            </>
          )}
          <button
            type="button"
            className="ai-review-tutup"
            data-testid="ai-review-tutup"
            title={tr('Tutup kartu ini')}
            aria-label={tr('Tutup kartu ini')}
            onClick={() => setDitutup(true)}
          >
            <AiIkon name="close" size={11} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* Judul berkas untuk pemakaian di luar TABS (menghindari duplikasi tata bahasa). */
function judulBerkasLabel(n: number, tr: (k: string) => string): string {
  return n === 1 ? tr('1 file to review') : tf('{n} files to review', { n });
}
