/**
 * Pratinjau tema - SATU komponen, dipakai di dua tempat.
 *
 * ## Kenapa satu
 *
 * Halaman Tema dulu menampilkan strip tiga batang warna (`tp-kw`, `tp-str`,
 * `tp-fn`) di dalam kartu, dan pratinjau besar tidak ada sama sekali. Begitu
 * pratinjau besar ditambahkan dengan markup sendiri, dua tempat itu pasti
 * berbeda: satu menampilkan tiga token, satu menampilkan sebelas, dan "tema
 * seperti apa ini" terjawab berbeda tergantung dari mana orang melihat. Jadi
 * komponen ini satu-satunya yang tahu bentuk pratinjau; kartu memakainya
 * (`ukuran="kartu"`), bagian atas halaman memakainya lagi (`ukuran="besar"`).
 * Yang berbeda hanya skala, dan skala itu urusan gaya - markup-nya identik,
 * sehingga tidak ada isi kedua yang bisa menyimpang dari yang pertama.
 *
 * `scripts/uji-halaman-tema.mjs` mengunci hal itu: hanya SATU berkas di `src/`
 * yang boleh memuat `data-tema-pratinjau`, dan keluaran kedua ukuran harus
 * memuat jumlah token serta cip yang sama persis.
 *
 * ## Kenapa isinya begini
 *
 * Yang menentukan "tema ini cocok atau tidak" bukan satu-dua warna, melainkan
 * sebelas token warna kode (`--syn-*`) yang dipakai editor sungguhan plus warna
 * antarmuka di sekelilingnya. Karena itu isinya:
 *
 *   * potongan kode dengan token asli (kata kunci, fungsi, tipe, variabel,
 *     operator, string, angka, komentar, tag, atribut) - diwarnai lewat
 *     variabel CSS, bukan warna keras;
 *   * deretan cip untuk SEBELAS token `--syn-*` dan delapan warna antarmuka
 * utama (latar, panel, tepi, teks, teks redup, aksen, latar editor).
 *
 * ## Warna tidak pernah ditulis di sini
 *
 * Setiap warna datang dari variabel tema: token kode memakai `var(--syn-*)`,
 * sampel antarmuka memakai `var(--bg)` dan kawan-kawannya. Tidak ada nilai warna
 * keras di berkas ini maupun di gaya tata letaknya, jadi pratinjau tidak bisa
 * berbeda warna dari tema yang benar-benar dipasang.
 *
 * ## Gaya tata letak disuntikkan dari berkas ini
 *
 * Bukan dari CSS terpisah: komponen ini satu-satunya pemilik bentuk pratinjau,
 * dan aturan yang tinggal di berkas lain adalah aturan kedua yang bisa
 * tertinggal saat markupnya berubah. Penyuntikan dijaga agar berjalan sekali dan
 * aman dipanggil dari node (tanpa `document`).
 *
 * ## `data-theme` di akarnya
 *
 * Token tema dibaca dari elemen ini sendiri, jadi pratinjau tetap benar saat
 * tema itu BELUM dipilih - itulah gunanya membandingkan: kartu tema lain
 * menampilkan warna tema lain di halaman yang masih memakai tema lama.
 */
import type { CSSProperties } from 'react';

/** Sebelas token warna kode. Sumbernya sama dengan editor (`src/styles/*.css`). */
export const TOKEN_SINTAKS = [
  '--syn-keyword',
  '--syn-string',
  '--syn-number',
  '--syn-comment',
  '--syn-function',
  '--syn-variable',
  '--syn-type',
  '--syn-operator',
  '--syn-tag',
  '--syn-attr',
  '--syn-invalid',
] as const;

export type TokenSintaks = (typeof TOKEN_SINTAKS)[number];

/** Warna antarmuka yang paling menentukan watak sebuah tema. */
export const WARNA_UI = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--text',
  '--text-muted',
  '--accent',
  '--editor-bg',
] as const;

export type WarnaUi = (typeof WARNA_UI)[number];

/**
 * Tata letak pratinjau.
 *
 * Tanpa satu pun nilai warna: semua warna dipasang inline per elemen sebagai
 * `var(--...)` (lihat `PratinjauTema`), jadi tema apa pun tetap benar tanpa satu
 * aturan warna di sini. Nama token disembunyikan di ukuran kartu dan dicetak di
 * ukuran besar - satu markup, dua skala.
 */
export const GAYA_PRATINJAU = `
.tpv{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0}
.tpv-jendela{display:flex;border:1px solid var(--border);border-radius:6px;background:var(--editor-bg,var(--bg));overflow:hidden}
.tpv-sisi{display:flex;flex-direction:column;gap:4px;padding:6px 5px;border-right:1px solid var(--border);background:var(--surface)}
.tpv-sisi-garis{display:block;width:14px;height:2px;border-radius:2px;background:var(--text-muted);opacity:.55}
.tpv-kode{display:flex;flex-direction:column;gap:2px;padding:6px 8px;flex:1 1 auto;min-width:0;font-family:var(--font-mono,ui-monospace,monospace)}
.tpv-baris{display:block;white-space:pre}
.tpv-tok{display:inline}
.tpv-palet{display:flex;flex-wrap:wrap;gap:4px}
.tpv-item{display:inline-flex;align-items:center;gap:3px}
.tpv-cip{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid var(--border)}
.tpv-label{font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;color:var(--text-muted)}
.tpv-kartu .tpv-label{display:none}
.tpv-kartu .tpv-kode{font-size:9px;line-height:1.35}
.tpv-kartu .tpv-cip{width:9px;height:9px}
.tpv-besar .tpv-kode{font-size:11.5px;line-height:1.55}
.tpv-besar .tpv-palet{gap:6px}
`;

