import { useState } from 'react';
import { useExperts, AHLI, AHLI_BY_ID, type EkspertRun, type TugasAhli } from '../../lib/expertsStore';
import { customAktif } from '../../lib/subagentCustom';
import { useT } from '../../lib/i18n';
import { IkonAhli } from './expertsBuka';

/*
 * Kartu rencana Experts Mode — GERBANG, bukan lagi auto-run.
 *
 *   Lead menyusun rencana -> KARTU INI -> user review/adjust -> Start.
 *
 * Dokumen Qoder menaruh konfirmasi user di antara rencana dan eksekusi. Auto-run
 * tetap tersedia sebagai opsi di Experts Settings; kartu ini tidak lagi memaksa
 * salah satunya. Selama status `menyusun`, pesan di chat tampil sebagai bubble
 * Agent biasa (typing dots) — kartu baru muncul ketika ada tugas nyata.
 *
 * Data tugas hidup di `useExperts` (persist localStorage); pesan chat hanya
 * membawa runId, jadi kartu, timeline, dan canvas membaca satu sumber.
 */
export default function ExpertsPlanCard({
  runId,
  teks,
}: {
  runId: string;
  /** Kalimat pengantar dari Lead — tampil apa adanya kalau run-nya hilang. */
  teks: string;
}) {
  const tr = useT();
  const run = useExperts((s) => s.runs.find((r) => r.id === runId));
  const setujui = useExperts((s) => s.setujui);
  const tolak = useExperts((s) => s.tolak);
  const ubahTugas = useExperts((s) => s.ubahTugas);
  const [sunting, setSunting] = useState(false);
  const [draft, setDraft] = useState<TugasAhli[]>([]);

  if (!run) {
    /*
     * Run-nya hilang (data lama / localStorage dibersihkan). JANGAN render
     * kartu "Lead Agent — Plan / Plan" kosong: pesan lama yang run-nya sudah
     * dibuang dulu tampil begitu dan terbaca seperti balasan yang rusak.
     * Kalau Lead sempat menulis pengantar, tampilkan sebagai teks biasa; kalau
     * tidak ada apa-apa, tidak ada yang perlu ditampilkan.
     */
    const sisa = teks.trim();
    if (!sisa) return null;
    return (
      <div className="experts-plan is-hilang" data-testid="experts-plan">
        <div className="experts-plan-intro">{sisa}</div>
      </div>
    );
  }

  const mulaiSunting = () => {
    setDraft(run.tugas.map((t) => ({ ...t, berkas: [...t.berkas] })));
    setSunting(true);
  };

  const simpanSunting = () => {
    ubahTugas(run.id, draft);
    setSunting(false);
  };

  const pilihAhli = (i: number, id: string) => {
    setDraft((d) =>
      d.map((t, j) => {
        if (j !== i) return t;
        const bawaan = AHLI_BY_ID.get(id as never);
        if (bawaan) {
          return {
            ...t,
            ahli: bawaan.id,
            nama: `${bawaan.label} ${bawaan.pool[0]}`,
            customId: null,
            customNama: undefined,
            customIkon: undefined,
          };
        }
        const kustom = customAktif().find((c) => `kustom:${c.id}` === id);
        if (!kustom) return t;
        const jembatan = AHLI_BY_ID.get(kustom.alat.includes('multi_edit') ? 'fullstack' : 'researcher')!;
        return {
          ...t,
          ahli: jembatan.id,
          nama: kustom.nama,
          customId: kustom.id,
          customNama: kustom.nama,
          customIkon: kustom.ikon,
        };
      }),
    );
  };

  const tambahTugas = () => {
    const def = AHLI_BY_ID.get('fullstack')!;
    setDraft((d) => [
      ...d,
      {
        id: `t${Date.now().toString(36)}`,
        judul: '',
        deskripsi: '',
        ahli: def.id,
        nama: `${def.label} ${def.pool[0]}`,
        berkas: [],
        setelah: null,
        agentId: null,
      },
    ]);
  };

  const opsiSunting = [
    ...AHLI.filter((a) => a.id !== 'lead').map((a) => ({ id: a.id, label: a.label })),
    ...customAktif().map((c) => ({ id: `kustom:${c.id}`, label: `${c.nama} (custom)` })),
  ];

  return (
    <div className="experts-plan" data-testid="experts-plan" data-status={run.status}>
      <KepalaRun run={run} />

      {run.error && <div className="experts-plan-error">{run.error}</div>}

      {sunting ? (
        <div className="experts-plan-sunting" data-testid="experts-plan-editor">
          {draft.map((t, i) => (
            <div key={t.id} className="experts-plan-baris-sunting">
              <div className="experts-plan-sunting-atas">
                <span className="experts-plan-tugas-ikon" data-ahli={t.ahli}>
                  <IkonAhli id={t.ahli} size={13} />
                </span>
                <input
                  className="experts-plan-input experts-plan-input-judul"
                  value={t.judul}
                  placeholder={tr('Task title')}
                  aria-label={tr('Task title')}
                  data-testid={`experts-plan-edit-judul-${i}`}
                  onChange={(e) => {
                    /* Nilai dibaca SEKARANG: `currentTarget` sudah null saat
                       updater React berjalan (event-nya sudah dilepas). */
                    const nilai = e.currentTarget.value;
                    setDraft((d) => d.map((x, j) => (j === i ? { ...x, judul: nilai } : x)));
                  }}
                />
                <select
                  className="experts-plan-pilih"
                  value={t.customId ? `kustom:${t.customId}` : t.ahli}
                  aria-label={tr('Expert')}
                  data-testid={`experts-plan-edit-ahli-${i}`}
                  onChange={(e) => pilihAhli(i, e.currentTarget.value)}
                >
                  {opsiSunting.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="experts-plan-hapus"
                  title={tr('Remove task')}
                  aria-label={tr('Remove task')}
                  data-testid={`experts-plan-hapus-${i}`}
                  onClick={() =>
                    setDraft((d) => {
                      /* Tugas yang menunggu tugas ini jadi paralel: kalau tidak,
                         select dependensinya menunjuk id yang sudah tidak ada. */
                      const buang = d[i].id;
                      return d
                        .filter((_, j) => j !== i)
                        .map((x) => (x.setelah === buang ? { ...x, setelah: null } : x));
                    })
                  }
                >
                  ✕
                </button>
              </div>
              {/*
                * Urutan eksekusi termasuk hal yang boleh diadili user di gerbang
                * rencana. Dulu dependensi hanya bisa dilihat, tidak bisa diubah —
                * jadi rencana yang rantainya salah harus dibuang dan diminta ulang
                * ke Lead. Opsi yang akan membuat rantai berputar dimatikan.
                */}
              <div className="experts-plan-sunting-urut">
                <label
                  className="experts-plan-urut-label"
                  htmlFor={`experts-plan-setelah-${i}`}
                >
                  {tr('Start')}
                </label>
                <select
                  id={`experts-plan-setelah-${i}`}
                  className="experts-plan-pilih is-urut"
                  value={t.setelah ?? ''}
                  aria-label={tr('Depends on')}
                  data-testid={`experts-plan-edit-setelah-${i}`}
                  onChange={(e) => {
                    const nilai = e.currentTarget.value;
                    setDraft((d) =>
                      d.map((x, j) => (j === i ? { ...x, setelah: nilai || null } : x)),
                    );
                  }}
                >
                  <option value="">{tr('Immediately (runs in parallel)')}</option>
                  {draft.map((x, j) =>
                    j === i ? null : (
                      <option key={x.id} value={x.id} disabled={menungguSebelum(draft, x.id, t.id)}>
                        {tr('after')} Task {j + 1}: {x.judul || tr('Task title')}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <textarea
                className="experts-plan-input experts-plan-input-brief"
                value={t.deskripsi}
                rows={2}
                placeholder={tr('Concrete brief: what to do, which files, how to verify')}
                aria-label={tr('Task brief')}
                data-testid={`experts-plan-edit-deskripsi-${i}`}
                onChange={(e) => {
                  const nilai = e.currentTarget.value;
                  setDraft((d) => d.map((x, j) => (j === i ? { ...x, deskripsi: nilai } : x)));
                }}
              />
            </div>
          ))}
          <div className="experts-plan-sunting-aksi">
            <button
              type="button"
              className="experts-plan-tombol is-kecil"
              data-testid="experts-plan-add"
              onClick={tambahTugas}
            >
              + {tr('Add task')}
            </button>
            <span className="experts-plan-spacer" />
            <button
              type="button"
              className="experts-plan-tombol is-kecil"
              data-testid="experts-plan-cancel"
              onClick={() => setSunting(false)}
            >
              {tr('Cancel')}
            </button>
            <button
              type="button"
              className="experts-plan-tombol is-kecil is-utama"
              data-testid="experts-plan-save"
              onClick={simpanSunting}
            >
              {tr('Save plan')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {run.tugas.length > 0 && (
            <ol className="experts-plan-daftar" data-testid="experts-plan-tasks">
              {run.tugas.map((t, i) => {
                const dep = t.setelah ? run.tugas.findIndex((x) => x.id === t.setelah) : -1;
                return (
                  <li key={t.id} className="experts-plan-tugas" data-testid={`experts-plan-task-${i + 1}`}>
                    <span className="experts-plan-tugas-ikon" data-ahli={t.ahli}>
                      <IkonAhli id={t.ahli} size={13} />
                    </span>
                    <span className="experts-plan-tugas-badan">
                      <b>{t.judul}</b>
                      <i>
                        {t.nama}
                        {dep >= 0 ? ` — ${tr('after')} Task ${dep + 1}` : ` — ${tr('runs in parallel')}`}
                      </i>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {run.status === 'rencana' && (
            <div className="experts-plan-gerbang" data-testid="experts-plan-gate">
              <span className="experts-plan-gerbang-teks">
                {tr('Review the plan, adjust it if needed, then start the team.')}
              </span>
              <button
                type="button"
                className="experts-plan-tombol"
                data-testid="experts-plan-edit"
                onClick={mulaiSunting}
              >
                {tr('Edit plan')}
              </button>
              <button
                type="button"
                className="experts-plan-tombol is-bahaya"
                data-testid="experts-plan-discard"
                onClick={() => tolak(run.id)}
              >
                {tr('Discard')}
              </button>
              <button
                type="button"
                className="experts-plan-tombol is-utama"
                data-testid="experts-plan-start"
                onClick={() => void setujui(run.id)}
              >
                {tr('Start')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * true bila `dari` (langsung atau lewat rantai) harus menunggu `cari`.
 *
 * Dipakai untuk mematikan pilihan dependensi yang akan membuat rantai
 * berputar: menetapkan "T1 setelah T2" padahal T2 sudah menunggu T1 bukan
 * urutan yang aneh, itu rencana yang tidak akan pernah mulai.
 */
function menungguSebelum(draft: TugasAhli[], dari: string, cari: string): boolean {
  const byId = new Map(draft.map((t) => [t.id, t] as const));
  const jejak = new Set<string>();
  let cur: string | null | undefined = dari;
  while (cur) {
    if (cur === cari) return true;
    if (jejak.has(cur)) return false;
    jejak.add(cur);
    cur = byId.get(cur)?.setelah ?? null;
  }
  return false;
}

function KepalaRun({ run }: { run: EkspertRun | null }) {
  const tr = useT();
  const status =
    run == null
      ? tr('Plan')
      : run.status === 'menyusun'
        ? tr('Planning…')
        : run.status === 'rencana'
          ? tr('Ready to start')
          : run.status === 'jalan'
            ? tr('Running')
            : run.status === 'selesai'
              ? tr('Completed')
              : run.status === 'gagal'
                ? tr('Failed')
                : tr('Cancelled');
  return (
    <div className="experts-plan-kepala">
      <span className="experts-plan-kepala-ikon" aria-hidden="true">
        <IkonAhli id="lead" size={14} />
      </span>
      <span className="experts-plan-kepala-judul">
        {tr('Lead Agent')} — {run ? tr('Orchestrating expert tasks') : tr('Plan')}
      </span>
      <span
        className={`experts-plan-status ${
          run && (run.status === 'selesai' ? 'is-selesai' : run.status === 'gagal' ? 'is-gagal' : '')
        }`}
      >
        {status}
      </span>
    </div>
  );
}
