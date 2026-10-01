import { useEffect } from 'react';
import { useCliAgent } from '../../lib/cliAgentStore';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

export default function CliAgentBar() {
  const tr = useT();
  const agents = useCliAgent((s) => s.agents);
  const aktif = useCliAgent((s) => s.aktif);
  const sibuk = useCliAgent((s) => s.sibuk);
  const detect = useCliAgent((s) => s.detect);
  const setAktif = useCliAgent((s) => s.setAktif);
  const agentMode = useAi((s) => s.agentMode);

  useEffect(() => {
    void detect();
  }, [detect]);

  const adaYangTerpasang = agents.some((a) => a.terpasang);
  if (!adaYangTerpasang) return null;

  return (
    <div className="ai-cli-bar" data-testid="ai-cli-bar" role="group"
      aria-label={tr('AI path')}>
      <button
        className={`ai-cli-chip${aktif === null ? ' is-on' : ''}`}
        data-testid="ai-cli-native"
        title={tr('Use the API adapter (requires an API key)')}
        onClick={() => setAktif(null)}
      >
        {tr('Native')}
      </button>
      {agents.map((a) => {
        const bisa = a.terpasang && a.login;
        return (
          <button
            key={a.id}
            className={`ai-cli-chip${aktif === a.id ? ' is-on' : ''}${bisa ? '' : ' is-off'}`}
            data-testid={`ai-cli-${a.id}`}
            data-terpasang={a.terpasang}
            data-login={a.login}
            disabled={!bisa || sibuk}
            title={
              bisa
                ? `${a.label} - ${a.path ?? a.bin}`
                : a.catatan || tr('Not ready')
            }
            onClick={() => setAktif(a.id)}
          >
            {a.label}
            {!a.login && a.terpasang && (
              <span className="ai-cli-warn" aria-hidden="true"> •</span>
            )}
          </button>
        );
      })}
      {aktif !== null && agentMode === 'chat' && (
        <span className="ai-cli-hint" data-testid="ai-cli-hint">
          {tr('CLI mode: send a message to run the CLI')}
        </span>
      )}
    </div>
  );
}
