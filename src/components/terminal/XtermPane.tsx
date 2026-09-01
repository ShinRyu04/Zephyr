// XtermPane.tsx — satu pane terminal. Instance xterm dipegang
// xtermRegistry; komponen ini hanya memasang holder-nya ke DOM,
// mengurus fit/resize, dan menjembatani input/output ke Rust.

import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import * as cmd from '../../lib/commands';
import { copySelection, pasteInto } from '../../lib/terminalClipboard';
import { ensureHandle, fitTerm, flushQueue, getHandle, getSelection } from '../../lib/xtermRegistry';
import type { TerminalSession } from '../../lib/types';

interface Props {
  session: TerminalSession;
}

export default function XtermPane({ session }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fontFamily = useStore((s) => s.settings.general.fontFamily);
  const fontSize = useStore((s) => s.settings.general.fontSize);
  const markExited = useTerminal((s) => s.markExited);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handle = ensureHandle(session.id, {
      fontFamily,
      fontSize,
      onData: (data) => {
        // Ctrl+C: hentikan program yang berjalan (bukan sekadar byte 0x03).
        if (data === '\x03') {
          void cmd.ptyInterrupt(session.id).catch(() => {
            void cmd.ptyWrite(session.id, data).catch(() => markExited(session.id));
          });
          return;
        }
        void cmd.ptyWrite(session.id, data).catch(() => markExited(session.id));
      },
      onResize: (cols, rows) => {
        void cmd.ptyResize(session.id, cols, rows).catch(() => {
          /* sesi mungkin sudah mati */
        });
      },
    });

    // Pindahkan holder ke pane ini (scrollback tetap utuh saat ganti tab).
    host.appendChild(handle.holder);
    if (!handle.term.element) handle.term.open(handle.holder);
    flushQueue(session.id);

    // Shortcut clipboard ala Windows Terminal. Dikembalikan `false` supaya
    // xterm tidak juga mengirim byte-nya ke shell.
    handle.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey && k === 'c') {
        void copySelection(session.id);
        return false;
      }
      if ((e.ctrlKey && e.shiftKey && k === 'v') || (e.shiftKey && e.key === 'Insert')) {
        void pasteInto(session.id);
        return false;
      }
      // Ctrl+C tanpa seleksi = interrupt (ditangani onData); dengan seleksi = copy.
      if (e.ctrlKey && !e.shiftKey && k === 'c' && getSelection(session.id)) {
        void copySelection(session.id);
        return false;
      }
      return true;
    });

    const doFit = () => {
      const size = fitTerm(session.id);
      if (size) void cmd.ptyResize(session.id, size.cols, size.rows).catch(() => {});
    };

    // Fit setelah layout stabil (font metrics baru siap di frame berikutnya).
    const raf = requestAnimationFrame(doFit);

    const ro = new ResizeObserver(() => doFit());
    ro.observe(host);
    window.addEventListener('resize', doFit);

    handle.term.focus();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', doFit);
      // Holder dilepas, TAPI instance tidak di-dispose: tab bisa dibuka
      // lagi tanpa kehilangan isi. Dispose terjadi di closeSession.
      if (handle.holder.parentElement === host) host.removeChild(handle.holder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Perubahan font dari Settings diterapkan tanpa membuat instance baru.
  useEffect(() => {
    const h = getHandle(session.id);
    if (!h) return;
    h.term.options.fontFamily = fontFamily;
    h.term.options.fontSize = fontSize;
    const size = fitTerm(session.id);
    if (size) void cmd.ptyResize(session.id, size.cols, size.rows).catch(() => {});
  }, [fontFamily, fontSize, session.id]);

  return (
    <div
      ref={hostRef}
      className="xterm-pane"
      onContextMenu={async (e) => {
        // Klik kanan: ada seleksi -> copy, kalau tidak -> paste (ala Windows).
        e.preventDefault();
        if (getSelection(session.id)) await copySelection(session.id);
        else await pasteInto(session.id);
      }}
    />
  );
}
