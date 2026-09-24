"""Rewrite dynamic store imports to static imports.

WHY this matters: `await import('./xStore')` inside a function is NOT the same
module instance as the top-level static import when the bundler splits them.
Vite gives the dynamic form its own module record, so `useX.getState()` there
reads and writes a store the UI never sees. The symptom is a command that
changes state and nothing happens on screen, or state that reverts on restart.

The fix is to hoist every store import to the top of the file as a static
import. Tauri plugin imports and plain modules are left alone: they are not
stores, so a second instance has no observable effect.

Only files under src/ are touched. The script reports every change so the diff
can be reviewed, and refuses to guess when a file already imports the same name.
"""

import io
import os
import re

AKAR = r"D:\Zephyr\src"

# Only these module names are stores whose identity matters.
STORE = re.compile(r"^\./(\w*[Ss]tore)$")

laporan = []


def proses(path):
    s = io.open(path, encoding="utf-8").read()
    asli = s

    # Find every `const { useX } = await import('./yStore');` and hoist it.
    pola = re.compile(
        r"^(?P<indent>[ \t]*)const \{ (?P<names>[^}]+) \} = await import\('(?P<mod>\./[^']+)'\);\s*$",
        re.M,
    )
    diangkat = {}

    def ganti(m):
        mod = m.group("mod")
        base = mod.split("/")[-1]
        if not STORE.match(mod):
            return m.group(0)
        diangkat.setdefault(base, set()).update(
            n.strip() for n in m.group("names").split(",") if n.strip()
        )
        return ""  # baris dihapus dari dalam fungsi

    s = pola.sub(ganti, s)

    if not diangkat:
        return None

    # Build the static imports and insert them after the last existing import.
    baris_import = []
    for base, nama in sorted(diangkat.items()):
        # Skip names already imported statically at the top.
        ada = re.findall(
            r"^import \{([^}]+)\} from '\./%s';" % re.escape(base), s, re.M
        )
        sudah = {n.strip() for grup in ada for n in grup.split(",")}
        kurang = sorted(nama - sudah)
        if not kurang:
            continue
        baris_import.append(
            "import { %s } from './%s';" % (", ".join(kurang), base)
        )

    if not baris_import:
        # Everything was already imported; just clean up the blank lines.
        s = re.sub(r"\n{3,}", "\n\n", s)
        if s != asli:
            io.open(path, "w", encoding="utf-8", newline="").write(s)
            laporan.append((path, "hapus baris kosong saja"))
        return None

    # Insert after the final top-level import line.
    posisi = 0
    for m in re.finditer(r"^import .*?;\s*$", s, re.M):
        posisi = m.end()
    s = s[:posisi] + "\n" + "\n".join(baris_import) + s[posisi:]

    # Collapse the blank lines left behind where the dynamic import used to be.
    s = re.sub(r"\n[ \t]*\n[ \t]*\n{2,}", "\n\n", s)
    s = re.sub(r"\{\n\n\n+", "{\n\n", s)

    io.open(path, "w", encoding="utf-8", newline="").write(s)
    laporan.append((path, "%d import dinaikkan: %s" % (len(baris_import), ", ".join(baris_import))))
    return True


for root, dirs, files in os.walk(AKAR):
    dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", ".git")]
    for f in files:
        if f.endswith((".ts", ".tsx")):
            proses(os.path.join(root, f))

print("== %d file diubah ==" % len(laporan))
for p, ket in laporan:
    print("  %s" % p.replace(AKAR + "\\", ""))
    print("    %s" % ket[:110])
