import { useDebug } from '../../lib/debugStore';

export default function DebugToolbar() {
  const state = useDebug((s) => s.state);
  const kontrol = useDebug((s) => s.kontrol);
  const stop = useDebug((s) => s.stop);
  const restart = useDebug((s) => s.restart);

  if (state === 'inactive') return null;

  const paused = state === 'stopped';

  return (
    <div className="dbg-toolbar" data-testid="dbg-toolbar" data-state={state} role="toolbar"
      aria-label="Debug">
      <button
        className="dbg-tb-btn"
        title={paused ? 'Continue (F5)' : 'Pause (F6)'}
        data-testid={paused ? 'dbg-tb-continue' : 'dbg-tb-pause'}
        onClick={() => void kontrol(paused ? 'continue' : 'pause')}
      >
        {paused ? '▶' : '⏸'}
      </button>
      <button
        className="dbg-tb-btn"
        title="Step Over (F10)"
        data-testid="dbg-tb-next"
        disabled={!paused}
        onClick={() => void kontrol('next')}
      >
        ⤼
      </button>
      <button
        className="dbg-tb-btn"
        title="Step Into (F11)"
        data-testid="dbg-tb-stepin"
        disabled={!paused}
        onClick={() => void kontrol('stepIn')}
      >
        ↓
      </button>
      <button
        className="dbg-tb-btn"
        title="Step Out (Shift+F11)"
        data-testid="dbg-tb-stepout"
        disabled={!paused}
        onClick={() => void kontrol('stepOut')}
      >
        ↑
      </button>
      <span className="dbg-tb-sep" aria-hidden="true" />
      <button
        className="dbg-tb-btn"
        title="Restart (Ctrl+Shift+F5)"
        data-testid="dbg-tb-restart"
        onClick={() => void restart()}
      >
        ⟳
      </button>
      <button
        className="dbg-tb-btn is-stop"
        title="Stop (Shift+F5)"
        data-testid="dbg-tb-stop"
        onClick={() => void stop()}
      >
        ■
      </button>
    </div>
  );
}
