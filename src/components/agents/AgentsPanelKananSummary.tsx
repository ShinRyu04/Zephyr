import { useMemo, useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import { findModel } from '../../lib/modelCatalog';
import type { AgentToolRun } from '../../lib/types';
import AiIkon from '../ai/AiIkon';
import { useT } from '../../lib/i18n';

/*
 * Task Summary di panel kanan.
 *
 * Bentuknya mengikuti Task Summary TRAE (permintaan user, 23 Okt 2026):
 * dua section yang bisa dilipat — "Todo" dan "Context" — dengan Context berisi
 * chip `compact`, meter pemakaian konteks, serta tab Files / Other.
 *
 * Aturan yang dipegang di sini: TIDAK ADA angka karangan.
 *
 * - Persentase hanya muncul kalau provider benar-benar melaporkan pemakaian
 *   token untuk giliran terakhir DAN batas konteks model itu diketahui. Kalau
 *   salah satunya tidak ada, bar diganti satu kalimat jujur — bukan 0% dan bukan
 *   angka tebakan dari jumlah karakter.
 * - Daftar berkas diturunkan dari argumen tool yang benar-benar dijalankan pada
 *   sesi ini (read_file / write_file / multi_edit / grep / glob / list_directory
 *   dan sejenisnya), bukan dari daftar tab yang kebetulan terbuka.
 *
 * `compact` di sini punya arti yang bisa dibuktikan: ia memadatkan baris daftar
 * (nama saja, tanpa folder induk). Ia tidak meringkas percakapan — tombol yang
 * menjanjikan pemadatan konteks tapi tidak melakukannya lebih buruk daripada
 * tidak ada tombol.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  in_progress: 'Running',
  done: 'Done',
};

/** Nama tool yang argumennya menunjuk satu berkas di disk. */
const ALAT_BERKAS =
  /(read_file|write_file|multi_edit|edit_file|delete_file|move_file|copy_file|list_directory|grep|glob|read_multiple_files|replace_in_files)/i;

/**
 * Ambil path berkas dari argumen tool.
 *
 * Argumen datang sebagai string JSON (lihat `AgentToolRun.args`), jadi parsing
 * bisa gagal pada transkrip lama atau pada tool yang argumennya bukan objek.
 * Kegagalan berarti "bukan berkas", bukan alasan menjatuhkan panel.
 */
function pathDariAlat(t: AgentToolRun): string | null {
  if (!ALAT_BERKAS.test(t.name)) return null;
  let arg: unknown;
  try {
    arg = JSON.parse(t.args);
  } catch {
    return null;
  }
  if (!arg || typeof arg !== 'object') return null;
  const obj = arg as Record<string, unknown>;
  for (const kunci of ['path', 'file', 'filePath', 'target', 'source']) {
    const nilai = obj[kunci];
    if (typeof nilai === 'string' && nilai.trim()) return nilai.trim();
  }
  /* `grep`/`glob` memakai `files` berupa daftar; ambil yang pertama saja supaya
     satu baris tidak berubah jadi satu berkas palsu. */
  const banyak = obj.files;
  if (Array.isArray(banyak)) {
    const pertama = banyak.find((x) => typeof x === 'string' && x.trim());
    if (typeof pertama === 'string') return pertama.trim();
  }
  return null;
}

function pecahPath(p: string): { nama: string; induk: string } {
  const bagian = p.split(/[\\/]+/).filter(Boolean);
  const nama = bagian[bagian.length - 1] ?? p;
  return { nama, induk: bagian.slice(0, -1).join('/') };
}

export default function AgentsPanelKananSummary({ bar }: { bar?: ReactNode | null }) {
  const tr = useT();
  const todos = useAi((s) => s.agentTodos);
  const sid = useAi((s) => s.activeIds.agents ?? null);
  const sesi = useAi((s) => (sid ? s.sessions.find((x) => x.id === sid) ?? null : null));

  const [todoBuka, setTodoBuka] = useState(true);
  const [contextBuka, setContextBuka] = useState(true);
  const [padat, setPadat] = useState(false);
  const [tab, setTab] = useState<'files' | 'other'>('files');

  const ringkas = useMemo(() => {
    const pesan = sesi?.messages ?? [];

    /*
     * Pemakaian token giliran terakhir, dibaca dari BELAKANG: hanya assistant
     * yang membawa `usage`, dan yang paling baru adalah yang menggambarkan isi
     * konteks saat ini. `input + output` karena keduanya menempati jendela
     * konteks pada permintaan berikutnya.
     */
    let terpakai = 0;
    for (let i = pesan.length - 1; i >= 0; i -= 1) {
      const u = pesan[i].usage;
      if (u && (u.input > 0 || u.output > 0)) {
        terpakai = u.input + u.output;
        break;
      }
    }

    const batas = sesi?.model ? (findModel(sesi.model, sesi.provider)?.ctx ?? 0) : 0;
    const persen =
      batas > 0 && terpakai > 0 ? Math.max(1, Math.min(100, Math.round((terpakai / batas) * 100))) : null;

    /* Berkas unik, urut kemunculan pertama (bukan urutan abjad: yang pertama
       disentuh biasanya yang paling relevan dengan tugasnya). */
    const peta = new Map<string, { path: string; nama: string; induk: string; kali: number }>();
    const tambah = (p: string) => {
      const ada = peta.get(p);
      if (ada) {
        ada.kali += 1;
        return;
      }
      peta.set(p, { path: p, ...pecahPath(p), kali: 1 });
    };

    let gambar = 0;
    for (const m of pesan) {
      if (m.attached?.path) tambah(m.attached.path);
      if (m.images?.length) gambar += m.images.length;
      for (const t of m.tools ?? []) {
        const p = pathDariAlat(t);
        if (p) tambah(p);
      }
    }

    return {
      terpakai,
      batas,
      persen,
      berkas: [...peta.values()].slice(0, 60),
      gambar,
    };
  }, [sesi]);

  const belumSelesai = todos.filter((t) => t.status !== 'done').length;

  return (
    <>
      {bar}
      <div className="agx-view-isi agx-ts" data-testid="agx-summary-view">
        <div className="agx-ts-gulir">
          {/* ---------------- Todo ---------------- */}
          <section className="agx-ts-sec" data-testid="agx-summary-todo-sec">
            <div className="agx-ts-head">
              <button
                className="agx-ts-toggle"
                aria-expanded={todoBuka}
                aria-controls="agx-ts-todo"
                onClick={() => setTodoBuka((v) => !v)}
              >
                <AiIkon name={todoBuka ? 'chev-down' : 'chev-right'} size={13} />
                <span>{tr('Todo')}</span>
                {todos.length > 0 && (
                  <span className="agx-ts-jumlah">
                    {todos.length - belumSelesai}/{todos.length}
                  </span>
                )}
              </button>
            </div>

            {todoBuka &&
              (todos.length === 0 ? (
                <div className="agx-ts-kosong" id="agx-ts-todo" data-testid="agx-summary-kosong">
                  <span className="agx-ts-kosong-ikon" aria-hidden="true">
                    <AiIkon name="list" size={16} />
                  </span>
                  <b>{tr('No todos yet')}</b>
                  <span>{tr('Progress for complex tasks will appear here')}</span>
                </div>
              ) : (
                <ul className="agx-ts-todos" id="agx-ts-todo" data-testid="agx-summary-todos">
                  {todos.map((t, i) => (
                    <li key={t.id ?? i} className={`agx-ts-todo is-${t.status}`}>
                      <span className="agx-ts-status">{tr(STATUS_LABEL[t.status] ?? t.status)}</span>
                      <span className="agx-ts-todo-teks">{t.content}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </section>

          {/* ---------------- Context ---------------- */}
          <section className="agx-ts-sec" data-testid="agx-summary-context-sec">
            <div className="agx-ts-head">
              <button
                className="agx-ts-toggle"
                aria-expanded={contextBuka}
                aria-controls="agx-ts-context"
                onClick={() => setContextBuka((v) => !v)}
              >
                <AiIkon name={contextBuka ? 'chev-down' : 'chev-right'} size={13} />
                <span>{tr('Context')}</span>
              </button>
              <span
                className="agx-ts-info"
                role="img"
                aria-label={tr('How the context figure is measured')}
                title={tr(
                  'The last turn\u2019s input + output tokens against the model\u2019s context window. Shown only when the provider reports usage.',
                )}
              >
                i
              </span>
              <button
                className={`agx-ts-compact${padat ? ' is-on' : ''}`}
                aria-pressed={padat}
                title={tr('Show file rows without their parent folder')}
                onClick={() => setPadat((v) => !v)}
              >
                {tr('compact')}
              </button>
            </div>

            {contextBuka && (
              <div id="agx-ts-context">
                {ringkas.persen !== null ? (
                  <div className="agx-ts-meter" data-testid="agx-summary-meter">
                    <div
                      className="agx-ts-bar"
                      role="progressbar"
                      aria-valuenow={ringkas.persen}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={tr('Context used')}
                    >
                      <span style={{ width: `${ringkas.persen}%` }} />
                    </div>
                    <span className="agx-ts-persen">{ringkas.persen}%</span>
                  </div>
                ) : (
                  <div className="agx-ts-catatan" data-testid="agx-summary-meter-kosong">
                    {tr('Token usage is not reported for this model, so there is no figure to show.')}
                  </div>
                )}

                <div className="agx-ts-tabs" role="tablist" aria-label={tr('Context items')}>
                  <button
                    role="tab"
                    aria-selected={tab === 'files'}
                    className={`agx-ts-tab${tab === 'files' ? ' is-aktif' : ''}`}
                    onClick={() => setTab('files')}
                  >
                    {tr('Files')}
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'other'}
                    className={`agx-ts-tab${tab === 'other' ? ' is-aktif' : ''}`}
                    onClick={() => setTab('other')}
                  >
                    {tr('Other')}
                  </button>
                </div>

                {tab === 'files' ? (
                  ringkas.berkas.length === 0 ? (
                    <div className="agx-ts-kosong-kecil">{tr('No files in context yet')}</div>
                  ) : (
                    <ul
                      className={`agx-ts-files${padat ? ' is-compact' : ''}`}
                      data-testid="agx-summary-files"
                    >
                      {ringkas.berkas.map((b) => (
                        <li key={b.path} className="agx-ts-file" title={b.path}>
                          <span className="agx-ts-file-ikon" aria-hidden="true">
                            <AiIkon name="file" size={13} />
                          </span>
                          <span className="agx-ts-file-nama">{b.nama}</span>
                          {b.induk && <span className="agx-ts-file-dir">{b.induk}</span>}
                        </li>
                      ))}
                    </ul>
                  )
                ) : ringkas.gambar === 0 ? (
                  <div className="agx-ts-kosong-kecil">{tr('No other context yet')}</div>
                ) : (
                  <ul className={`agx-ts-files${padat ? ' is-compact' : ''}`} data-testid="agx-summary-other">
                    <li className="agx-ts-file">
                      <span className="agx-ts-file-ikon" aria-hidden="true">
                        <AiIkon name="image" size={13} />
                      </span>
                      <span className="agx-ts-file-nama">
                        {ringkas.gambar === 1
                          ? `1 ${tr('image attachment')}`
                          : `${ringkas.gambar} ${tr('image attachments')}`}
                      </span>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
