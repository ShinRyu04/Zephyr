import { useMemo, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useGit } from '../../lib/gitStore';
import { hunkUnified, terapkanUnifiedKeIsi } from '../../lib/hunkUnified';
import type { PetaStatus, StatusHunk } from '../../lib/hunkUnified';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { kunciPath } from '../../lib/pathKey';

type Kind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx';

function kindOf(line: string): Kind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('Binary file') ||
    line.startsWith('\\ No newline')
  )
    return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

export default function DiffViewer() {
  const tr = useT();
  const diff = useGit((s) => s.diff);
  const closeDiff = useGit((s) => s.closeDiff);
  const stage = useGit((s) => s.stage);
  const unstage = useGit((s) => s.unstage);
  const setConfirm = useGit((s) => s.setConfirm);
  const busy = useGit((s) => s.busy);
  const refreshAll = useGit((s) => s.refreshAll);

  /* Semua hook berdiri di ATAS `return null` supaya jumlah hook sama di setiap
     render — panel potongan hidup/mati bersama diffnya, bukan bersama hooknya. */
  const teksDiff = diff?.text ?? '';
  const [pilih, setPilih] = useState<PetaStatus>({});
  const [pesan, setPesan] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  /* Teks diff yang tidak bisa diurai bukan alasan mematikan panel: daftar
     potongan kosong = tidak ada yang bisa diterima/ditolak, dan itu jujur. */
  const hunk = useMemo(() => {
    try {
      return hunkUnified(teksDiff);
    } catch {
      return [];
    }
  }, [teksDiff]);

  if (!diff) return null;

  const lines = diff.text.split('\n');
  
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const isBinary = lines.some((l) => l.startsWith('Binary file'));

  let added = 0;
  let removed = 0;
  for (const l of lines) {
    const k = kindOf(l);
    if (k === 'add') added++;
    else if (k === 'del') removed++;
  }

  /* Terapkan per potongan hanya masuk akal bila sisi yang ditampilkan benar-benar
     isi berkas kerja: pada diff riwayat `path` cuma nama tampilan, dan pada diff
     staged sisinya adalah indeks — keduanya tidak boleh ditulis ke berkas. */
  const bolehTerap = diff.source !== 'history' && !diff.staged && !isBinary;
  const jumlahTerima = hunk.filter((h) => pilih[h.id] === 'terima').length;
  const belumDiputuskan = hunk.filter((h) => pilih[h.id] === undefined).length;

  /*
   * >>> PAGAR-176-APPLY
   * Jalur terapkan-potongan. Aturan keras lane ini: MENULIS BERKAS KERJA SAJA,
   * tidak pernah menyentuh indeks. Aksi indeks tetap hanya dari tombol manual di
   * kepala panel. scripts/uji-hunk.mjs membaca daerah di antara dua penanda ini
   * dan GAGAL bila di sini ada pemanggilan aksi indeks (kasus 12).
   */
  const putus = (id: number, status: StatusHunk): void => {
    setPesan(null);
    setPilih((s) => ({ ...s, [id]: status }));
  };

  const putusSemua = (status: StatusHunk): void => {
    setPesan(null);
    const berikut: Record<number, StatusHunk> = {};
    for (const h of hunk) berikut[h.id] = status;
    setPilih(berikut);
  };

  const terapkan = async (): Promise<void> => {
    const diterima = new Set<number>();
    for (const h of hunk) if (pilih[h.id] === 'terima') diterima.add(h.id);
    if (diterima.size === 0) {
      setPesan('Tidak ada potongan yang diterima — tidak ada yang ditulis.');
      return;
    }
    /* Tab editor yang masih punya perubahan belum disimpan akan menimpa hasil ini
       saat disimpan, jadi penulisan ditolak lebih dulu, dengan alasannya. */
    /* `diff.path` is whatever git reported; `t.path` is what our own tree opened.
       toLowerCase() alone does not absorb a forward-slash spelling, so the open
       tab was missed and the guard below let the write proceed over unsaved
       edits. */
    const kunci = kunciPath(diff.path);
    const tab = useStore
      .getState()
      .tabs.find((t) => !!t.path && kunciPath(t.path) === kunci);
    if (tab?.unsaved) {
      setPesan('Berkas ini sedang terbuka dengan perubahan belum disimpan: simpan atau tutup tabnya dulu.');
      return;
    }
    setProses(true);
    setPesan(null);
    try {
      const baca = await cmd.fsRead(diff.path);
      const hasil = terapkanUnifiedKeIsi(baca.content, diff.text, diterima, { sisi: 'baru' });
      await cmd.fsWrite(diff.path, hasil, baca.detectedEncoding, baca.lineEnding, { wasExisting: true });
      setPilih({});
      await useStore.getState().reloadTabFromDisk(diff.path);
      await refreshAll();
      setPesan(`Ditulis: ${diterima.size} dari ${hunk.length} potongan diterapkan.`);
    } catch (e) {
      setPesan(`Gagal menerapkan: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProses(false);
    }
  };
  /* <<< PAGAR-176-APPLY */

  return (
    <section className="diff" data-testid="diff-view" data-path={diff.path}>
      <div className="diff-head">
        <span className="diff-path" data-testid="diff-path" title={diff.path}>
          {diff.path}
        </span>
        <span className={`diff-tag ${diff.staged ? 'is-staged' : ''}`} data-testid="diff-side">
          {diff.staged ? 'staged' : 'working tree'}
        </span>
        {isBinary && (
          <span className="diff-tag" data-testid="diff-binary">
            binary file
          </span>
        )}
        <span className="diff-stat" data-testid="diff-stat">
          <span className="diff-plus">+{added}</span> <span className="diff-minus">−{removed}</span>
        </span>

        <span className="sb-spacer" />

        <button
          className="btn btn-sm"
          data-testid="diff-stage-toggle"
          disabled={busy}
          onClick={() => void (diff.staged ? unstage([diff.path]) : stage([diff.path]))}
        >
          {diff.staged ? 'Unstage' : 'Stage'}
        </button>
        <button
          className="btn btn-sm btn-danger"
          data-testid="diff-revert"
          disabled={busy || diff.staged}
          title={
            diff.staged
              ? 'Unstage first before discarding changes'
              : tr('Discard changes to this file (permanent)')
          }
          onClick={() => setConfirm({ kind: 'discard', paths: [diff.path] })}
        >
          Revert file
        </button>
        <button className="btn btn-sm" data-testid="diff-close" onClick={closeDiff}>
          Close
        </button>
      </div>

      <div className="diff-body">
        {lines.length === 0 ? (
          <p className="side-muted diff-empty">{tr('No differences for this file.')}</p>
        ) : (
          <pre className="diff-pre" data-testid="diff-pre">
            {lines.map((l, i) => {
              const k = kindOf(l);
              return (
                <span className={`diff-line is-${k}`} key={i} data-kind={k}>
                  {l === '' ? ' ' : l}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        )}
      </div>

      {hunk.length > 0 && (
        <div className="diff-hunks" data-testid="diff-hunks">
          <div className="diff-hunks-head">
            <span className="side-muted" data-testid="diff-hunks-ringkas">
              {hunk.length} potongan · {belumDiputuskan} belum · {jumlahTerima} diterima
            </span>
            <span className="sb-spacer" />
            <button
              className="btn btn-sm"
              data-testid="diff-hunks-terima-semua"
              disabled={!bolehTerap || proses}
              onClick={() => putusSemua('terima')}
            >
              Terima semua
            </button>
            <button
              className="btn btn-sm"
              data-testid="diff-hunks-tolak-semua"
              disabled={!bolehTerap || proses}
              onClick={() => putusSemua('tolak')}
            >
              Tolak semua
            </button>
            <button
              className="btn btn-sm"
              data-testid="diff-hunks-terapkan"
              disabled={!bolehTerap || proses || jumlahTerima === 0}
              onClick={() => void terapkan()}
            >
              {proses ? 'Menerapkan…' : `Terapkan ${jumlahTerima} potongan`}
            </button>
          </div>

          {!bolehTerap && (
            <p className="side-muted diff-hunks-catatan" data-testid="diff-hunks-catatan">
              {diff.source === 'history'
                ? 'Tampilan riwayat: terapkan per potongan dimatikan (path di sini hanya nama tampilan).'
                : diff.staged
                  ? 'Diff staged: terapkan per potongan dimatikan (sisi yang ditampilkan adalah isi indeks).'
                  : 'Berkas biner: tidak ada potongan yang bisa diterima.'}
            </p>
          )}

          <ul className="diff-hunk-list">
            {hunk.map((h) => (
              <li
                key={h.id}
                className={`diff-hunk is-${h.status}`}
                data-testid={`diff-hunk-${h.id}`}
                data-status={h.status}
              >
                <div className="diff-hunk-head">
                  <span className="diff-hunk-range">
                    @@ -{h.mulaiLama ?? 0},{h.jumlahLama} +{h.mulaiBaru ?? 0},{h.jumlahBaru} @@
                  </span>
                  <span className="diff-hunk-stat">
                    +{h.tambah} −{h.hapus}
                  </span>
                  <span className="sb-spacer" />
                  <button
                    className={`btn btn-sm${h.status === 'terima' ? ' is-on' : ''}`}
                    data-testid={`diff-hunk-${h.id}-terima`}
                    disabled={!bolehTerap || proses}
                    onClick={() => putus(h.id, 'terima')}
                  >
                    Terima
                  </button>
                  <button
                    className={`btn btn-sm${h.status === 'tolak' ? ' is-on' : ''}`}
                    data-testid={`diff-hunk-${h.id}-tolak`}
                    disabled={!bolehTerap || proses}
                    onClick={() => putus(h.id, 'tolak')}
                  >
                    Tolak
                  </button>
                </div>
                <pre className="diff-hunk-pre">
                  {h.baris.map((b, i) => (
                    <span key={i} className={`diff-hunk-line is-${b.jenis}`} data-jenis={b.jenis}>
                      {b.jenis === 'tambah' ? '+' : b.jenis === 'hapus' ? '-' : ' '}
                      {b.teks === '' ? ' ' : b.teks}
                      {'\n'}
                    </span>
                  ))}
                </pre>
              </li>
            ))}
          </ul>

          {pesan && (
            <p className="side-muted" data-testid="diff-hunks-pesan">
              {pesan}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
