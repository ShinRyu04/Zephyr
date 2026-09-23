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
      {/* Kepala: ringkasan angka + aksi batch. Angka dulu, aksi di kanan —
          supaya mata mendarat di status sebelum tombol. */}
      <div className="sav-head">
        <span className="sav-judul">{tr('Subagent')}</span>
        <span className="sav-angka" data-testid="sav-angka">
          {agents.length} {tr('total')}
          {jalan > 0 && <> · <b className="is-jalan">{jalan} {tr('jalan')}</b></>}
          {beres > 0 && <> · <b className="is-beres">{beres} {tr('selesai')}</b></>}
          {gagal > 0 && <> · <b className="is-gagal">{gagal} {tr('gagal')}</b></>}
        </span>
        {/* Pemilih MODEL subagent. Ditaruh di kepala tab (bukan di Settings)
            supaya bisa diganti saat sedang memantau hasil — sama seperti
            pemilih model chat yang duduk di kepala panel AI. */}
        <span className="sav-model" data-testid="sav-model">
          <ModelSelector target="subagent" />
        </span>
        <span className="sav-spacer" />
        {sibuk ? (
          <button className="btn btn-sm" data-testid="sav-stop" onClick={batalSemua}>
            {tr('Hentikan semua')}
          </button>
        ) : (
          agents.length > 0 && (
            <button className="btn btn-sm" data-testid="sav-clear" onClick={bersihkan}>
              {tr('Bersihkan')}
            </button>
          )
        )}
      </div>

      {/* Form tugas paralel — di tab ini selalu terbuka, karena di sinilah
          tempatnya. Tidak ada lagi tombol buka/tutup yang menumpuk di chat. */}
      <SubAgentBar selaluTerbuka />

      {agents.length === 0 ? (
        <div className="sav-kosong" data-testid="sav-kosong">
          <p className="sav-kosong-judul">{tr('Belum ada subagent.')}</p>
          <p className="sav-kosong-note">
            {tr(
              'Tulis satu tugas per baris di atas, lalu Jalankan. Setiap baris menjadi satu subagent yang bekerja bersamaan.',
            )}
          </p>
          <p className="sav-kosong-note">
            {tr(
              'Subagent berdiri sendiri — dijalankan dari sini, terpisah dari percakapan AI. Hasilnya tidak masuk ke riwayat chat.',
            )}
          </p>
        </div>
      ) : (
        <SubAgentPanel polos />
      )}

      {ringkasan && !sibuk && (
        <details className="sav-ringkas" data-testid="sav-ringkas">
          <summary>{tr('Ringkasan gabungan')}</summary>
          <pre>{ringkasan}</pre>
        </details>
      )}
    </div>
  );
}
