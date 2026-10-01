import { useSubAgent } from '../../lib/subagentStore';
import { infoPeran } from '../../lib/subagentRoles';
import { pathIkonPeran } from '../../lib/peranIcons';
import { useLayoutCustom } from '../../lib/layoutStore';
import { useT } from '../../lib/i18n';
import { usePanel } from '../../lib/panelStore';

interface SubAgentInfoProps {
  variant?: 'panel' | 'popover';
  onDismiss?: () => void;
}

export default function SubAgentInfo({ variant = 'panel', onDismiss }: SubAgentInfoProps = {}) {
  const tr = useT();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const setSubKanan = useLayoutCustom((s) => s.setSubKanan);
  const simpan = useLayoutCustom((s) => s.simpan);

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  const tutup = () => {
    if (variant === 'popover') {
      onDismiss?.();
      return;
    }
    setSubKanan(false);
    void simpan();
  };

  const bukaPanel = () => {
    usePanel.getState().focusTab('subagents');
    onDismiss?.();
  };

  const langkahTerakhir = (a: (typeof agents)[number]) => {
    const l = a.langkah[a.langkah.length - 1];
    if (!l) return a.status === 'menunggu' ? tr('waiting') : '…';
    if (l.kind === 'tool') return l.nama || '…';

    return (l.teks ?? '').split(/[\r\n]+/)[0].slice(0, 90) || '…';
  };

  return (
    <div
      className={`sai-root${variant === 'popover' ? ' is-popover' : ''}`}
      data-testid={variant === 'popover' ? 'ai-subagents-popover' : 'sai-root'}
    >
      <div className="sai-head">
        <span className="sai-judul">{tr(variant === 'popover' ? 'Subagents' : 'Subagent')}</span>
        <span className="sai-angka" data-testid="sai-angka">
          {agents.length > 0 ? (
            <>
              {jalan > 0 && <b className="is-jalan">{jalan} {tr('running')}</b>}
              {jalan > 0 && (beres > 0 || gagal > 0) && ' · '}
              {beres > 0 && <b className="is-beres">{beres} {tr('done')}</b>}
              {beres > 0 && gagal > 0 && ' · '}
              {gagal > 0 && <b className="is-gagal">{gagal} {tr('failed')}</b>}
            </>
          ) : (
            <span className="sai-sepi">{tr('none yet')}</span>
          )}
        </span>
        <button
          className="sai-x"
          data-testid="sai-tutup"
          title={tr(variant === 'popover' ? 'Close subagents' : 'Hide the subagent info panel')}
          aria-label={tr(variant === 'popover' ? 'Close subagents' : 'Hide the subagent info panel')}
          onClick={tutup}
        >
          ✕
        </button>
      </div>

      <div className="sai-list" data-testid="sai-list">
        {agents.length === 0 ? (
          <p className="sai-kosong" data-testid="sai-kosong">
            {tr('No subagent is running. Open the Subagents tab in the bottom panel to run tasks in parallel.')}
          </p>
        ) : (
          agents.map((a) => {

            const p = infoPeran(a.peran);
            return (
              <div
                key={a.id}
                className={`sai-item is-${a.status}`}
                data-testid={`sai-item-${a.id}`}
                data-status={a.status}
              >
                <div className="sai-baris">
                  <span className={`sai-dot is-${a.status}`} aria-hidden="true" />
                  <span className="sai-nama">{a.nama}</span>
                  <span className="sai-peran" title={p ? tr(p.label) : ''}>
                    {p ? (
                      <>
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={pathIkonPeran(p.ikon)} />
                        </svg>
                        {tr(p.label)}
                      </>
                    ) : (
                      '-'
                    )}
                  </span>
                </div>
                <div className="sai-langkah" title={langkahTerakhir(a)}>
                  {langkahTerakhir(a)}
                </div>
                <div className="sai-meta">
                  <span>{a.langkah.length} {tr('steps')}</span>
                  <span
                    title={a.routingReason}
                    aria-label={`${a.modelSource}: ${a.provider}/${a.model}. ${a.routingReason}`}
                  >
                    {a.provider}/{a.model} · {a.modelSource === 'auto' ? 'auto' : a.modelSource === 'chat-fallback' ? 'fallback' : 'manual'}
                  </span>
                  {a.status === 'jalan' && <span className="sai-live">{tr('running')}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sai-foot">
        {variant === 'popover' && (
          <button className="btn btn-sm" data-testid="ai-subagents-open-panel" onClick={bukaPanel}>
            {tr('Open Subagents panel')}
          </button>
        )}
        {sibuk ? (
          <button className="btn btn-sm" data-testid="sai-stop" onClick={batalSemua}>
            {tr('Stop all')}
          </button>
        ) : variant === 'panel' ? (
          <span className="sai-hint">
            {tr('Info panel - full details are in the Subagents tab.')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
