import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * Detail satu SubAgent - dipakai dua tempat dengan bentuk yang sama:
 *   - panel kanan Agent window (`AgentsPanelKananSubAgent`), dan
 *   - tab editor di jendela utama (`SubAgentTab`).
 * Dibuka dari baris SubAgent di transkrip ("klik baris = lihat kerjaannya").
 * Subagent yang disorot dibaca dari `subagentStore.sorotId`; kosong = yang
 * terakhir dibuat. Status/langkah LIVE mengikuti store.
 */
export default function SubAgentDetail() {
  const tr = useT();
  const sub = useSubAgent((s) => {
    const sorot = s.sorotId ? s.agents.find((a) => a.id === s.sorotId) : undefined;
    return sorot ?? s.agents[s.agents.length - 1];
  });

  if (!sub) {
    return (
      <div className="subagent-detail" data-testid="subagent-detail">
        <div className="subagent-detail-kosong">{tr('No subagent yet')}</div>
      </div>
    );
  }

  const statusLabel =
    sub.status === 'jalan'
      ? tr('Berjalan')
      : sub.status === 'selesai'
        ? tr('Selesai')
        : sub.status === 'gagal'
          ? tr('Gagal')
          : sub.status === 'batal'
            ? tr('Dibatalkan')
            : tr('Menunggu');

  return (
    <div className="subagent-detail" data-testid="subagent-detail">
      <div className="subagent-detail-kepala">
        <span className="subagent-detail-ikon" aria-hidden="true">
          <AiIkon name="robot" size={14} />
        </span>
        <div className="subagent-detail-nama">
          <b>SubAgent</b> <span className="subagent-detail-peran">{sub.customNama || sub.peran}</span>
        </div>
        <span className={`subagent-detail-status is-${sub.status}`}>{statusLabel}</span>
      </div>
      <div className="subagent-detail-tugas" title={sub.tugas}>
        {sub.tugas}
      </div>
      <div className="subagent-detail-langkah">
        {sub.langkah.map((l, i) => (
          <div key={i} className={`subagent-detail-langkah is-${l.kind}${l.ok === false ? ' is-gagal' : ''}`}>
            <span className="subagent-detail-langkah-mark" aria-hidden="true">
              {l.kind === 'pikir' ? '🧠' : '🛠'}
            </span>
            <span className="subagent-detail-langkah-teks">
              {l.kind === 'pikir' ? l.teks : `${l.nama ?? ''}${l.hasil ? ` — ${l.hasil}` : ''}`}
            </span>
          </div>
        ))}
        {sub.langkah.length === 0 && (
          <div className="subagent-detail-kosong-langkah">{tr('Belum ada langkah')}</div>
        )}
      </div>
      {sub.hasil && (
        <div className="subagent-detail-hasil">
          <div className="subagent-detail-hasil-judul">{tr('Result')}</div>
          <div className="subagent-detail-hasil-isi">{sub.hasil}</div>
        </div>
      )}
      {sub.error && <div className="subagent-detail-error">{sub.error}</div>}
    </div>
  );
}