const ID_GAYA = 'zpr-gaya-pratinjau-tema';

/** Suntikkan gaya tata letak SEKALI; aman dipanggil dari mana pun, termasuk node. */
export function pasangGayaPratinjau(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ID_GAYA)) return;
  const el = document.createElement('style');
  el.id = ID_GAYA;
  el.textContent = GAYA_PRATINJAU;
  document.head.appendChild(el);
}

if (typeof document !== 'undefined') pasangGayaPratinjau();

interface Potongan {
  tok: TokenSintaks;
  teks: string;
}

/**
 * Potongan kode contoh.
 *
 * Dipilih supaya sepuluh dari sebelas token kelihatan di teks nyata, bukan di
 * daftar. `--syn-invalid` sengaja TIDAK dipakai di sini: kode contoh yang sengaja
 * rusak membuat pratinjau tampak seperti bug tema, sedangkan warnanya tetap
 * terlihat di cip di bawahnya - tempat yang memang untuk itu.
 */
const BARIS_CONTOH: Potongan[][] = [
  [
    { tok: '--syn-keyword', teks: 'export function' },
    { tok: '--syn-function', teks: ' hitung' },
    { tok: '--syn-variable', teks: '(total' },
    { tok: '--syn-type', teks: ': number' },
    { tok: '--syn-operator', teks: ') {' },
  ],
  [{ tok: '--syn-comment', teks: '  // jumlahkan hanya angka' }],
  [
    { tok: '--syn-keyword', teks: '  const' },
    { tok: '--syn-variable', teks: ' label' },
    { tok: '--syn-operator', teks: ' = ' },
    { tok: '--syn-string', teks: '"total: "' },
    { tok: '--syn-operator', teks: ' + ' },
    { tok: '--syn-variable', teks: 'total' },
    { tok: '--syn-operator', teks: ';' },
  ],
  [
    { tok: '--syn-keyword', teks: '  return ' },
    { tok: '--syn-tag', teks: '<span' },
    { tok: '--syn-attr', teks: ' data-n' },
    { tok: '--syn-operator', teks: '={' },
    { tok: '--syn-number', teks: '42' },
    { tok: '--syn-operator', teks: '}>' },
    { tok: '--syn-variable', teks: '{label}' },
    { tok: '--syn-tag', teks: '</span>' },
    { tok: '--syn-operator', teks: ';' },
  ],
  [
    { tok: '--syn-keyword', teks: '  const' },
    { tok: '--syn-variable', teks: ' sisa' },
    { tok: '--syn-operator', teks: ' = ' },
    { tok: '--syn-number', teks: '0.5' },
    { tok: '--syn-comment', teks: '  // sisanya dibulatkan' },
  ],
];

export type UkuranPratinjau = 'kartu' | 'besar';

export interface PropsPratinjau {
  /** Id tema; dipasang sebagai `data-theme` supaya token tema itu yang dipakai. */
  themeId: string;
  ukuran?: UkuranPratinjau;
  /** Aksen pilihan pembaca, bila ada - menimpa `--accent` tema ini saja. */
  accent?: string;
}

export function PratinjauTema({ themeId, ukuran = 'kartu', accent }: PropsPratinjau) {
  const gaya: CSSProperties | undefined =
    accent && /^#[0-9a-f]{6}$/i.test(accent)
      ? ({ '--accent': accent } as CSSProperties)
      : undefined;

  return (
    <span
      className={`tpv tpv-${ukuran}`}
      data-tema-pratinjau={themeId}
      data-ukuran={ukuran}
      data-theme={themeId}
      style={gaya}
      aria-hidden="true"
    >
      <span className="tpv-jendela">
        <span className="tpv-sisi">
          <span className="tpv-sisi-garis" />
          <span className="tpv-sisi-garis" />
          <span className="tpv-sisi-garis" />
        </span>
        <span className="tpv-kode">
          {BARIS_CONTOH.map((baris, i) => (
            <span className="tpv-baris" key={i}>
              {baris.map((p, j) => (
                /* Warna token diambil dari variabel tema ini sendiri - token
                   yang sama dengan yang dipakai editor, bukan tiruannya. */
                <span
                  className="tpv-tok"
                  data-tok={p.tok}
                  key={j}
                  style={{ color: `var(${p.tok})` }}
                >
                  {p.teks}
                </span>
              ))}
            </span>
          ))}
        </span>
      </span>
      <span className="tpv-palet">
        {TOKEN_SINTAKS.map((t) => (
          <span className="tpv-item" key={t}>
            {/* Warna cip = nilai token itu sendiri; tidak ada warna keras. */}
            <span
              className="tpv-cip"
              data-cip={t}
              title={t}
              style={{ background: `var(${t})` }}
            />
            <code className="tpv-label">{t}</code>
          </span>
        ))}
        {WARNA_UI.map((t) => (
          <span className="tpv-item" key={t}>
            <span
              className="tpv-cip tpv-cip-ui"
              data-cip={t}
              title={t}
              style={{ background: `var(${t})` }}
            />
            <code className="tpv-label">{t}</code>
          </span>
        ))}
      </span>
    </span>
  );
}

export default PratinjauTema;
