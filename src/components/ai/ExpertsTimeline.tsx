import { useState, type ReactNode } from 'react';
import { useExperts, jumlahLangkahCari, type CatatanLead } from '../../lib/expertsStore';
import { useSubAgent, type SubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import AiIkon from './AiIkon';
import { clipboardWrite } from '../../lib/clipboard';
import { IkonAhli, IkonCaret, bukaTabTugas, statusTugas, jenisLangkah } from './expertsBuka';
import type { TugasAhli } from '../../lib/expertsStore';

/*
 * Permukaan run Experts DI DALAM CHAT, urutan Qoder asli (referensi
 * screenshot): kalimat pembuka Lead sebagai teks polos, lipatan
 * "Created N tasks", lalu kartu KECIL per-worker yang muncul satu-satu
 * saat workernya mulai, dipisah baris "Worked on it · N actions", ditutup
 * baris "Explored N searches", baris berkas yang ditulis, dan tombol reaksi.
 *
 * Dulu ini SATU kartu berbingkai besar "Lead Agent — Orchestrating expert
 * tasks" berisi semua tugas sekaligus — justru itu yang membuat tampilan
 * terlihat jauh dari Qoder (gap 5–9). Bingkainya dihapus: kartu-kartu duduk
 * langsung di atas latar chat. Tombol Canvas & Stop pindah ke kartu Task
 * Progress di atas composer (Qoder: klik avatar di progress card).
 */

/** Satu tugas + status terkini + kesiapan tampil sebagai kartu. */
interface Tampil {
  t: TugasAhli;
  indeks: number;
  row: SubAgent | undefined;
  st: { teks: string; kelas: string };
  /** Kartu hanya muncul saat workernya benar-benar mulai — bukan masih antre. */
  mulai: boolean;
  nAksi: number;
}

export default function ExpertsTimeline({ runId }: { runId: string }) {
  const tr = useT();
  const run = useExperts((s) => s.runs.find((r) => r.id === runId));
  const agents = useSubAgent((s) => s.agents);
  const [buatBuka, setBuatBuka] = useState(true);
  const [cariBuka, setCariBuka] = useState(false);
  const [berkasBuka, setBerkasBuka] = useState(false);
  /* Lipatan "Worked on it" per tugas — terbuka/tertutup sendiri-sendiri. */
  const [kerjaBuka, setKerjaBuka] = useState<Record<string, boolean>>({});
  /* Reaksi lokal (kayak Qoder): 1 = suka, -1 = tidak, 0 = netral. */
  const [reaksi, setReaksi] = useState(0);

  if (!run || run.tugas.length === 0 || run.status === 'menyusun' || run.status === 'rencana') {
    /* fase rencana: kartu gerbang yang tampil; fase menyusun: typing dots. */
    return null;
  }
  const jalan = run.status === 'jalan';

  /*
   * Kartu progresif: saat run berjalan, tugas yang masih menunggu gelombang
   * sebelumnya TIDAK dirender sebagai kartu (masih ada di lipatan "Created
   * N tasks"). Run terminal (selesai/gagal/batal) dan snapshot setelah reload
   * menampilkan semua — itu riwayat, bukan antrean.
   */
  const tampil: Tampil[] = run.tugas.map((t, indeks) => {
    const row = agents.find((a) => a.id === t.agentId);
    const st = statusTugas(row?.status, t.statusAkhir, jalan, t.buktian);
    const mulai = !jalan || !!t.statusAkhir || (!!row && row.status !== 'menunggu');
    const nAksi = row?.nTool ?? t.nTool ?? 0;
    return { t, indeks, row, st, mulai, nAksi };
  });
  const kartu = tampil.filter((x) => x.mulai);

  /* "Explored N searches": hitungan hidup dulu, snapshot sebagai cadangan. */
  const totalCari = tampil.reduce(
    (n, x) => n + (x.row ? jumlahLangkahCari(x.row.langkah) : (x.t.nCari ?? 0)),
    0,
  );
  const kueriCari = tampil.flatMap((x) =>
    (x.row?.langkah ?? [])
      .filter((l) => l.kind === 'tool' && /^(grep|glob|search|tool_search|find|cari|web|ambil_web|browsing|ingat)/i.test(l.nama ?? ''))
      .map((l) => {
        try {
          const a = JSON.parse(l.args ?? '{}') as Record<string, unknown>;
          return String(a.pattern ?? a.query ?? a.url ?? a.path ?? '').split('\n')[0].slice(0, 120);
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );

  const berkasTulis = [...new Set(run.tugas.flatMap((t) => t.berkasTulis ?? []))];
  const berkasTampil =
    run.status === 'selesai' || run.status === 'gagal' || run.status === 'batal' ? berkasTulis : [];

  /*
   * Catatan Lead TERAKHIR secara kronologis terbuka (acuan 035349/035406: fold
   * "Updating task approach" tampil terbuka dengan paragraf pikirannya, yang
   * sebelumnya terlipat) — posisinya di kartu mana pun, mengikuti kronologi.
   */
  const catatanRun = run.catatan ?? [];
  const idCatatanTerakhir = catatanRun.length > 0 ? catatanRun[catatanRun.length - 1].id : null;

  /*
   * Narasi berjalan ala acuan (gambar 2 Qoder): Lead "memberi tahu" apa yang
   * sedang dikerjakan worker — kalimat polos di antara kartu. Dibangun dari
   * langkah TERAKHIR baris worker, bukan panggilan AI tambahan; fold pikiran
   * Lead di tengah jalan butuh perubahan mesin (Lead dipanggil ulang) — lain
   * babak. Tanpa baris hidup, narasi pakai kalimat netral "menyiapkan".
   */
  const narasiJalan = jalan
    ? tampil
        .filter((x) => x.st.kelas === 'is-jalan')
        .map((x) => ({ id: x.t.id, teks: narasiTugas(x.t.nama, x.row) }))
    : [];

  const salinRingkas = () => {
    const isi = [
      run.intro,
      ...tampil.map(
        (x) => `Task ${x.indeks + 1}: ${x.t.judul} — ${x.st.teks}${x.t.hasil ? `\n${x.t.hasil}` : ''}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
    void clipboardWrite(isi);
  };

  return (
    <div className="experts-run" data-testid="experts-timeline">
      {run.intro.trim() && <div className="experts-run-intro">{run.intro}</div>}

      {/*
        * "Created N tasks": bukti rencana di transcript — lipatannya terbuka
        * default supaya pembaca melihat apa yang dikerjakan tanpa klik; gelombang
        * yang belum mulai HANYA terlihat di sini, bukan sebagai kartu kosong.
        */}
      <button
        type="button"
        className={`experts-run-fold${buatBuka ? ' is-buka' : ''}`}
        aria-expanded={buatBuka}
        onClick={() => setBuatBuka((v) => !v)}
      >
        <AiIkon name="queue" size={12} />
        <span>
          {tr('Created')} <b>{run.tugas.length}</b> {tr('tasks')}
        </span>
        <IkonCaret />
      </button>
      {buatBuka && (
        <div className="experts-run-fold-daftar">
          {run.tugas.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="experts-run-fold-baris"
              onClick={() => bukaTabTugas(t, i)}
            >
              Task {i + 1}: {t.judul}
            </button>
          ))}
        </div>
      )}

      {kartu.map((x, k) => (
        <Bagian key={x.t.id} terakhir={k === kartu.length - 1}>
          {/*
            * Kartu worker: klik ke tab "Task N". Baris atas = avatar tinted +
            * nama + status; baris bawah = └ + judul tebal, persis acuan.
            */}
          <button
            type="button"
            className="experts-run-kartu"
            data-testid={`experts-task-${x.t.id}`}
            title={x.t.deskripsi}
            onClick={() => bukaTabTugas(x.t, x.indeks)}
          >
            <span className="experts-run-atas">
              <span className="experts-run-avatar" data-ahli={x.t.ahli} aria-hidden="true">
                <IkonAhli id={x.t.ahli} size={12} />
              </span>
              <span className="experts-run-nama">{x.t.nama}</span>
              <span className={`experts-run-status ${x.st.kelas}`} aria-label={x.st.teks}>
                {x.st.kelas === 'is-jalan' ? <span className="experts-spin" aria-hidden="true" /> : null}
                {x.st.teks}
              </span>
            </span>
            <span className="experts-run-bawah">
              <span className="experts-run-sambung" aria-hidden="true">└</span>
              <span className="experts-run-judul">
                Task {x.indeks + 1}: {x.t.judul}
              </span>
            </span>
          </button>
          {k !== kartu.length - 1 && (
            <KerjaFold
              nAksi={x.nAksi}
              langkah={x.row?.langkah ?? []}
              berkas={x.row?.fileDitulis ?? x.t.berkasTulis ?? []}
              buka={!!kerjaBuka[x.t.id]}
              onToggle={() => setKerjaBuka((v) => ({ ...v, [x.t.id]: !v[x.t.id] }))}
            />
          )}
          {/*
            * Catatan Lead untuk worker INI muncul persis setelah kartunya —
            * kronologi, bukan tumpukan di bawah semua kartu. Catatan dibuat
            * saat worker mencapai akhir, jadi `tugasId`-nya menunjuk kartu ini.
            */}
          {(run.catatan ?? [])
            .filter((c) => c.tugasId === x.t.id)
            .map((c) => (
              <FoldCatatan
                key={c.id}
                catatan={c}
                bukaDefault={c.id === idCatatanTerakhir}
              />
            ))}
        </Bagian>
      ))}

      {narasiJalan.map((n) => (
        <p key={n.id} className="experts-run-narasi">
          {n.teks}
        </p>
      ))}

      {/*
        * Catatan Lead di tengah jalan (acuan: "⟳ Updating task approach ⌄" +
        * paragraf pikirannya). Judul aksi + reasoning NYATA dari model Lead —
        * yang terakhir terbuka, yang lama terlipat.
        */}
      {/* Catatan run LAMA (tersimpan sebelum `tugasId` ada) tidak punya posisi
          kartu; dipasang di akhir supaya tetap terbaca, bukan dihilangkan. */}
      {(run.catatan ?? [])
        .filter((c) => !c.tugasId)
        .map((c) => (
          <FoldCatatan
            key={c.id}
            catatan={c}
            bukaDefault={c.id === idCatatanTerakhir}
          />
        ))}

      {totalCari > 0 && (
        <>
          <button
            type="button"
            className={`experts-run-cari${cariBuka ? ' is-buka' : ''}`}
            aria-expanded={cariBuka}
            onClick={() => setCariBuka((v) => !v)}
          >
            <AiIkon name="search" size={11} />
            <span>
              {tr('Explored')} <b>{totalCari}</b> {tr('searches')}
            </span>
            {kueriCari.length > 0 && <IkonCaret />}
          </button>
          {cariBuka && kueriCari.length > 0 && (
            <div className="experts-run-fold-daftar">
              {kueriCari.map((q, i) => (
                <div key={i} className="experts-run-fold-baris is-teks" title={q}>
                  {q}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/*
        * Berkas yang benar-benar ditulis, ala kartu diff acuan: # nama … M
        * Applied. Statistik +n/-n tidak dirender — Zephyr tidak menghitungnya
        * saat worker menulis, dan angka rekaan lebih buruk daripada tanpa angka.
        */}
      {berkasTampil.length > 0 && (
        <div className={`experts-run-berkas${berkasBuka ? ' is-buka' : ''}`} data-testid="experts-files">
          <button
            type="button"
            className="experts-run-fold is-berkas"
            aria-expanded={berkasBuka}
            onClick={() => setBerkasBuka((v) => !v)}
          >
            <AiIkon name="diff" size={12} />
            <span>
              <b>{berkasTampil.length}</b> {tr('Changed Files')}
            </span>
            <IkonCaret />
          </button>
          {berkasBuka && (
            <div className="experts-run-fold-daftar">
              {berkasTampil.map((p) => (
                <div key={p} className="experts-run-berkas-baris" title={p}>
                  <span className="experts-run-berkas-hash" aria-hidden="true">#</span>
                  <span className="experts-run-berkas-nama">{p.split(/[\\/]/).pop()}</span>
                  <span className="experts-run-berkas-kanan">
                    <span className="is-mod">M</span>
                    <span className="is-applied">{tr('Applied')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="experts-run-reaksi" role="group" aria-label={tr('Reactions')}>
        <button type="button" title={tr('Copy summary')} onClick={salinRingkas}>
          <AiIkon name="clipboard" size={12} />
        </button>
        <button
          type="button"
          title={tr('Good result')}
          aria-pressed={reaksi === 1}
          className={reaksi === 1 ? 'is-on' : ''}
          onClick={() => setReaksi((v) => (v === 1 ? 0 : 1))}
        >
          <IkonJempol atas />
        </button>
        <button
          type="button"
          title={tr('Bad result')}
          aria-pressed={reaksi === -1}
          className={reaksi === -1 ? 'is-on' : ''}
          onClick={() => setReaksi((v) => (v === -1 ? 0 : -1))}
        >
          <IkonJempol atas={false} />
        </button>
        <button type="button" title={tr('Fork this run into a new chat')}>
          <IkonFork />
        </button>
      </div>
    </div>
  );
}

/*
 * Pemisah "Worked on it" harus nempel ke kartu DI ATASNYA (dia kwitansi pekerja
 * itu), bukan ke kartu di bawahnya — dibungkus satu elemen supaya margin-nya
 * tidak jebol. JSX butuh PascalCase untuk komponen, jadi namanya `Bagian`.
 */
function Bagian({ terakhir, children }: { terakhir: boolean; children: ReactNode }) {
  return (
    <div className="experts-run-bagian" data-terakhir={terakhir ? '1' : undefined}>
      {children}
    </div>
  );
}

/*
 * "Worked on it" sebagai LIPATAN (acuan 044920: baris redup + caret).
 *
 * Isinya hanya yang benar-benar tercatat: jumlah langkah tool dan berkas yang
 * disentuh worker itu. Tidak ada ringkasan karangan — kalau baris subagentnya
 * sudah hilang (run lama setelah reload), fold tetap ada tapi isinya kosong
 * dan itu dinyatakan apa adanya.
 */
function KerjaFold({
  nAksi,
  langkah,
  berkas,
  buka,
  onToggle,
}: {
  nAksi: number;
  langkah: { kind: string; nama?: string }[];
  berkas: string[];
  buka: boolean;
  onToggle: () => void;
}) {
  const tr = useT();
  const namaBerkas = (p: string) => p.split(/[\\/]/).pop() || p;
  return (
    <>
      <button
        type="button"
        className={`experts-run-kerja${buka ? ' is-buka' : ''}`}
        aria-expanded={buka}
        onClick={onToggle}
        data-testid="experts-worked-on"
      >
        <AiIkon name="gear" size={11} />
        <span>
          {tr('Worked on it')}
          {nAksi > 0 && (
            <>
              {' '}
              <span className="experts-run-kerja-n">
                {nAksi} {tr('actions')}
              </span>
            </>
          )}
        </span>
        <IkonCaret />
      </button>
      {buka && (
        <div className="experts-run-kerja-isi" data-testid="experts-worked-on-isi">
          {langkah.length > 0 ? (
            <span className="experts-run-kerja-kepala">
              {langkah.length} {tr('tool steps')}
            </span>
          ) : (
            <span className="experts-run-kerja-kepala">{tr('No tool steps recorded')}</span>
          )}
          {berkas.map((p) => (
            <span key={p} className="experts-run-kerja-baris" title={p}>
              {namaBerkas(p)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/*
 * Lipatan satu catatan Lead: judul aksi ("Validating dubious claims") + isi
 * pikirannya. Bukaannya mengikuti posisi — catatan terbaru terbuka supaya
 * pembaca melihat Lead sedang berpikir apa, yang lama terlipat rapi.
 */
function FoldCatatan({ catatan, bukaDefault }: { catatan: CatatanLead; bukaDefault: boolean }) {
  const [buka, setBuka] = useState(bukaDefault);
  return (
    <>
      <button
        type="button"
        className={`experts-run-fold${buka ? ' is-buka' : ''}`}
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <AiIkon name="refresh" size={12} />
        <span>{catatan.judul}</span>
        <IkonCaret />
      </button>
      {buka && catatan.pikir && (
        <p className="experts-run-catatan-pikir">{catatan.pikir}</p>
      )}
    </>
  );
}

/*
 * Kalimat narasi satu worker yang sedang berjalan, dari langkah terakhirnya:
 * "Researcher Alex sedang membaca modelCatalog.tsx." — gaya Lead yang
 * "memberi tahu" di acuan. Untuk 'pikir'/'lain' dipakai kalimat netral, karena
 * isi pikiran worker bukan narrasi untuk user.
 */
function narasiTugas(nama: string, row: SubAgent | undefined): string {
  const terakhir = row?.langkah[row.langkah.length - 1];
  if (!terakhir) return `${nama} sedang menyiapkan langkah pertama.`;
  const args = (() => {
    try {
      return JSON.parse(terakhir.args ?? '{}') as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const dasar = (p: unknown) => String(p ?? '').split(/[\\/]/).pop() || '';
  const jenis = terakhir.kind === 'pikir' ? 'pikir' : jenisLangkah(terakhir.nama);
  switch (jenis) {
    case 'baca':
      return `${nama} sedang membaca ${dasar(args.path) || 'berkas terkait'}.`;
    case 'cari':
      return `${nama} sedang mencari "${String(args.pattern ?? args.query ?? '').slice(0, 60)}".`;
    case 'tulis':
      return `${nama} sedang menulis perubahan di ${dasar(args.path) || 'berkas'}.`;
    case 'terminal':
      return `${nama} sedang menjalankan perintah di terminal.`;
    default:
      return `${nama} sedang menyusun langkah berikutnya.`;
  }
}

/** Ikon jempol 16px — suka/tidak, digambar sendiri gaya garis. */
function IkonJempol({ atas }: { atas?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={atas ? undefined : { transform: 'rotate(180deg)' }}
    >
      <path d="M5.2 7.2 8 2.4c.9 0 1.6.7 1.6 1.6v2.4h3.1c.8 0 1.4.7 1.3 1.5l-.7 4.4a1.6 1.6 0 0 1-1.6 1.3H5.2" />
      <path d="M5.2 7.2v6.4H3.4A1.1 1.1 0 0 1 2.3 12.5V8.3a1.1 1.1 0 0 1 1.1-1.1h1.8z" />
    </svg>
  );
}

/** Ikon fork (cabang) 16px untuk aksi "pecah run ini ke chat baru". */
function IkonFork() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="4.5" cy="3.8" r="1.7" />
      <circle cx="11.5" cy="3.8" r="1.7" />
      <circle cx="8" cy="12.2" r="1.7" />
      <path d="M4.5 5.5v1.4c0 1.6 1.3 2.9 2.9 2.9h1.2c1.6 0 2.9-1.3 2.9-2.9V5.5M8 9.8v.7" />
    </svg>
  );
}
