import SubAgentPanel from '../ai/SubAgentPanel';
import SubAgentBar from '../ai/SubAgentBar';
import SubSummary from '../ai/SubSummary';
import ModelSelector from '../ai/ModelSelector';
import { useSubAgent, batasParalel } from '../../lib/subagentStore';
import { useT, useTf } from '../../lib/i18n';
import { useEffect } from 'react';

export default function SubAgentView() {
  const tr = useT();
  const tf = useTf();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const bersihkan = useSubAgent((s) => s.bersihkan);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const muatTersimpan = useSubAgent((s) => s.muatTersimpan);

  const maks = batasParalel();

  // Bring back the last batch after a restart, so a long run's result is not
  // lost when the window is closed.
  useEffect(() => {
    muatTersimpan();
  }, [muatTersimpan]);

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  return (
    <div className="sav-root" data-testid="subagents-view">
      {/*
       * The header is one line: title, the counts, then the batch action.
       *
       * The group strip that used to sit below it is gone. It repeated the same
       * counts and the same "max N" in its own row with its own divider, so the
       * tab opened with two stacked headers and three horizontal rules before
       * any content — which is what made the top of the panel read as clutter.
       * The counts live here, once.
       */}
      <div className="sav-head">
        <span className="sav-judul">{tr('Subagent')}</span>
        <span className="sav-angka" data-testid="sav-angka">
          {agents.length} {tr('total')}
          {jalan > 0 && <> · <b className="is-jalan">{jalan} {tr('running')}</b></>}
          {beres > 0 && <> · <b className="is-beres">{beres} {tr('done')}</b></>}
          {gagal > 0 && <> · <b className="is-gagal">{gagal} {tr('failed')}</b></>}
        </span>
        <span className="sav-maks" data-testid="sav-maks">
          {tf('max {n}', { n: maks })}
        </span>
        <span className="sav-spacer" />
        {/*
         * The model picker sits in the header so it is always reachable.
         *
         * It lives in the form footer too, but that form folds itself once a
         * batch exists (it is 125px in a 231px panel), which took the picker off
         * screen exactly when a user wants to change the model for the next run.
         * The header version is the same control bound to the same setting, so
         * the two stay in sync.
         */}
        <span className="sav-model" data-testid="sav-model">
          <ModelSelector target="subagent" />
        </span>
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

      <SubSummary className="sav-ringkas" />
    </div>
  );
}
