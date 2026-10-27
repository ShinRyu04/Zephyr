import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';

/*
 * Panel "Plan" di kolom kanan Agent window.
 *
 * Dibuka dari kartu Plan di transkrip ("View full plan"): rencana tidak
 * melebar ke bawah di dalam chat, melainkan pindah ke panel di SEBELAHnya -
 * bentuk yang sama dengan produk rujukan. Isinya pesan plan TERAKHIR dari
 * sesi aktif permukaan `agents`; rencana revisi (pesan plan baru) otomatis
 * menggantikan tampilan ini karena pembacaannya ikut store.
 */
export default function AgentsPanelKananPlan() {
  const tr = useT();
  /* Sesi aktif permukaan agents - kunci yang sama dengan composer-nya. */
  const sid = useAi((s) => s.activeIds.agents ?? s.activeId);
  const pesanPlan = useAi((s) => {
    const ses = s.sessions.find((x) => x.id === sid);
    const plans = ses?.messages.filter((m) => m.plan && m.content) ?? [];
    return plans[plans.length - 1]?.content ?? '';
  });

  return (
    <div className="agx-plan-panel" data-testid="agx-plan-panel">
      <div className="agx-plan-panel-kepala">
        <span className="agx-plan-panel-ikon" aria-hidden="true">
          <AiIkon name="clipboard" size={13} />
        </span>
        <span className="agx-plan-panel-judul">{tr('Plan')}</span>
      </div>
      {pesanPlan.trim() ? (
        <div className="agx-plan-panel-isi">
          <Markdown remarkPlugins={[remarkGfm]}>{pesanPlan}</Markdown>
        </div>
      ) : (
        <div className="agx-plan-panel-kosong">{tr('Belum ada plan')}</div>
      )}
    </div>
  );
}
