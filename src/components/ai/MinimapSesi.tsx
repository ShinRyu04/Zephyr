import { useEffect, useRef, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import type { ChatMsg } from '../../lib/types';
import { useT } from '../../lib/i18n';

/*
 * Minimap sesi — satu sel per pesan, klik = lompat ke pesan itu.
 *
 * Terinspirasi rail omp-desktop, tapi bentuknya sendiri: kolom sel di tepi
 * KANAN bawah area transkrip, `position: sticky` di dalam scroller sehingga
 * selalu terlihat tanpa portal ke luar panel. Muncul hanya dari 8 pesan —
 * di bawah itu transkrip masih muat satu layar dan minimap cuma deretan titik
 * tanpa gunanya.
 *
 * Sel bukan hiasan: warnanya membawa informasi (user / jawaban / giliran
 * ber-tool / error), dan jendela pandang digambar di atas sel yang sedang di
 * layar, jadi pembaca tahu posisinya DI transkrip sebelum melompat.
 */

/** Jumlah pesan minimum sebelum rail tergambar. */
const AMBANG_SELMAT = 8;

const PESAN_KOSONG: ChatMsg[] = [];

export default function MinimapSesi({
  composerId = '',
  ambilScroller,
}: {
  composerId?: string;
  ambilScroller: () => HTMLDivElement | null;
}) {
  const tr = useT();
  const msgs = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    return (id ? s.sessions.find((x) => x.id === id)?.messages : null) ?? PESAN_KOSONG;
  });

  const [pandang, setPandang] = useState<{ awal: number; akhir: number }>({ awal: 0, akhir: 1 });
  const raf = useRef(0);

  /* Fraksi gulir → rentang pesan kasar. Disinkronkan pada event scroll di
     elemen scroller sendiri (rAF-throttled): AiPanel punya listener scroll
     untuk lengket-bawah, tapi keadaan pandang rail adalah urusannya sendiri. */
  useEffect(() => {
    if (msgs.length < AMBANG_SELMAT) return;
    const el = ambilScroller();
    if (!el) return;
    const ukur = () => {
      const total = el.scrollHeight;
      if (total <= 0) return;
      const awal = el.scrollTop / total;
      const akhir = Math.min(1, (el.scrollTop + el.clientHeight) / total);
      setPandang((lama) =>
        Math.abs(lama.awal - awal) < 0.004 && Math.abs(lama.akhir - akhir) < 0.004
          ? lama
          : { awal, akhir },
      );
    };
    ukur();
    const onScroll = () => {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = 0;
        ukur();
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf.current) {
        window.cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
    };
  }, [ambilScroller, msgs.length]);

  if (msgs.length < AMBANG_SELMAT) return null;

  const lompat = (id: string) => {
    const scope = ambilScroller() ?? document;
    const baris = scope.querySelector<HTMLElement>(`[data-ai-row="${CSS.escape(id)}"]`);
    baris?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div
      className="mm-rail"
      data-testid="ai-minimap"
      role="navigation"
      aria-label={tr('Session Info')}
    >
      <div className="mm-rail-sel" style={{ top: `${pandang.awal * 100}%`, height: `${Math.max(4, (pandang.akhir - pandang.awal) * 100)}%` }} aria-hidden="true" />
      {msgs.map((m, i) => (
        <button
          key={m.id}
          type="button"
          className={`mm-cell is-${m.role}${m.error ? ' is-error' : ''}${m.tools?.length ? ' is-tool' : ''}`}
          aria-label={`#${i + 1}`}
          title={`#${i + 1}`}
          onClick={() => lompat(m.id)}
        />
      ))}
    </div>
  );
}
