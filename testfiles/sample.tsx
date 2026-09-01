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
