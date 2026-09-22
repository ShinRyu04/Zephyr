// ReasonedBlock.tsx — blok "Reasoned" ala TEDI: teks penalaran model
// sebelum jawaban, bisa dilipat.
//
// Kenapa komponen sendiri: blok ini menempel di SETIAP bubble jawaban, jadi
// ia harus (a) tidak menambah satu pun hook store, dan (b) tidak menyimpan
// state berat. Satu useState + satu useRef sudah cukup.
//
// Kenapa di-auto-scroll: saat model masih berpikir, teksnya mengalir cepat.
// Tanpa auto-scroll, user melihat bagian ATAS penalaran sementara yang baru
// ada di bawah — blok terasa "beku".

import { useEffect, useRef, useState } from 'react';
import { tx } from '../../lib/i18n';

export default function ReasonedBlock({
  text,
  streaming,
}: {
  text: string;
  /** true = penalaran masih mengalir (blok dibuka + auto-scroll). */
  streaming: boolean;
}) {
  // Saat mengalir: terbuka. Setelah selesai: ikut pilihan user (default
  // terlipat supaya jawaban jadi fokus).
  const [terbuka, setTerbuka] = useState(streaming);
  const preRef = useRef<HTMLPreElement | null>(null);

  // Begitu streaming berhenti, biarkan user yang menentukan — jangan paksa
  // tutup, karena menutup tiba-tiba terasa seperti konten hilang.
  useEffect(() => {
    if (streaming) setTerbuka(true);
  }, [streaming]);

  useEffect(() => {
    if (terbuka && streaming && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, terbuka, streaming]);

  const baris = text.split('\n').length;
  const karakter = text.length;

  return (
    <div className="ai-reasoned" data-testid="ai-reasoned">
      <button
        className="ai-reasoned-head"
        data-testid="ai-reasoned-toggle"
        aria-expanded={terbuka}
        onClick={() => setTerbuka((v) => !v)}
      >
        <span className="ai-reasoned-caret">{terbuka ? '▾' : '▸'}</span>
        <span className="ai-reasoned-label">
          {streaming ? tx('Sedang berpikir…') : tx('Penalaran')}
        </span>
        <span className="ai-reasoned-meta">
          {baris > 1 ? `${baris} ${tx('baris')} · ` : ''}
          {karakter} {tx('karakter')}
        </span>
      </button>
      {terbuka && (
        <pre className="ai-reasoned-body" ref={preRef}>
          {text}
        </pre>
      )}
    </div>
  );
}
