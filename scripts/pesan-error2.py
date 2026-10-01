#!/usr/bin/env python3
"""
pesan-error2.py — perbaiki String(e) -> asZephyrError(e).message, hati-hati.

Error dari invoke Tauri berbentuk { code, message } (bukan Error), jadi
String(e) mencetak "[object Object]" ke toast/panel user.

Versi pertama skrip ini menambahkan import dengan cara yang merusak daftar
import multiline, jadi skrip ini:
  1. HANYA menambal file yang sudah mengimpor dari './commands'
  2. menambahkan asZephyrError ke daftar import yang SUDAH ADA di file itu
  3. menolak jalan kalau polanya tidak jelas

Pakai:
    python scripts/pesan-error2.py
"""

from __future__ import annotations

import io
import os
import re
import sys

RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"const msg = String\(e\);"), "const msg = asZephyrError(e).message;"),
    (re.compile(r"set\(\{ error: String\(e\) \}\);"), "set({ error: asZephyrError(e).message });"),
]


def tambah_import(src: str) -> str | None:
    """Tambahkan asZephyrError ke import './commands' yang sudah ada."""
    m = re.search(r"import \{([^}]*)\} from '(\.\.?/[^']*commands)';", src, re.S)
    if not m:
        return None
    isi = m.group(1)
    if 'asZephyrError' in isi:
        return src
    # Pertahankan gaya penulisan: satu baris tetap satu baris, multiline tetap.
    if '\n' in isi:
        bersih = isi.rstrip()
        if not bersih.endswith(','):
            bersih += ','
        baru = bersih + '\n  asZephyrError,\n'
    else:
        baru = isi.rstrip().rstrip(',') + ', asZephyrError'
    return src[: m.start(1)] + baru + src[m.end(1):]


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    sasaran: list[str] = []
    for dirpath, _d, filenames in os.walk('src'):
        for nama in filenames:
            if nama.endswith(('.ts', '.tsx')):
                sasaran.append(os.path.join(dirpath, nama).replace('\\', '/'))

    total_ok, total_skip = 0, []
    for path in sorted(sasaran):
        src = io.open(path, encoding='utf-8').read()
        n = sum(1 for pola, _ in RULES if pola.search(src))
        # Pola umum String(e) yang bukan dua bentuk di atas.
        sisa = len(re.findall(r"String\(e\)", src)) - n
        if n == 0 and sisa == 0:
            continue

        baru = src
        for pola, ganti in RULES:
            baru = pola.sub(ganti, baru)
        # Sisa String(e) lain -> konversi juga, tapi hanya kalau file sudah
        # mengimpor asZephyrError setelah langkah di atas.
        baru2 = tambah_import(baru)
        if baru2 is None:
            total_skip.append((path, sisa))
            continue
        if 'asZephyrError' not in baru2:
            total_skip.append((path, sisa))
            continue
        baru = re.sub(r"String\(e\)", "asZephyrError(e).message", baru2)
        if baru != src:
            io.open(path, 'w', encoding='utf-8', newline='').write(baru)
            total_ok += 1
            print('   %-52s ok' % path)

    for path, s in total_skip:
        print('   %-52s LEWAT (tak ada import ./commands, sisa %d)' % (path, s))
    print('  %d file ditambal, %d dilewat' % (total_ok, len(total_skip)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
