import { memo, useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';

/*
 * The live clock in the transcript header, and the day separator.
 *
 * Two halves of one idea: a reader scrolling a long conversation has no way to
 * tell whether the answer above them arrived a minute or a week ago, and the
 * clock is the anchor that makes the separators mean something. Showing a
 * timestamp per message would be noise — every bubble would carry a number
 * nobody reads — so the date is marked ONCE where it changes and the current
 * time lives in one place.
 *
 * The message records already carry `at: number`; this never invents a time.
 */

/** Local midnight for a timestamp, as a comparable number. */
function awalHari(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * "+1 hari" / "Hari ini" / "Besok", by calendar day rather than by 24-hour
 * spans.
 *
 * `Math.round((a - b) / 86400000)` is the tempting one-liner and it is wrong:
 * 23:00 yesterday to 01:00 today is two hours but a different DAY, and a
 * reader counts days by the calendar, not by elapsed hours.
 */
function selisihHari(ms: number, sekarang: number): number {
  const hariIni = awalHari(sekarang);
  const hariItu = awalHari(ms);
  return Math.round((hariIni - hariItu) / 86_400_000);
}

/** The clock shown in the header: hours and minutes, per the OS locale. */
export function jamSekarang(now: number): string {
  return new Date(now).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The day separator's label.
 *
 * "Today" and "Yesterday" are spelled out because they are the two the reader
 * actually scans for; anything older gets a real date, since "+5 hari" makes
 * them do arithmetic to place it. The date itself is formatted by the OS
 * locale — a hand-built "08 Okt 2026" would be wrong in ten of the eleven
 * languages this app ships.
 */
export function labelTanggal(ms: number, now: number, tr: (s: string) => string): string {
  const selisih = selisihHari(ms, now);
  if (selisih === 0) return tr('Today');
  if (selisih === 1) return tr('Yesterday');
  if (selisih === -1) return tr('Tomorrow');
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * A day divider, drawn once where the calendar day changes.
 *
 * Rendered between two messages rather than above every one: the transcript is
 * read as a sequence, and a rule with a date on it is the least intrusive way
 * to say "everything below this line is a different day".
 */
export const DayDivider = memo(function DayDivider({ at }: { at: number }) {
  const tr = useT();
  /*
   * Read once, at mount. The label is a calendar fact about a past message, so
   * re-rendering it every minute would only matter in the seconds around
   * midnight — and the clock below already covers "what time is it now".
   */
  const [now] = useState(() => Date.now());
  return (
    <div className="ai-day-div" data-testid="ai-day-div" role="separator">
      <span className="ai-day-div-line" aria-hidden="true" />
      <span className="ai-day-div-text">{labelTanggal(at, now, tr)}</span>
      <span className="ai-day-div-line" aria-hidden="true" />
    </div>
  );
});

/**
 * The live clock.
 *
 * Its own component so the once-a-minute tick cannot re-render the transcript:
 * this is mounted beside the header, and a state change here redraws only
 * these few characters.
 *
 * It ticks on the MINUTE, aligned to the wall clock. `setInterval(1000)` would
 * be sixty times the work for a display that never changes faster than once a
 * minute, and a naive 60s interval drifts: it is scheduled from page load, so
 * the display would update at :37 of every minute instead of at :00.
 */
export const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number;
    const tik = () => {
      const s = Date.now();
      setNow(s);
      /* Aim at the next minute boundary, and add a small guard so a timer that
         fires a hair early cannot compute the same minute twice and stall. */
      const sisa = 60_000 - (s % 60_000);
      timer = window.setTimeout(tik, sisa + 50);
    };
    const s = Date.now();
    timer = window.setTimeout(tik, 60_000 - (s % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);

  const jam = useMemo(() => jamSekarang(now), [now]);
  return (
    <time className="ai-clock" data-testid="ai-clock" dateTime={new Date(now).toISOString()}>
      {jam}
    </time>
  );
});
