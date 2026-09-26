import SubAgentPanel from '../ai/SubAgentPanel';
import SubAgentBar from '../ai/SubAgentBar';
import ModelSelector from '../ai/ModelSelector';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';

export default function SubAgentView() {
  const tr = useT();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const ringkasan = useSubAgent((s) => s.ringkasan);
  const bersihkan = useSubAgent((s) => s.bersihkan);
  const batalSemua = useSubAgent((s) => s.batalSemua);

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  return (
    <div className="sav-root" data-testid="subagents-view">
      {/* Kepala: ringkasan angka + aksi batch. Angka dulu, aksi di kanan -
          supaya mata mendarat di status sebelum tombol. */}
      <div className="sav-head">
        <span className="sav-judul">{tr('Subagent')}</span>
        <span className="sav-angka" data-testid="sav-angka">
          {agents.length} {tr('total')}
          {jalan > 0 && <> · <b className="is-jalan">{jalan} {tr('running')}</b></>}
          {beres > 0 && <> · <b className="is-beres">{beres} {tr('done')}</b></>}
          {gagal > 0 && <> · <b className="is-gagal">{gagal} {tr('failed')}</b></>}
        </span>
        {/* Pemilih MODEL subagent. Ditaruh di kepala tab (bukan di Settings)
            supaya bisa diganti saat sedang memantau hasil - sama seperti
            pemilih model chat yang duduk di kepala panel AI. */}
        <span className="sav-model" data-testid="sav-model">
          <ModelSelector target="subagent" />
        </span>
        <span className="sav-spacer" />
        {sibuk ? (
          <button className="btn btn-sm" data-testid="sav-stop" onClick={batalSemua}>
            {tr('Stop all')}
          </button>
        ) : (
          agents.length > 0 && (
            <button className="btn btn-sm" data-testid="sav-clear" onClick={bersihkan}>
              {tr('Clear')}
            </button>
          )
        )}
      </div>

      {/* The parallel-task form always stays open on this tab: this is its home.
          No more open/close buttons piling up in the chat. */}
      <SubAgentBar selaluTerbuka />

      {agents.length === 0 ? (
        <div className="sav-kosong" data-testid="sav-kosong">
          <p className="sav-kosong-judul">{tr('No subagents yet.')}</p>
          <p className="sav-kosong-note">
            {tr(
              'Write one task per line above, then Run. Each line becomes one subagent that works concurrently.',
            )}
          </p>
          <p className="sav-kosong-note">
            {tr(
              'Subagents are standalone - run from here, separate from the AI conversation. Their results do not go into the chat history.',
            )}
          </p>
        </div>
      ) : (
        <SubAgentPanel polos />
      )}

      {ringkasan && !sibuk && (
        <details className="sav-ringkas" data-testid="sav-ringkas">
          <summary>{tr('Combined summary')}</summary>
          <pre>{ringkasan}</pre>
        </details>
      )}
    </div>
  );
}
