// XtermPane.tsx — satu pane terminal. Instance xterm dipegang
// xtermRegistry; komponen ini hanya memasang holder-nya ke DOM,
// mengurus fit/resize, dan menjembatani input/output ke Rust.

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
      // Mode hemat RAM: 2000 baris/pane, bukan 5000.
      scrollback: useStore.getState().settings.general.lowRam ? 2000 : 5000,
      onData: (data) => {
        // Ctrl+C: hentikan program yang berjalan (bukan sekadar byte 0x03).
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

    // Pindahkan holder ke pane ini (scrollback tetap utuh saat ganti tab).
    host.appendChild(handle.holder);
    if (!handle.term.element) handle.term.open(handle.holder);
    flushQueue(pane.id);

    // Shortcut clipboard ala Windows Terminal + Ctrl+V langsung + Shift+Enter untuk multi-line di AI CLI.
    // Dikembalikan `false` supaya xterm tidak juga mengirim byte-nya ke shell secara default.
    handle.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey && k === 'c') {
        // preventDefault wajib: tanpa itu WebView2 tetap menjalankan perintah
        // copy bawaan dan xterm menulis ulang seleksi ke clipboard.
        e.preventDefault();
        void copySelection(pane.id);
        return false;
      }
      // Dukung Ctrl+V langsung (selain Ctrl+Shift+V dan Shift+Insert).
      //
      // preventDefault WAJIB di sini. Tanpa itu WebView2 tetap menjalankan
      // paste bawaan ke textarea xterm; xterm lalu menulis isi clipboard yang
      // SAMA ke PTY lewat handler `paste` miliknya. Hasilnya teks masuk dua
      // kali (bug "Ctrl+V dobel").
      if (
        (e.ctrlKey && !e.shiftKey && !e.altKey && k === 'v') ||
        (e.ctrlKey && e.shiftKey && k === 'v') ||
        (e.shiftKey && e.key === 'Insert')
      ) {
        e.preventDefault();
        void pasteInto(pane.id);
        return false;
      }
      // Ctrl+C tanpa seleksi = interrupt (ditangani onData); dengan seleksi = copy.
      if (e.ctrlKey && !e.shiftKey && k === 'c' && getSelection(pane.id)) {
        void copySelection(pane.id);
        return false;
      }
      // Shift+Enter untuk AI CLI / Shell multi-baris.
      // Byte-nya BEDA per CLI: Hermes pakai CSI u, opencode/Codex pakai LF,
      // Claude Code pakai backslash. Salah pilih = tidak turun baris, jadi
      // pemetaannya ada di lib/multilineKey.ts (bisa di-override di Settings).
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

    // Fit setelah layout stabil (font metrics baru siap di frame berikutnya).
    const raf = requestAnimationFrame(doFit);

    const ro = new ResizeObserver(() => doFit());
    ro.observe(host);
    window.addEventListener('resize', doFit);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', doFit);
      // Holder dilepas, TAPI instance tidak di-dispose: pane bisa dibuka
      // lagi tanpa kehilangan isi. Dispose terjadi di closePane.
      if (handle.holder.parentElement === host) host.removeChild(handle.holder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  // Perubahan font dari Settings diterapkan tanpa membuat instance baru.
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
        // Klik kanan: ada seleksi -> copy, kalau tidak -> paste (ala Windows).
        e.preventDefault();
        if (getSelection(pane.id)) await copySelection(pane.id);
        else await pasteInto(pane.id);
      }}
    />
  );
}
