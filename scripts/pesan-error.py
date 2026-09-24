#!/usr/bin/env python3
"""
pesan-error.py — stop Tauri errors from rendering as "[object Object]".

Errors crossing the Tauri IPC boundary are plain objects shaped
{ code, message }, not Error instances. Calling String(e) on one yields the
literal text "[object Object]", which is what users were seeing in toasts and
error panels ("Gagal membaca tasks.json" with detail "[object Object]").

This rewrites the message extraction at every site to go through
asZephyrError(), which understands both shapes. It only touches the specific
patterns listed below; anything else is left alone.

Run from the repo root:
    python scripts/pesan-error.py
"""

from __future__ import annotations

import io
import os
import re
import sys

# Files that already import from './commands' or are commands.ts itself.
SKIP = {'src/lib/commands.ts'}

# Patterns rewritten, in order. Each is (regex, replacement template).
RULES: list[tuple[re.Pattern[str], str]] = [
    # const msg = String(e);  ->  const msg = asZephyrError(e).message;
    (re.compile(r"const msg = String\(e\);"), "const msg = asZephyrError(e).message;"),
    # set({ error: String(e) });  ->  set({ error: asZephyrError(e).message });
    (re.compile(r"set\(\{ error: String\(e\) \}\);"), "set({ error: asZephyrError(e).message });"),
    # String(e) inside a call, e.g. notify({ detail: String(e) })
    (re.compile(r"String\(e\)(?!\s*[=:])"), "asZephyrError(e).message"),
]


def pastikan_import(src: str, path: str) -> str:
    """Make sure asZephyrError is imported from './commands' or the right depth."""
    if 'asZephyrError' in src and 'import' in src:
        # Sudah diimpor?
        for m in re.finditer(r"import \{([^}]*)\} from '([^']*commands)';", src):
            if 'asZephyrError' in m.group(1):
                return src

    kedalaman = path.count('/') - 1  # src/lib/x.ts -> 1
    prefix = './' if kedalaman == 1 else '../' * (kedalaman - 1)

    m = re.search(r"import \{([^}]*)\} from '([^']*commands)';", src)
    if m:
        isi = m.group(1).rstrip()
        pisah = ',\n  ' if len(isi) > 60 else ', '
        baru = isi + pisah + 'asZephyrError,\n' if len(isi) > 60 else isi + ', asZephyrError'
        return src[: m.start(1)] + baru + src[m.end(1):]

    # Tidak ada import commands sama sekali: tambahkan setelah import terakhir.
    baris = src.split('\n')
    idx = 0
    for i, l in enumerate(baris):
        if l.startswith('import '):
            idx = i
    baris.insert(idx + 1, f"import {{ asZephyrError }} from '{prefix}commands';")
    return '\n'.join(baris)


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    diubah: list[tuple[str, int]] = []
    for dirpath, _dirnames, filenames in os.walk('src'):
        for nama in filenames:
            if not nama.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(dirpath, nama).replace('\\', '/')
            if path in SKIP:
                continue
            src = io.open(path, encoding='utf-8').read()
            asli = src
            n = 0
            for pola, ganti in RULES:
                src, k = pola.subn(ganti, src)
                n += k
            if n == 0:
                continue
            # Jangan sentuh baris yang sudah memakai asZephyrError.
            if 'asZephyrError(e).message' in src and 'String(e)' not in src:
                src = pastikan_import(src, path)
            diubah.append((path, n))
            io.open(path, 'w', encoding='utf-8', newline='').write(src)

    for path, n in diubah:
        print('   %-52s %d' % (path, n))
    print('  %d file diperbaiki' % len(diubah))
    return 0


if __name__ == '__main__':
    sys.exit(main())
