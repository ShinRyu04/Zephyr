// ZEPHYR_VERIFY_1790398977516
// ZEPHYR_VERIFY_1790398943340
// ZEPHYR_VERIFY_1790091259922
// ZEPHYR_VERIFY_1790090671397
// ZEPHYR_VERIFY_1790090538099
// ZEPHYR_VERIFY_1790088188430
// ZEPHYR_VERIFY_1790070056831
// ZEPHYR_VERIFY_1790069868544
// ZEPHYR_VERIFY_1790065889264
// ZEPHYR_VERIFY_1790059631385
// ZEPHYR_VERIFY_1790056346019
// ZEPHYR_VERIFY_1790056230600
// ZEPHYR_VERIFY_1790055905154
// Berkas uji fase 03 — cek syntax highlight TSX.
import { useState } from 'react';

interface Props {
  title: string;
  count?: number;
}

export default function Demo({ title, count = 0 }: Props) {
  const [n, setN] = useState<number>(count);
  const label = `${title}: ${n}`;

  // komentar: angka, string, keyword, tipe harus berwarna beda
  const items = [1, 2, 3].map((x) => x * 2);

  return (
    <div className="demo" onClick={() => setN(n + 1)}>
      <h1>{label}</h1>
      <ul>
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
