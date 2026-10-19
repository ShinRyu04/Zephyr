import { useMemo, useState } from 'react';
import type { AgentToolRun } from '../../lib/types';
import { namaPolos, sasaranAksi } from '../../lib/labelAksi';
import { useStore } from '../../lib/store';
import { tf } from '../../lib/i18n';
import AiIkon from './AiIkon';
import '../../styles/ai-perubahan.css';

/*
 * The "files changed" card, in the middle of the transcript.
 *
 * WHY it exists: the tool block above already lists every call, but a reader
 * finishing a long run asks one question — "what did it actually touch?" — and
 * the answer was scattered across rows in call order, with the same file
 * appearing three times. This card answers it in one place, per FILE, with the
 * totals added up.
 *
 * The numbers come from the SAME fields the tool rows already carry
 * (`additions` / `deletions`), so the card can never disagree with the rows it
 * summarises. A file whose numbers were not reported shows +0 −0 rather than an
 * invented figure.
 *
 * Centred, like the reference: it is a summary of the turn, not another step in
 * it, so it reads as a break between the work and the answer.
 */

/** One file the turn wrote to, with its numbers added up. */
type Berkas = {
  path: string;
  tambah: number;
  hapus: number;
  gagal: boolean;
};

/** A file-writing call, as opposed to a read or a shell command. */
function menulisBerkas(t: AgentToolRun): boolean {
  if (t.ok === false) return false;
  const nama = namaPolos(t.name);
  return nama === 'write' || nama === 'edit' || nama === 'multi_edit' || nama === 'apply_patch';
}

export default function PerubahanBerkas({ tools }: { tools: readonly AgentToolRun[] }) {
  const [pilihan, setPilihan] = useState<boolean | null>(null);

  const berkas = useMemo(() => {
    const peta = new Map<string, Berkas>();
    for (const t of tools) {
      if (!menulisBerkas(t)) continue;
      const path = sasaranAksi(t.args);
      if (!path) continue;
      const ada = peta.get(path);
      const tambah = typeof t.additions === 'number' ? t.additions : 0;
      const hapus = typeof t.deletions === 'number' ? t.deletions : 0;
      if (ada) {
        ada.tambah += tambah;
        ada.hapus += hapus;
        ada.gagal = ada.gagal || t.ok === false;
      } else {
        peta.set(path, { path, tambah, hapus, gagal: t.ok === false });
      }
    }
    return [...peta.values()];
  }, [tools]);

  /* Nothing was written: no card. A read-only turn has nothing to summarise. */
  if (berkas.length === 0) return null;

  const terbuka = pilihan ?? false;
  const totalTambah = berkas.reduce((n, b) => n + b.tambah, 0);
  const totalHapus = berkas.reduce((n, b) => n + b.hapus, 0);

  return (
    <div className="ai-ubah" data-testid="ai-perubahan" data-open={terbuka ? '1' : '0'}>
      <button
        type="button"
        className="ai-ubah-head"
        data-testid="ai-perubahan-toggle"
        aria-expanded={terbuka}
        onClick={() => setPilihan(!terbuka)}
      >
        <span className="ai-ubah-caret" aria-hidden="true">
          {terbuka ? '▾' : '▸'}
        </span>
        <span className="ai-ubah-judul">
          {tf('{n} files changed', { n: berkas.length })}
        </span>
        <span className="ai-ubah-stat">
          <span className="ai-ubah-tambah">+{totalTambah}</span>
          <span className="ai-ubah-hapus">−{totalHapus}</span>
        </span>
      </button>

      <div className="ai-ubah-isi" aria-hidden={!terbuka}>
        {berkas.map((b, i) => (
          <button
            type="button"
            className={`ai-ubah-baris${b.gagal ? ' is-gagal' : ''}`}
            key={b.path}
            data-testid="ai-ubah-baris"
            /* Each row arrives a beat after the one above it; the index is the
               only state the animation needs, so no timers are involved. */
            style={{ ['--i' as string]: String(i) }}
            title={b.path}
            onClick={() => void useStore.getState().openPath(b.path).catch(() => undefined)}
          >
            <span className="ai-ubah-ikon" aria-hidden="true">
              <AiIkon name={b.gagal ? 'warn' : 'file'} size={12} />
            </span>
            <span className="ai-ubah-path">{b.path}</span>
            <span className="ai-ubah-stat">
              <span className="ai-ubah-tambah">+{b.tambah}</span>
              <span className="ai-ubah-hapus">−{b.hapus}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
