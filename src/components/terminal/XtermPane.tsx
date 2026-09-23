import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import * as cmd from '../../lib/commands';
import { copySelection, pasteInto } from '../../lib/terminalClipboard';
import { multilineSequence } from '../../lib/multilineKey';
import { ensureHandle, fitTerm, flushQueue, getHandle, getSelection } from '../../lib/xtermRegistry';
import type { PaneMeta } from '../../lib/types';

interface Props {
  pane: PaneMeta;
}

export default function XtermPane({ pane }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fontFamily = useStore((s) => s.settings.general.fontFamily);
  const fontSize = useStore((s) => s.settings.general.fontSize);
  const markExited = useTerminal((s) => s.markExited);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handle = ensureHandle(pane.id, {
      fontFamily,
      fontSize,
      
      scrollback: useStore.getState().settings.general.lowRam ? 2000 : 5000,
      onData: (data) => {
        
        if (data === '\x03') {
          void cmd.ptyInterrupt(pane.id).catch(() => {
            void cmd.ptyWrite(pane.id, data).catch(() => markExited(pane.id));
          });
          return;
        }
        void cmd.ptyWrite(pane.id, data).catch(() => markExited(pane.id));
      },
      onResize: (cols, rows) => {
        void cmd.ptyResize(pane.id, cols, rows).catch(() => {
          /* sesi mungkin sudah mati */
        });
      },
    });

    host.appendChild(handle.holder);
    if (!handle.term.element) handle.term.open(handle.holder);
    flushQueue(pane.id);

    handle.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey && k === 'c') {
        
        e.preventDefault();
        void copySelection(pane.id);
        return false;
      }
      
      if (
        (e.ctrlKey && !e.shiftKey && !e.altKey && k === 'v') ||
        (e.ctrlKey && e.shiftKey && k === 'v') ||
        (e.shiftKey && e.key === 'Insert')
      ) {
        e.preventDefault();
        void pasteInto(pane.id);
        return false;
      }
      
      if (e.ctrlKey && !e.shiftKey && k === 'c' && getSelection(pane.id)) {
        void copySelection(pane.id);
        return false;
      }
      
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
        const seq = multilineSequence(
          pane.agent?.name,
          useStore.getState().settings.general.multilineKey,
        );
        void cmd.ptyWrite(pane.id, seq).catch(() => {
          void cmd.ptyWrite(pane.id, '\n');
        });
        return false;
      }
      return true;
    });

    const doFit = () => {
      const size = fitTerm(pane.id);
      if (size) void cmd.ptyResize(pane.id, size.cols, size.rows).catch(() => {});
    };

    const raf = requestAnimationFrame(doFit);

    const ro = new ResizeObserver(() => doFit());
    ro.observe(host);
    window.addEventListener('resize', doFit);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', doFit);
      
      if (handle.holder.parentElement === host) host.removeChild(handle.holder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  useEffect(() => {
    const h = getHandle(pane.id);
    if (!h) return;
    h.term.options.fontFamily = fontFamily;
    h.term.options.fontSize = fontSize;
    const size = fitTerm(pane.id);
    if (size) void cmd.ptyResize(pane.id, size.cols, size.rows).catch(() => {});
  }, [fontFamily, fontSize, pane.id]);

  return (
    <div
      ref={hostRef}
      className="xterm-pane"
      data-pane-body={pane.id}
      onContextMenu={async (e) => {
        
        e.preventDefault();
        if (getSelection(pane.id)) await copySelection(pane.id);
        else await pasteInto(pane.id);
      }}
    />
  );
}
