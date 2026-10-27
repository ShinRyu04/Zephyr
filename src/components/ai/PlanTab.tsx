import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * Tab editor "Plan" di jendela utama: hasil "View full plan" pada kartu plan.
 * Isinya pesan plan TERAKHIR dari sesi utama (permukaan ''); rencana revisi
 * otomatis menggantikan tampilan karena pembacaannya ikut store.
 */
export default function PlanTab() {
  const tr = useT();
  const pesanPlan = useAi((s) => {
    const sid = s.activeIds[''] ?? s.activeId;
    const ses = s.sessions.find((x) => x.id === sid);
    const plans = ses?.messages.filter((m) => m.plan && m.content) ?? [];
    return plans[plans.length - 1]?.content ?? '';
  });

  return (
    <div className="ai-plan-tab" data-testid="ai-plan-tab">
      <div className="ai-plan-tab-kepala">
        <span className="ai-plan-tab-ikon" aria-hidden="true">
          <AiIkon name="clipboard" size={13} />
        </span>
        <span className="ai-plan-tab-judul">{tr('Plan')}</span>
      </div>
      {pesanPlan.trim() ? (
        <div className="ai-plan-tab-isi">
          <Markdown remarkPlugins={[remarkGfm]}>{pesanPlan}</Markdown>
        </div>
      ) : (
        <div className="ai-plan-tab-kosong">{tr('Belum ada plan')}</div>
      )}
    </div>
  );
}
