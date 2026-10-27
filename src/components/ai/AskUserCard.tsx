import { useEffect, useRef, useState } from 'react';
import type { LangkahTanya, TanyaAktif } from '../../lib/aiStore';

/*
 * Kartu pertanyaan agen (tool `ask_user`), bentuk FORM BERTAHAP ala VS Code.
 *
 * Mengapa beberapa LANGKAH dan bukan satu pertanyaan dengan chips: satu
 * pertanyaan hanya bisa menampilkan pilihan, sedangkan kebutuhan nyata sering
 * berantai - "pilih target, lalu sebutkan jumlah, lalu konfirmasi". Setiap
 * langkah digambar sebagai field yang sesuai tipenya, nomornya dihitung `n/m`,
 * dan Submit mengirim SELURUH jawaban sekali jalan. Agen menerima satu hasil
 * utuh, bukan tiga jawaban terpisah yang masing-masing memulai langkah baru.
 *
 * Mengapa ✕ di kepala, bukan tombol "Batal" di kaki: menutup kartu berarti
 * "putuskan sendiri", dan itu bukan aksi utama formulir ini. Ia tetap memakai
 * testid `ai-tanya-batal` supaya jalur pembatalan tetap satu pintu.
 *
 * Kartu ini hidup DI DALAM area gulir chat, jadi ia ikut naik-turun bersama
 * riwayat dan terbaca tepat di bawah konteks yang menimbulkan pertanyaannya.
 */

/** Satu jawaban per langkah. Satu bentuk untuk empat tipe. */
interface JawabanLangkah {
  /** Opsi tercentang; kosong untuk tipe field. */
  dipilih: string[];
  /** Isi field bebas (atau jawaban tulis-sendiri di daftar pilihan). */
  bebas: string;
}

const KOSONG: JawabanLangkah = { dipilih: [], bebas: '' };

function isiLangkah(j: Record<number, JawabanLangkah>, i: number): string {
  const d = j[i] ?? KOSONG;
  return [...d.dipilih, d.bebas.trim()].filter(Boolean).join(', ');
}

/**
 * Ringkasan semua jawaban, bernomor seperti daftar.
 *
 * Dikirim sebagai SATU string, bukan JSON: hasil tool dibaca model sebagai
 * prosa, dan `1. <pertanyaan>: <jawaban>` langsung terbaca tanpa perlu diurai.
 */
function ringkasJawaban(langkah: LangkahTanya[], j: Record<number, JawabanLangkah>): string {
  return langkah.map((l, i) => `${i + 1}. ${l.pertanyaan}: ${isiLangkah(j, i) || '-'}`).join('\n');
}

