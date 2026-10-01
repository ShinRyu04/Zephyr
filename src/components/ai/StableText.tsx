import { memo } from 'react';

/**
 * Teks yang digitnya tidak menggeser tata letak saat berubah.
 *
 * Timer yang naik dari `9s` ke `10s` menambah satu karakter. Di dalam baris
 * flex, itu mendorong label di sebelahnya beberapa piksel - dan karena timer
 * disegarkan tiap beberapa detik, isi barisnya terlihat bergetar terus.
 *
 * Solusinya dari Hermes Agent (`components/chat/stable-text.tsx`): setiap
 * karakter dirender sebagai sel selebar SATU karakter (`1ch`), jadi lebarnya
 * tetap berapa pun isinya. Di sana selnya juga menerima warna redup untuk
 * digit sambil mempertahankan bobot penuh untuk pemisah, supaya angka tetap
 * enak dibaca.
 *
 * `tabular-nums` ditambahkan supaya digit 1 dan 8 sama lebarnya - tanpa itu,
 * `1ch` tidak cukup karena font proporsional memberi lebar berbeda per digit.
 */
interface Props {
  /** Teks yang ditampilkan, mis. "1:23" atau "45s". */
  teks: string;
  /** Lebar sel minimum, untuk mencegah baris menyempit di nilai pendek. */
  minSel?: number;
  /** Warna redup untuk digit; pemisah tetap memakai warna induknya. */
  warnaDigit?: string;
  judul?: string;
  className?: string;
}

/** Karakter yang dianggap pemisah: dilebar penuh, bukan diredupkan. */
const PEMISAH = new Set([':', '.', ',', '/', ' ', '-']);

function StableText({ teks, minSel = 0, warnaDigit, judul, className }: Props) {
  const sel = Math.max(minSel, teks.length);

  return (
    <span
      className={className}
      title={judul}
      style={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        minWidth: `${sel}ch`,
        textAlign: 'right',
      }}
    >
      {Array.from(teks).map((ch, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: '1ch',
            textAlign: 'center',
            /* Pemisah dibiarkan penuh: itu yang membuat "1:23" terbaca sebagai
               satu nilai, bukan tiga angka yang kebetulan berdampingan. */
            color: warnaDigit && !PEMISAH.has(ch) ? warnaDigit : undefined,
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export default memo(StableText);
