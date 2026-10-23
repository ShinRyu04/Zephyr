/*
 * Kontrol sudut jendela Agents.
 *
 * Sesuai acuan `Kanan TRAE.png`: `IDE ↗`, garis penghalang, dan tombol panel
 * kanan TIDAK ditempatkan di title bar dan TIDAK punya baris/kotak sendiri.
 * Ketiganya menempel di sudut kanan-atas kotak isi (canvas), ikut warna kotak
 * itu — jadi terbaca sebagai bagian dari kotak yang sudah ada.
 *
 * Ukurannya mengikuti acuan TRAE: area klik 32px dengan ikon 18px, bukan chip
 * 26px seperti toolbar composer. Sebelumnya sempat dikecilkan; itu salah baca
 * acuan — di TRAE dua kontrol ini memang sebesar tombol title bar.
 *
 * Tombol panel kanan membuka-tutup panel kanan (`AgentsPanelKanan`). Statusnya
 * dipegang `AgentsApp` supaya panelnya satu tingkat di atas canvas.
 */
import { fokusEditorWindow } from '../../lib/agentsWindow';

/* Ikon panel kanan juga dipakai `AgentsPanelKanan` (tombol pindahannya),
   jadi ikonnya diekspor dari sini — satu sumber, jangan digambar ulang. */
export function IkonPanelKanan() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="13"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M10 3v10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function AgentsKontrolSudut({
  panelTerbuka,
  onTogglePanel,
}: {
  panelTerbuka: boolean;
  onTogglePanel: () => void;
}) {
  return (
    <div className="agx-sudut" data-testid="agx-kontrol-sudut">
      <button
        className="agx-ide"
        data-testid="agx-ide"
        title="Back to the editor"
        onClick={() =>
          void fokusEditorWindow().catch((error: unknown) => {
            /* Silence would repeat the original bug: a button that does
               nothing and says nothing. */
            console.error('gagal membuka jendela editor', error);
          })
        }
      >
        IDE
        <span className="agx-ide-panah" aria-hidden="true">
          ↗
        </span>
      </button>

      <span className="agx-sudut-halang" aria-hidden="true" />

      {/* Tombol panel hanya tampil saat panel tertutup; begitu panel terbuka,
          tombolnya pindah ke bar panel kanan (`AgentsPanelKanan`). Jadi tidak
          pernah ada dua tombol panel sekaligus. */}
      {!panelTerbuka && (
        <button
          className="agx-tb-btn agx-panel-toggle"
          data-testid="agx-panel-kanan"
          title="Show right panel"
          aria-label="Toggle right panel"
          aria-pressed={panelTerbuka}
          onClick={onTogglePanel}
        >
          <IkonPanelKanan />
        </button>
      )}
    </div>
  );
}
