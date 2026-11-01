import { useState } from 'react';
import { useExperts } from '../../lib/expertsStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import { IkonCaret } from './expertsBuka';

/*
 * "Message queued N" versi EXPERTS (acuan 064955): daftar arahan yang dikirim
 * user SELAGI tim Experts berjalan. Isinya `run.steer` — beda makna dengan
 * `KartuAntrean` (pesan yang MENUNGGU giliran): di sini catatan SUDAH
 * diteruskan ke worker yang belum mulai dan ke laporan akhir, jadi tanda
 * "→ Steer" adalah penanda status (bukan tombol), dan satu-satunya aksi yang
 * jujur adalah menghapus catatan dari daftar (`hapusSteer`) — pekerjaan yang
 * sudah menerima arahan lewat prompt-nya tidak bisa ditarik kembali.
 */
export default function KartuAntreanExperts({ sessionId }: { sessionId: string | null }) {
  const tr = useT();
  const run = useExperts((s) =>
    s.runs.find((r) => r.sessionId === sessionId && r.status === 'jalan'),
  );
  const hapusSteer = useExperts((s) => s.hapusSteer);
  const [buka, setBuka] = useState(true);
  /* Menu "…" per baris (acuan 064955). Satu yang terbuka dalam satu waktu. */
  const [menu, setMenu] = useState<number | null>(null);

  if (!sessionId || !run || !run.steer?.length) return null;

  return (
    <section className="experts-kartu exp-steer" data-testid="experts-antrean">
      <button
        type="button"
        className="exp-todo-kepala"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <IkonCaret />
        <b>
          {tr('Message queued')} {run.steer.length}
        </b>
      </button>
      {buka && (
        <div className="exp-steer-daftar">
          {run.steer.map((teks, i) => (
            <div key={i} className="exp-steer-baris" data-testid={`experts-antrean-row-${i + 1}`}>
              <span className="exp-steer-genggam" aria-hidden="true">⠿</span>
              <span className="exp-steer-teks" title={teks}>{teks}</span>
              <span
                className="exp-steer-tanda"
                title={tr('Sent to workers that have not started yet, and to the final report.')}
              >
                → Steer
              </span>
              <button
                type="button"
                className="exp-steer-buang"
                title={tr('Remove this steering note from the list')}
                aria-label={tr('Remove this steering note from the list')}
                data-testid={`experts-antrean-buang-${i + 1}`}
                onClick={() => hapusSteer(run.id, i)}
              >
                <AiIkon name="trash" size={12} />
              </button>
              {/*
                * Tombol "…" di ujung baris (acuan 064955). Isinya aksi yang
                * sama dengan ikon yang sudah ada, ditambah hapus — jadi tidak
                * ada janji yang belum dipegang tombol lain.
                */}
              <span className="exp-steer-menu">
                <button
                  type="button"
                  className="exp-steer-more"
                  title={tr('More actions')}
                  aria-label={tr('More actions')}
                  aria-expanded={menu === i}
                  data-testid={`experts-antrean-more-${i + 1}`}
                  onClick={() => setMenu(menu === i ? null : i)}
                >
                  <AiIkon name="more" size={13} />
                </button>
                {menu === i && (
                  <span className="exp-steer-menu-daftar" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="exp-steer-menu-item is-bahaya"
                      data-testid={`experts-antrean-menu-hapus-${i + 1}`}
                      onClick={() => {
                        hapusSteer(run.id, i);
                        setMenu(null);
                      }}
                    >
                      <AiIkon name="trash" size={12} />
                      {tr('Remove')}
                    </button>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
