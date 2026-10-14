import SubAgentPanel from '../ai/SubAgentPanel';
import SubAgentBar from '../ai/SubAgentBar';
import SubSummary from '../ai/SubSummary';
import ModelSelector from '../ai/ModelSelector';
import { useSubAgent, batasParalel, kemampuanTulis } from '../../lib/subagentStore';
import { useStore } from '../../lib/store';
import { useAi } from '../../lib/aiStore';
import { useAiChatSettings } from '../../lib/chatSettingsStore';
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

  /*
   * Ikut berubah begitu salah satu gerbang berubah.
   *
   * Barisnya harus berubah saat user menyalakan setelannya di jendela Setelan
   * yang terbuka di atas tab ini, bukan setelah reload: petunjuk yang tertinggal
   * satu keadaan justru mengembalikan masalah yang mau diperbaiki di sini.
   */
  void useStore((s) => s.settings.subagent?.allowWrite);
  void useAi((s) => s.approvalMode);

  const kem = kemampuanTulis();

  const maks = batasParalel();
  const tolakTulis = agents.reduce((n, a) => n + (a.tulisDitolak ?? 0), 0);

  // Bring back the last batch after a restart, so a long run's result is not
  // lost when the window is closed.
  useEffect(() => {
    muatTersimpan();
  }, [muatTersimpan]);

  const jalan = agents.filter((a) => a.status === 'jalan').length;
  const antri = agents.filter((a) => a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;
  const selesai = agents.filter((a) => a.status === 'selesai' || a.status === 'gagal' || a.status === 'batal').length;
  const progress = agents.length ? Math.round((selesai / agents.length) * 100) : 0;

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
        <span className="sav-judul">{tr('Subagents')}</span>
        <span className="sav-angka" data-testid="sav-angka">
          {agents.length} {tr('total')}
        </span>
        <div className="sav-status-counts" aria-label={tr('Subagent status')}>
          {jalan > 0 && <span className="sav-status-chip is-running"><i />{jalan} {tr('running')}</span>}
          {beres > 0 && <span className="sav-status-chip is-done"><i />{beres} {tr('done')}</span>}
          {gagal > 0 && <span className="sav-status-chip is-failed"><i />{gagal} {tr('failed')}</span>}
          {antri > 0 && <span className="sav-status-chip is-waiting"><i />{antri} {tr('waiting')}</span>}
        </div>
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

      {/*
       * Keadaan izin tulis, dinyatakan di tempat subagentnya dijalankan.
       *
       * Sebelumnya satu-satunya tempat keadaan ini ada adalah halaman Setelan,
       * dan kalimatnya sendiri hanya menyebut `allowWrite` - jadi tab ini bisa
       * berjalan read-only tanpa satu pun tanda di layar, sementara user yang
       * sudah menyalakan setelannya tetap melihat subagentnya ditolak tanpa
       * sebab yang terlihat (mode persetujuan bukan Auto). Baris ini membaca
       * gerbang yang sama dengan loop subagent, menyebut gerbang mana yang
       * menutup, dan menyediakan jalan ke setelannya.
       */}
      <div
        className={`sav-tulis${kem.bisaTulisDisk ? ' is-on' : ' is-off'}`}
        data-testid="sav-tulis"
        data-bisa-tulis-disk={kem.bisaTulisDisk ? 'ya' : 'tidak'}
        data-setelan={kem.setelan ? 'ya' : 'tidak'}
        data-persetujuan-auto={kem.persetujuanAuto ? 'ya' : 'tidak'}
      >
        <span className="sav-tulis-teks" data-testid="sav-tulis-teks">
          {tr(
            kem.bisaTulisDisk
              ? 'Sub-agents can write files in this session.'
              : 'Read-only: sub-agents cannot write files.',
          )}
        </span>
        {!kem.bisaTulisDisk && (
          <span className="sav-tulis-alasan" data-testid="sav-tulis-alasan">
            {tr(
              'Turn on "Let sub-agents write" in Chat Settings, in the Sub-agents section, so they can work (write files) instead of only reading.',
            )}
          </span>
        )}
        <button
          className="btn btn-sm sav-tulis-setelan"
          data-testid="sav-tulis-setelan"
          onClick={() => useAiChatSettings.getState().bukaDi('subagent')}
        >
          {tr('Open Chat Settings → Sub-agents')}
        </button>
      </div>

      {tolakTulis > 0 && (
        <p className="sav-tulis-ditolak" data-testid="sav-tulis-ditolak">
          {tf('{n} write attempts were refused by the write gate', { n: tolakTulis })}
        </p>
      )}

      {agents.length > 0 && (
        <section className="sav-progress" aria-label={tr('Current run')} data-testid="sav-progress">
          <div className="sav-progress-head">
            <strong>{tr(sibuk ? 'Active run' : 'Current run')}</strong>
            <span>{selesai} / {agents.length} {tr('complete')}</span>
          </div>
          <div className="sav-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>
      )}

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
