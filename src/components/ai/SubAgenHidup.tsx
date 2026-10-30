import { useEffect, useMemo, useState } from 'react';
import { useSubAgent } from '../../lib/subagentStore';
import { infoPeran } from '../../lib/subagentRoles';
import { bukaPanelAgx } from '../../lib/agxPanel';
import { useStore } from '../../lib/store';
import { useT, useTf } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * Ringkas argumen tool langkah subagent jadi satu sasaran pendek: path /
 * pattern / command, apa pun yang ada. Pola yang sama dengan `ringkas` di
 * ExpertsTimeline supaya dua tempat menampilkan langkah yang sama dengan cara
 * yang sama.
 */
function ringkas(args: string | undefined): string {
  if (!args) return '';
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    const kandidat = o.path ?? o.pattern ?? o.command ?? o.query ?? '';
    const teks = String(kandidat).split('\n')[0];
    return teks.length > 50 ? `${teks.slice(0, 50)}…` : teks;
  } catch {
    return args.slice(0, 50);
  }
}

/*
 * Lipatan "Bekerja untuk Ns" ala ZCode — subagent yang HIDUP untuk sesi chat
 * ini, dirender DI DALAM alur chat (dulu: section Background di work-stack di
 * atas composer). Selama ada agent yang jalan/menunggu fold terbuka; begitu
 * semua agent mencapai status terminal, fold tetap dirender tapi terlipat
 * otomatis - kwitansi ringkas bahwa batch ini pernah bekerja, tanpa memakan
 * tinggi layar.
 */
export default function SubAgenHidup({
  permukaan,
  sessionId,
}: {
  permukaan: 'main' | 'agents';
  sessionId: string | null;
}) {
  const tr = useT();
  const tf = useTf();
  const agents = useSubAgent((s) => s.agents);
  const sesiId = useSubAgent((s) => s.sesiId);
  const sorot = useSubAgent((s) => s.sorot);

  /* Baris yang masih hidup: sedang jalan atau masih antre. */
  const hidup = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu');
  /*
   * Batch terikat ke sesi yang MEMULAINYA (`sesiId` ditulis saat `jalankan`),
   * jadi panel editor dan kolom kanan tidak saling menampilkan pekerjaan
   * satu sama lain.
   */
  const terikat = sesiId !== null && sesiId === sessionId && agents.length > 0;

  /*
   * Default terbuka selama ada yang jalan, lipat otomatis saat selesai.
   * Efek ini hanya menyala saat JUMLAH agent hidup berubah, jadi lipatan
   * manual user saat run masih berjalan tidak langsung dibuka paksa lagi.
   */
  const [buka, setBuka] = useState(hidup.length > 0);
  useEffect(() => {
    setBuka(hidup.length > 0);
  }, [hidup.length]);

  /*
   * Detik berjalan: dihitung dari `mulai` TERAWAL agent yang masih jalan,
   * bertik setiap detik HANYA selama batch masih hidup - selesai berarti
   * angkanya membeku (kwitansi), bukan terus menghitung tanpa makna.
   */
  const [kini, setKini] = useState(() => Date.now());
  useEffect(() => {
    if (hidup.length === 0) return;
    setKini(Date.now());
    const t = window.setInterval(() => setKini(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hidup.length]);

  const detik = useMemo(() => {
    if (agents.length === 0) return 0;
    if (hidup.length > 0) {
      const awal = Math.min(...hidup.map((a) => a.mulai));
      return Math.max(0, Math.round((kini - awal) / 1000));
    }
    /* Semua terminal: rentang penuh batch, dari mulai pertama ke selesai
       terakhir - angka yang sama yang terbaca saat run berhenti. */
    const awal = Math.min(...agents.map((a) => a.mulai));
    const akhir = Math.max(...agents.map((a) => a.selesai ?? kini));
    return Math.max(0, Math.round((akhir - awal) / 1000));
  }, [agents, hidup.length, kini]);

  if (!terikat) return null;

  return (
    <div className={`exp-live${buka ? ' is-buka' : ''}`} data-testid="exp-live">
      <button
        type="button"
        className="exp-live-kepala"
        data-testid="exp-live-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="experts-progress-caret" aria-hidden="true">▾</span>
        <b>{tf('Bekerja untuk {n}s', { n: detik })}</b>
        <span className="experts-progress-badge" aria-hidden="true">
          {hidup.length}
        </span>
      </button>
      {buka && (
        <div className="exp-live-daftar" data-testid="exp-live-list">
          {hidup.map((a) => {
            const langkahTerakhir = a.langkah[a.langkah.length - 1];
            const narasi =
              a.status === 'jalan' && langkahTerakhir
                ? langkahTerakhir.kind === 'tool'
                  ? `${langkahTerakhir.nama ?? ''} ${ringkas(langkahTerakhir.args)}`.trim()
                  : (langkahTerakhir.teks ?? '').slice(0, 80)
                : '';
            return (
              <div key={a.id} className="exp-live-baris">
                <button
                  type="button"
                  className="exp-live-row"
                  data-testid="exp-live-agent"
                  title={a.tugas}
                  onClick={() => {
                    /*
                     * Klik = buka detail agent, persis baris SubAgent di chat:
                     * tandai idnya di store, lalu panel kanan (jendela Agents)
                     * atau tab editor (jendela utama).
                     */
                    sorot(a.id);
                    if (permukaan === 'agents') bukaPanelAgx('subagent');
                    else void useStore.getState().bukaViewAi('subagent');
                  }}
                >
                  <span className="exp-live-ikon" aria-hidden="true">
                    <AiIkon name="robot" size={12} />
                  </span>
                  <span className="exp-live-label">SubAgen</span>
                  <span className="exp-live-peran">
                    {a.customNama || infoPeran(a.peran)?.label || a.peran}
                  </span>
                  <span className="exp-live-tugas">{a.tugas}</span>
                  {a.status === 'jalan' ? (
                    <span className="experts-spin" aria-hidden="true" />
                  ) : (
                    <span className="exp-live-tunggu">{tr('waiting')}</span>
                  )}
                </button>
                {narasi && <div className="exp-live-langkah">{narasi}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
