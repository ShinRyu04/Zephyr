import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';

/*
 * Section "Computer Use" di Agent Customizations — bentuk ZCode.
 *
 * Bentuknya sama dengan halaman Skills di sebelahnya: judul + hitungan di atas,
 * lalu satu grup berisi kartu-kartu (ikon kotak, nama tebal, keterangan satu-dua
 * baris, kontrol di kanan). Sebelumnya halaman ini satu kartu polos tanpa judul,
 * jadi ia terbaca sebagai bagian dari halaman lain, bukan sebagai halaman.
 *
 * JUJUR soal cakupan: ENGINE computer use (kontrol desktop oleh agent) belum
 * ada di Zephyr. Yang hidup di batch ini adalah pengaturannya + tombol di
 * composer - field `settings.computerUse` disiapkan supaya engine yang akan
 * datang tinggal membaca flag yang sama, dan tombolnya tidak perlu dipindah.
 */
export default function AgcComputerUse() {
  const tr = useT();
  /* JANGAN bikin objek baru di dalam selector (pelajaran fase 09):
     objek baru tiap pemanggilan = re-render tak berujung. */
  const cu = useStore((s) => s.settings.computerUse);
  const apply = useStore((s) => s.applySettings);

  const aktif = cu?.enabled ?? false;
  const tombol = cu?.showButton ?? false;

  const set = (patch: { enabled?: boolean; showButton?: boolean }) =>
    void apply({ computerUse: { ...(cu ?? { enabled: false, showButton: false }), ...patch } });

  return (
    <div className="agc-pane agc-skills" data-testid="agc-computer">
      <div className="agc-zc-atas">
        <h2 className="agc-zc-judul">{tr('Computer Use')}</h2>
        <span className="agc-zc-hitung">
          {[aktif, tombol].filter(Boolean).length}/2
        </span>
      </div>
      <p className="agc-zc-desk-satu">
        {tr('Turning this on enables Computer Use — its MCP server and skills.')}
      </p>

      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">{tr('General')}</span>
      </div>

      <div className="agc-zc-daftar">
        <div className="agc-zc-kartu">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="monitor" size={15} />
          </span>
          <div className="agc-zc-isi">
            <div className="agc-zc-judulbaris">
              <span className="agc-zc-kartu-head">{tr('Enable Computer Use')}</span>
            </div>
            <div className="agc-zc-desk">
              {tr('Turning this on enables Computer Use — its MCP server and skills.')}
            </div>
          </div>
          <div className="agc-zc-aksi">
            <button
              type="button"
              role="switch"
              aria-checked={aktif}
              aria-label={tr('Enable Computer Use')}
              data-testid="agc-computer-enable"
              className={`agc-set-toggle${aktif ? ' is-on' : ''}`}
              onClick={() => set({ enabled: !aktif })}
            >
              <span className="agc-set-knob" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="agc-zc-kartu">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="compose" size={15} />
          </span>
          <div className="agc-zc-isi">
            <div className="agc-zc-judulbaris">
              <span className="agc-zc-kartu-head">{tr('Show Computer Use button in the composer')}</span>
            </div>
            <div className="agc-zc-desk">{tr('When off, the composer button is hidden.')}</div>
          </div>
          <div className="agc-zc-aksi">
            <button
              type="button"
              role="switch"
              aria-checked={tombol}
              aria-label={tr('Show Computer Use button in the composer')}
              data-testid="agc-computer-show"
              className={`agc-set-toggle${tombol ? ' is-on' : ''}`}
              onClick={() => set({ showButton: !tombol })}
            >
              <span className="agc-set-knob" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