export default function AskUserCard({
  tanya,
  onJawab,
  tr,
  tf,
}: {
  tanya: TanyaAktif;
  onJawab: (v: string | null) => void;
  tr: (k: string) => string;
  tf: (k: string, isi: Record<string, string | number>) => string;
}) {
  const langkah = tanya.langkah;
  const jumlah = langkah.length;
  const [langkahKe, setLangkahKe] = useState(0);
  const [jawaban, setJawaban] = useState<Record<number, JawabanLangkah>>({});
  const [terlipat, setTerlipat] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bebasRef = useRef<HTMLInputElement | null>(null);
  const opsiRef = useRef<Array<HTMLInputElement | null>>([]);

  const ini = langkah[Math.min(langkahKe, Math.max(0, jumlah - 1))];
  const d = jawaban[langkahKe] ?? KOSONG;
  const bolehKirim = langkah.every((l, i) => l.wajib !== true || isiLangkah(jawaban, i).length > 0);

  /*
   * Fokus diletakkan di kontrol yang benar begitu langkahnya berganti.
   *
   * Untuk langkah PILIHAN, yang difokus bukan field teks melainkan opsi
   * pertama: fokus di kotak teks akan menelan angka 1-9 sebagai isi field,
   * padahal angka itu justru pintasan memilih opsi (lihat `onKeyDown`).
   */
  useEffect(() => {
    if (terlipat) return;
    const l = langkah[Math.min(langkahKe, Math.max(0, jumlah - 1))];
    if (!l) return;
    const t = window.setTimeout(() => {
      if (l.tipe === 'pilih-satu' || l.tipe === 'pilih-banyak') opsiRef.current[0]?.focus();
      else inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [langkahKe, terlipat, jumlah, langkah]);

  const ubah = (i: number, next: JawabanLangkah) =>
    setJawaban((s) => ({ ...s, [i]: next }));

  const pilihOpsi = (i: number, l: LangkahTanya, nilai: string) =>
    setJawaban((s) => {
      const lama = s[i] ?? KOSONG;
      if (l.tipe === 'pilih-banyak') {
        const ada = lama.dipilih.includes(nilai);
        return {
          ...s,
          [i]: {
            ...lama,
            dipilih: ada ? lama.dipilih.filter((x) => x !== nilai) : [...lama.dipilih, nilai],
          },
        };
      }
      /* pilih-satu: satu jawaban saja, jadi tulis-sendiri dibersihkan. */
      return { ...s, [i]: { dipilih: [nilai], bebas: '' } };
    });

  /* Kebalikannya: menulis sendiri membatalkan opsi yang tercentang. */
  const tulisSendiri = (i: number, l: LangkahTanya, teks: string) =>
    setJawaban((s) => ({
      ...s,
      [i]: { dipilih: l.tipe === 'pilih-banyak' ? (s[i] ?? KOSONG).dipilih : [], bebas: teks },
    }));

  const kirim = () => {
    if (!bolehKirim) return;
    onJawab(ringkasJawaban(langkah, jawaban));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onJawab(null);
      return;
    }

    /* Ctrl/Cmd+Enter = kirim. Berlaku dari langkah mana pun: formulir panjang
       tidak boleh memaksa pembaca berjalan ke ujung dulu hanya untuk mengirim. */
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      kirim();
      return;
    }

    const target = e.target as HTMLElement | null;
    const tipeTarget = target?.getAttribute?.('type');
    const sedangMengetik =
      target?.tagName === 'TEXTAREA' || tipeTarget === 'text' || tipeTarget === 'number';

    if (e.key === 'Enter' && !e.shiftKey) {
      if (target?.tagName === 'BUTTON') return;
      e.preventDefault();
      /* Enter di langkah antara = maju, bukan mengirim formulir yang belum
         lengkap. Di langkah terakhir ia mengirim. */
      if (langkahKe < jumlah - 1) setLangkahKe((n) => n + 1);
      else kirim();
      return;
    }

    /* Angka 1-9 memilih opsi, kecuali saat jari memang sedang mengetik. */
    if (sedangMengetik || target?.tagName === 'BUTTON') return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const l = langkah[langkahKe];
    if (!l || (l.tipe !== 'pilih-satu' && l.tipe !== 'pilih-banyak')) return;
    const opsi = l.pilihan ?? [];
    /* Nomor sesudah opsi terakhir adalah baris "tulis sendiri": nomor itu
       memindahkan fokus ke fieldnya, bukan memilih sesuatu. */
    if (n === opsi.length + 1) {
      e.preventDefault();
      bebasRef.current?.focus();
      return;
    }
    const nilai = opsi[n - 1];
    if (nilai === undefined) return;
    e.preventDefault();
    pilihOpsi(langkahKe, l, nilai);
  };

  if (!ini) return null;

  const berdaftar = ini.tipe === 'pilih-satu' || ini.tipe === 'pilih-banyak';
  const opsi = ini.pilihan ?? [];

  return (
    <div
      className="ai-tanya"
      role="alertdialog"
      aria-label={tf('Step {n} of {m}', { n: langkahKe + 1, m: jumlah })}
      data-testid="ai-agent-tanya"
      onKeyDown={onKeyDown}
    >
      <div className="ai-tanya-kepala">
        <span className="ai-tanya-judul">{ini.pertanyaan}</span>
        <button
          type="button"
          className="ai-tanya-ikon"
          data-testid="ai-tanya-batal"
          title={tr('Cancel')}
          aria-label={tr('Cancel')}
          onClick={() => onJawab(null)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <button
          type="button"
          className="ai-tanya-ikon"
          data-testid="ai-tanya-lipat"
          title={tr(terlipat ? 'Expand' : 'Collapse')}
          aria-label={tr(terlipat ? 'Expand' : 'Collapse')}
          aria-expanded={!terlipat}
          onClick={() => setTerlipat((v) => !v)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {terlipat ? <path d="M4.5 10 8 6.5l3.5 3.5" /> : <path d="M4.5 6.5 8 10l3.5-3.5" />}
          </svg>
        </button>
      </div>

      {!terlipat && (
        <>
          <div className="ai-tanya-badan">
            {ini.deskripsi && <p className="ai-tanya-deskripsi">{ini.deskripsi}</p>}
            {!berdaftar && (
              <input
                ref={inputRef}
                className="ai-tanya-field"
                data-testid="ai-tanya-field"
                type={ini.tipe === 'angka' ? 'number' : 'text'}
                value={d.bebas}
                placeholder={tr('Enter your answer')}
                onChange={(e) => ubah(langkahKe, { dipilih: [], bebas: e.target.value })}
              />
            )}
            {berdaftar && (
              <div className="ai-tanya-daftar">
                {opsi.map((p, i) => {
                  const aktif = d.dipilih.includes(p);
                  return (
                    <label
                      key={`${i}-${p}`}
                      className={`ai-tanya-baris${aktif ? ' aktif' : ''}`}
                      data-testid={`ai-tanya-opsi-${i}`}
                    >
                      <input
                        ref={(el) => {
                          opsiRef.current[i] = el;
                        }}
                        className="ai-tanya-sr"
                        type={ini.tipe === 'pilih-satu' ? 'radio' : 'checkbox'}
                        name={`ai-tanya-${langkahKe}`}
                        checked={aktif}
                        onChange={() => pilihOpsi(langkahKe, ini, p)}
                      />
                      <span className="ai-tanya-no" aria-hidden="true">{i + 1}</span>
                      <span className="ai-tanya-opsi-teks">{p}</span>
                      {aktif && (
                        <svg className="ai-tanya-centang" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3.5 8.5 6.5 11.5l6-7" />
                        </svg>
                      )}
                    </label>
                  );
                })}
                <label className="ai-tanya-baris ai-tanya-baris-bebas">
                  <span className="ai-tanya-no" aria-hidden="true">{opsi.length + 1}</span>
                  <input
                    ref={bebasRef}
                    className="ai-tanya-field ai-tanya-field-bebas"
                    data-testid="ai-tanya-field"
                    type="text"
                    value={d.bebas}
                    placeholder={tr('Enter your answer')}
                    onChange={(e) => tulisSendiri(langkahKe, ini, e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="ai-tanya-kaki">
            <button
              type="button"
              className="ai-tanya-panah"
              data-testid="ai-tanya-mundur"
              title={tr('Previous')}
              aria-label={tr('Previous')}
              disabled={langkahKe === 0}
              onClick={() => setLangkahKe((n) => Math.max(0, n - 1))}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 3.5 5.5 8l4.5 4.5" />
              </svg>
            </button>
            <button
              type="button"
              className="ai-tanya-panah"
              data-testid="ai-tanya-maju"
              title={tr('Next')}
              aria-label={tr('Next')}
              disabled={langkahKe >= jumlah - 1}
              onClick={() => setLangkahKe((n) => Math.min(jumlah - 1, n + 1))}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </button>
            <span
              className="ai-tanya-hitung"
              data-testid={`ai-tanya-langkah-${langkahKe + 1}`}
              title={tf('Step {n} of {m}', { n: langkahKe + 1, m: jumlah })}
            >
              {langkahKe + 1}/{jumlah}
            </span>
            {langkahKe === jumlah - 1 && (
              <>
                <span className="ai-tanya-hint">{tr('Ctrl+Enter to submit')}</span>
                <button
                  type="button"
                  className="ai-tanya-kirim"
                  data-testid="ai-tanya-kirim"
                  disabled={!bolehKirim}
                  onClick={kirim}
                >
                  {tr('Submit')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
