import { useEffect, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useTampilan, mimeGambar } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';

export default function ImagePreview() {
  const tr = useT();
  const gambar = useTampilan((s) => s.gambar);
  const setGambar = useTampilan((s) => s.setGambar);
  const setTerpasang = useTampilan((s) => s.setTerpasang);

  useEffect(() => {
    setTerpasang(true);
    return () => setTerpasang(false);
  }, [setTerpasang]);
  const [galat, setGalat] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {

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
          title={tr('Zoom out')}
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
          title={tr('Zoom in')}
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
          title={tr('Close preview')}
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
          onError={() => setGalat(tr('Failed to load image.'))}
        />
      </div>
    </div>
  );
}

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

export async function bukaGambar(path: string): Promise<void> {
  const r = await cmd.bacaGambar(path);
  useTampilan.getState().setGambar({
    path,
    dataUrl: `data:${mimeGambar(path)};base64,${r.base64}`,
    lebar: r.lebar,
    tinggi: r.tinggi,
  });
}
