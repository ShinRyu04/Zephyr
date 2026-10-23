/*
 * Jendela Extensions — kerangka tipis untuk `Marketplace`.
 *
 * Seluruh isi (judul, tab, pencarian, chip, baris item) ada di
 * `ExtMarketplace`. Berkas ini hanya menyediakan tiga hal yang berlaku untuk
 * SEMUA tab, bukan untuk satu jenis:
 *
 *   - bar "Reload" saat paket yang baru dipasang butuh memuat ulang jendela;
 *   - pesan galat dari store ekstensi;
 *   - laporan loader (apa yang benar-benar diambil dari paket terpasang).
 *
 * Kenapa laporan loader tetap ada: memasang tema/keymap/snippet yang tidak
 * didukung versi ini dulu tidak mengubah apa pun dan tidak mengatakan apa-apa.
 * Laporan itu satu-satunya tempat alasannya terbaca, jadi ia tidak boleh ikut
 * hilang saat tampilan dirombak. Ia diletakkan di BAWAH daftar supaya baris
 * pertama jendela tetap Marketplace, bukan catatan teknis.
 */
import { useEffect, useMemo } from 'react';
import { useExt19, setBahasaWorkspace } from '../../lib/extensionsStore19';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import { useT } from '../../lib/i18n';
import type { LoaderRingkasan } from '../../lib/extLoader';
import ExtMarketplace from './ExtMarketplace';

/*
 * Apa yang dilakukan loader terhadap paket yang terpasang.
 *
 * `gagal` = ada yang rusak; `tidakDidukung` = paket terbaca tetapi versi ini
 * tidak bisa memakai isinya. Keduanya menyebut alasannya dengan kata-kata,
 * bukan hanya hitungan.
 */
function RingkasLoader({ ringkasan }: { ringkasan: LoaderRingkasan }) {
  const { themes, keymaps, snippets, languages, commands, iconThemes, gagal, tidakDidukung } =
    ringkasan;

  const semuaJumlah: Array<[string, number]> = [
    ['themes', themes.length],
    ['languages', languages.length],
    ['snippets', snippets],
    ['keymaps', keymaps],
    ['icon themes', iconThemes],
    ['commands', commands],
  ];
  const jumlah = semuaJumlah.filter((baris) => baris[1] > 0);

  const adaMasalah = gagal.length > 0 || tidakDidukung.length > 0;
  if (jumlah.length === 0 && !adaMasalah) return null;

  /* Satu registri rusak bisa menghasilkan ratusan baris; dipotong dengan
     hitungan sisanya, bukan dibiarkan membanjiri jendela. */
  const BATAS = 12;
  const sisaGagal = gagal.length - BATAS;
  const sisaSkip = tidakDidukung.length - BATAS;

  return (
    <div className="xv-ringkas" data-testid="ext-ringkas" role="status">
      <div className="xv-ringkas-judul">Loader report</div>
      {jumlah.length > 0 && (
        <div className="xv-ringkas-baris" data-testid="ext-ringkas-jumlah">
          {jumlah.map(([label, n]) => `${n} ${label}`).join(' \u00b7 ')}
        </div>
      )}
      {gagal.length > 0 && (
        <ul className="xv-ringkas-gagal" data-testid="ext-ringkas-gagal">
          {gagal.slice(0, BATAS).map((g, i) => (
            <li key={`${g.id}-${i}`}>
              <b>{g.id}</b>: {g.alasan}
            </li>
          ))}
          {sisaGagal > 0 && <li>+{sisaGagal} more failures</li>}
        </ul>
      )}
      {tidakDidukung.length > 0 && (
        <ul className="xv-ringkas-skip" data-testid="ext-ringkas-skip">
          {tidakDidukung.slice(0, BATAS).map((g, i) => (
            <li key={`${g.id}-${i}`}>
              <b>{g.id}</b> ({g.fitur}): {g.alasan}
            </li>
          ))}
          {sisaSkip > 0 && <li>+{sisaSkip} more skipped entries</li>}
        </ul>
      )}
      {!adaMasalah && (
        <div className="xv-ringkas-baris" data-testid="ext-ringkas-bersih">
          Every installed package loaded. Nothing was skipped.
        </div>
      )}
    </div>
  );
}

export default function ExtensionsView() {
  const tr = useT();
  const err = useExt19((s) => s.err);
  const perluReload = useExt19((s) => s.perluReload);
  const reloadWindow = useExt19((s) => s.reloadWindow);
  const refresh = useExt19((s) => s.refresh);
  const jmlManifest = useExt19((s) => s.manifests.length);
  const ringkasan = useExt19((s) => s.ringkasan);

  const workspace = useStore((s) => s.workspace);
  const anakRoot = useExplorer((s) => (workspace ? s.children[workspace] : undefined));

  /* Bahasa di akar workspace dipakai rekomendasi paket; dikirim ke store supaya
     tab lain membaca daftar yang sama. */
  const bahasa = useMemo(() => {
    const set = new Set<string>();
    for (const n of anakRoot ?? []) {
      if (n.isDir) continue;
      const l = detectLang(n.name);
      if (l !== 'plain') set.add(l);
    }
    return Array.from(set);
  }, [anakRoot]);

  useEffect(() => {
    setBahasaWorkspace(bahasa);
  }, [bahasa]);

  useEffect(() => {
    if (jmlManifest === 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="xv" data-testid="extensions-view">
      {perluReload && (
        <div className="xv-reload" data-testid="ext-reload-bar" role="status">
          <button className="btn btn-sm btn-primary" data-testid="ext-reload" onClick={reloadWindow}>
            {tr('Reload')}
          </button>
        </div>
      )}

      {err && (
        <p className="xv-err" data-testid="ext-err" role="alert">
          {err}
        </p>
      )}

      <ExtMarketplace />

      <RingkasLoader ringkasan={ringkasan} />
    </div>
  );
}
