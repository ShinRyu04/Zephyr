// SubAgentInfo.tsx — panel INFO subagent di sebelah KANAN chat AI (T4.1b).
//
// PERMINTAAN USER (verbatim): "klo bisa sih tarok di terminal ,tpi di sebelah
// kanan chat AI gtu info jga itu…" dan "bisa dipindahkan ke sebelah kanan AI
// di terminal ga ?"
//
// KENAPA panel terpisah dari tab Subagents: tab ada di panel BAWAH, dan panel
// bawah hanya terlihat saat dibuka. Kalau user sedang mengetik di chat, progres
// subagent hilang dari pandangan. Kolom sempit di kanan membuat chat dan
// progres terlihat BERDAMPINGAN tanpa memakan lebar editor.
//
// KENAPA ringkas, bukan kartu penuh: ini panel INFO (260px), bukan ruang kerja.
// Isinya sengaja hanya nama + peran + status + langkah terakhir + hitungan.
// Detail penuh (timeline langkah, hasil, ringkasan) tetap di tab Subagents —
// menampilkan semuanya di sini justru mengulang masalah "menumpuk" yang baru
// saja diperbaiki.
//
// KENAPA bisa ditutup: informasi tambahan tidak boleh memaksa hadir. Tombol
// tutup menyimpan pilihannya (layoutStore -> settings), jadi tidak muncul lagi
// sampai user membukanya sendiri.

import { useSubAgent } from '../../lib/subagentStore';
import { infoPeran } from '../../lib/subagentRoles';
import { useLayoutCustom } from '../../lib/layoutStore';
import { useT } from '../../lib/i18n';

export default function SubAgentInfo() {
  const tr = useT();
  const agents = useSubAgent((s) => s.agents);
  const sibuk = useSubAgent((s) => s.sibuk);
  const batalSemua = useSubAgent((s) => s.batalSemua);
  const setSubKanan = useLayoutCustom((s) => s.setSubKanan);
  const simpan = useLayoutCustom((s) => s.simpan);

  const jalan = agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
  const beres = agents.filter((a) => a.status === 'selesai').length;
  const gagal = agents.filter((a) => a.status === 'gagal').length;

  const tutup = () => {
    setSubKanan(false);
    void simpan();
  };

  /** Langkah terakhir — yang sedang/baru dikerjakan subagent ini. */
  const langkahTerakhir = (a: (typeof agents)[number]) => {
    const l = a.langkah[a.langkah.length - 1];
    if (!l) return a.status === 'menunggu' ? tr('menunggu') : '…';
    if (l.kind === 'tool') return l.nama || '…';
    // kind='pikir': teks model bisa panjang — ambil baris pertama saja.
    return (l.teks ?? '').split(/[\r\n]+/)[0].slice(0, 90) || '…';
  };

  return (
    <div className="sai-root" data-testid="sai-root">
      <div className="sai-head">
        <span className="sai-judul">{tr('Subagent')}</span>
        <span className="sai-angka" data-testid="sai-angka">
          {agents.length > 0 ? (
            <>
              {jalan > 0 && <b className="is-jalan">{jalan} {tr('jalan')}</b>}
              {jalan > 0 && (beres > 0 || gagal > 0) && ' · '}
              {beres > 0 && <b className="is-beres">{beres} {tr('selesai')}</b>}
              {beres > 0 && gagal > 0 && ' · '}
              {gagal > 0 && <b className="is-gagal">{gagal} {tr('gagal')}</b>}
            </>
          ) : (
            <span className="sai-sepi">{tr('belum ada')}</span>
          )}
        </span>
        <button
          className="sai-x"
          data-testid="sai-tutup"
          title={tr('Sembunyikan panel info subagent')}
          aria-label={tr('Sembunyikan panel info subagent')}
          onClick={tutup}
        >
          ✕
        </button>
      </div>

      <div className="sai-list" data-testid="sai-list">
        {agents.length === 0 ? (
          <p className="sai-kosong" data-testid="sai-kosong">
            {tr('Belum ada subagent berjalan. Buka tab Subagents di panel bawah untuk menjalankan tugas paralel.')}
          </p>
        ) : (
          agents.map((a) => {
            // infoPeran bisa null (peran tak dikenal) — jangan akses .label
            // langsung, itu bikin panel ini blank saat data lama termuat.
            const p = infoPeran(a.peran);
            return (
              <div
                key={a.id}
                className={`sai-item is-${a.status}`}
                data-testid={`sai-item-${a.id}`}
                data-status={a.status}
              >
                <div className="sai-baris">
                  <span className={`sai-dot is-${a.status}`} aria-hidden="true" />
                  <span className="sai-nama">{a.nama}</span>
                  <span className="sai-peran" title={p ? tr(p.label) : ''}>
                    {p ? `${p.ikon} ${tr(p.label)}` : '—'}
                  </span>
                </div>
                <div className="sai-langkah" title={langkahTerakhir(a)}>
                  {langkahTerakhir(a)}
                </div>
                <div className="sai-meta">
                  <span>{a.langkah.length} {tr('langkah')}</span>
                  {a.status === 'jalan' && <span className="sai-live">{tr('jalan')}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sai-foot">
        {sibuk ? (
          <button className="btn btn-sm" data-testid="sai-stop" onClick={batalSemua}>
            {tr('Hentikan semua')}
          </button>
        ) : (
          <span className="sai-hint">
            {tr('Panel info — detail penuh ada di tab Subagents.')}
          </span>
        )}
      </div>
    </div>
  );
}
