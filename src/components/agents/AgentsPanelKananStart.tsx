import type { ReactNode } from 'react';
import { BUTIR, URUT_DROPDOWN, type Tampilan } from './AgentsViewDropdown';

/*
 * Layar "Start here" panel kanan jendela Agents.
 *
 * Tampil ketika panel tidak punya tab sama sekali — misalnya setelah tab
 * terakhir ditutup. Isinya daftar view yang sama dengan dropdown `+`, jadi
 * user tidak perlu menebak cara membuka tab lagi. Pilihan `start` sendiri
 * tidak ditawarkan (layar ini memang halamannya).
 */

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function AgentsPanelKananStart({
  onPilih,
}: {
  onPilih: (id: Tampilan) => void;
}) {
  const daftar = URUT_DROPDOWN.map((id) => BUTIR.find((b) => b.id === id)!).filter(
    (b) => b.id !== 'start',
  );

  return (
    <div className="agx-kanan-tengah" data-testid="agx-start-here">
      <span className="agx-kanan-judul">Start here</span>
      <div className="agx-kanan-daftar">
        {daftar.map((b) => (
          <button
            key={b.id}
            className="agx-kanan-butir"
            data-testid={`agx-start-${b.id}`}
            onClick={() => onPilih(b.id)}
          >
            <span className="agx-kanan-butir-ikon">
              <Ikon>{b.ikon}</Ikon>
            </span>
            <span className="agx-kanan-butir-teks">
              <b>{b.label}</b>
              <i>{b.ket}</i>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
