import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOutput } from '../../lib/outputStore';
import { useT, useTf } from '../../lib/i18n';

const ROW_H = 18;
const PAD = 8;

export default function OutputView() {
  const tr = useT();
  const tf = useTf();
  const channels = useOutput((s) => s.channels);
  const activeChannel = useOutput((s) => s.activeChannel);
  const autoScroll = useOutput((s) => s.autoScroll);
  const wrap = useOutput((s) => s.wrap);
  const setActiveChannel = useOutput((s) => s.setActiveChannel);
  const toggleAutoScroll = useOutput((s) => s.toggleAutoScroll);
  const toggleWrap = useOutput((s) => s.toggleWrap);
  const clear = useOutput((s) => s.clear);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [tinggi, setTinggi] = useState(300);

  const ch = channels.find((c) => c.id === activeChannel);
  const lines = ch?.lines ?? [];
  const total = lines.length;

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [total, autoScroll, activeChannel]);

  useEffect(() => {
    setScrollTop(0);
  }, [activeChannel]);

  const mulai = Math.max(0, Math.floor(scrollTop / ROW_H) - PAD);
  const jml = Math.ceil(tinggi / ROW_H) + PAD * 2;
  const tampil = lines.slice(mulai, mulai + jml);

  return (
    <div className="ov-root" data-testid="output-view">
      <div className="ov-toolbar">
        <select
          className="ov-select"
          data-testid="ov-channel"
          value={activeChannel}
          onChange={(e) => setActiveChannel(e.target.value)}
          aria-label={tr('Select output channel')}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.lines.length > 0 ? ` (${c.lines.length})` : ''}
              {c.dirty ? ' •' : ''}
            </option>
          ))}
        </select>

        <span className="ov-spacer" />

        <button
          className="btn btn-sm"
          data-testid="ov-wrap"
          aria-pressed={wrap}
          title={tr('Wrap long lines')}
          onClick={toggleWrap}
        >
          Wrap{wrap ? ' ✓' : ''}
        </button>
        <button
          className="btn btn-sm"
          data-testid="ov-lock"
          aria-pressed={!autoScroll}
          title={tr('Scroll lock: stop auto-scroll when new lines arrive')}
          onClick={toggleAutoScroll}
        >
          {autoScroll ? 'Auto-scroll' : 'Locked'}
        </button>
        <button
          className="btn btn-sm"
          data-testid="ov-clear"
          title="Clear this channel"
          onClick={() => clear(activeChannel)}
        >
          Clear
        </button>
        <span className="ov-count" data-testid="ov-count">
          {total}
        </span>
      </div>

      <div
        className={`ov-list${wrap ? ' is-wrap' : ''}`}
        data-testid="ov-list"
        ref={(el) => {
          scrollRef.current = el;
          if (el && el.clientHeight > 0 && Math.abs(el.clientHeight - tinggi) > 8) {
            setTinggi(el.clientHeight);
          }
        }}
        onScroll={(e) => {
          const el = e.target as HTMLDivElement;
          setScrollTop(el.scrollTop);

          const diBawah = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 2;
          if (!diBawah && autoScroll) toggleAutoScroll();
        }}
      >
        {total === 0 ? (
          <p className="ov-empty" data-testid="ov-empty">
            {tf('Channel "{name}" is still empty.', { name: ch?.label ?? activeChannel })}
          </p>
        ) : (
          <div className="ov-spacer" style={{ height: total * ROW_H }}>
            <div className="ov-window" style={{ transform: `translateY(${mulai * ROW_H}px)` }}>
              {tampil.map((l, i) => (
                <div className="ov-line" data-testid="ov-line" key={mulai + i} style={{ height: ROW_H }}>
                  {l || '\u00a0'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
