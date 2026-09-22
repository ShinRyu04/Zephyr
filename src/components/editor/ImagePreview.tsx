// ImagePreview.tsx — pratinjau gambar (T3.4).
//
// KENAPA: membuka .png di editor teks menampilkan biner rusak. Sebelum ini
// Zephyr menyerahkan file gambar ke editor yang sama seperti file kode.
//
// CARA MEMBACA: Rust mengembalikan isi file sebagai base64 (bukan frontend
// yang membaca lewat fs API) supaya jalur yang dipakai sama dengan editor —
// termasuk batas ukuran dan pengecekan di luar workspace.

import { useEffect, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useTampilan, mimeGambar } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';

export default function ImagePreview() {
  const tr = useT();
  const gambar = useTampilan((s) => s.gambar);
  const setGambar = useTampilan((s) => s.setGambar);
  const setTerpasang = useTampilan((s) => s.setTerpasang);

  // `terpasang` menandai bahwa EditorArea sudah menyediakan tempat untuk
  // pratinjau. Tanpa penanda ini, komponen yang dirender di tempat lain
  // (mis. overlay) akan tampil dobel.
  useEffect(() => {
    setTerpasang(true);
    return () => setTerpasang(false);
  }, [setTerpasang]);
  const [galat, setGalat] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    // Reset zoom setiap gambar berganti — zoom 3× dari gambar sebelumnya
    // membuat gambar baru tampak rusak.
    setZoom(1);
    setGalat(null);
  }, [gambar?.path]);

  if (!gambar) return null;

  return (
    <div className="img-view" data-testid="img-view">
      <div className="img-bar">
        <span className="img-nama" title={gambar.path}>
          {gambar.path.split(/[/\\]/).pop()}
        </span>
        <span className="img-dimensi">
          {gambar.lebar} × {gambar.tinggi}
        </span>
        <span className="sub-spacer" />
        <button
          className="btn btn-sm"
          data-testid="img-zoom-out"
          title={tr('Perkecil tampilan')}
          onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
        >
          −
        </button>
        <span className="img-zoom" data-testid="img-zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="btn btn-sm"
          data-testid="img-zoom-in"
          title={tr('Perbesar tampilan')}
          onClick={() => setZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)))}
        >
          +
        </button>
        <button
          className="btn btn-sm"
          data-testid="img-reset"
          onClick={() => setZoom(1)}
        >
          1:1
        </button>
        <button
          className="api-mini"
          data-testid="img-close"
          title={tr('Tutup pratinjau')}
          onClick={() => setGambar(null)}
        >
          ✕
        </button>
      </div>

      {galat && (
        <div className="http-err" data-testid="img-error">
          {galat}
        </div>
      )}

      <div className="img-kanvas">
        <img
          className="img-gambar"
          data-testid="img-el"
          src={gambar.dataUrl}
          alt={gambar.path}
          style={{ transform: `scale(${zoom})` }}
          onError={() => setGalat(tr('Gambar gagal dimuat.'))}
        />
      </div>
    </div>
  );
}

/**
 * Muat gambar tab aktif ke store, lalu tampilkan pratinjaunya.
 *
 * KENAPA komponen terpisah: memuat gambar adalah efek samping (baca file lewat
 * Rust), dan efek samping di dalam render akan terpanggil setiap render ulang.
 * Dipakai bersama oleh EditorArea dan SplitEditor.
 */
export function PreviewGambar({ path }: { path: string }) {
  const setGambar = useTampilan((s) => s.setGambar);
  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const r = await cmd.bacaGambar(path);
        if (!batal) {
          setGambar({
            path,
            dataUrl: `data:${mimeGambar(path)};base64,${r.base64}`,
            lebar: r.lebar,
            tinggi: r.tinggi,
          });
        }
      } catch {
        // Gagal baca: store dibiarkan kosong; UI menampilkan pesan galat.
      }
    })();
    return () => {
      batal = true;
    };
  }, [path, setGambar]);
  return <ImagePreview />;
}

/** Helper: muat gambar dari Rust lalu pasang ke store. */
export async function bukaGambar(path: string): Promise<void> {
  const r = await cmd.bacaGambar(path);
  useTampilan.getState().setGambar({
    path,
    dataUrl: `data:${mimeGambar(path)};base64,${r.base64}`,
    lebar: r.lebar,
    tinggi: r.tinggi,
  });
}
