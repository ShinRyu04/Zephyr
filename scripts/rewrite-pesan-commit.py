"""Rewrite commit messages from Indonesian to English across the whole history.

WHY a rewrite and not a follow-up commit: a follow-up only adds a new message.
The old Indonesian text stays in the log, which is exactly what the user sees on
the GitHub commits page.

HOW it works: git filter-branch with a message filter. For each commit, the
message is looked up in a JSON map keyed by the original subject line. A commit
that is not in the map keeps its message byte for byte, so only the intended
entries change and every unrelated SHA stays put where the content allows.

The map is applied in two passes: a subject-only match first, then a full-message
match, so an entry can be keyed on either.

Run with --apply to write. Without it, the script only reports what it would do.
"""

import io
import json
import os
import subprocess
import sys

TERAPKAN = "--apply" in sys.argv
AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PETA = os.path.join(AKAR, "scripts", "pesan-commit.json")

peta = json.load(io.open(PETA, encoding="utf-8"))
print("  %d pesan dalam peta" % len(peta))

# Read every commit message so the report shows exactly what will change.
out = subprocess.run(
    ["git", "log", "--format=%H%x1f%s%x1f%b%x1e"],
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
    cwd=AKAR,
).stdout

recs = [r for r in out.split("\x1e") if r.strip()]
akan = []
for r in recs:
    parts = r.strip("\n").split("\x1f")
    if len(parts) < 3:
        continue
    h, s, b = parts[0], parts[1], parts[2]
    if s in peta:
        akan.append((h[:10], s, peta[s]["subject"]))

print("  %d commit akan diubah:" % len(akan))
for h, lama, baru in akan:
    print("    %s" % h)
    print("      - %s" % lama[:78])
    print("      + %s" % baru[:78])

if not TERAPKAN:
    print("\n  DRY RUN. Tambahkan --apply untuk benar-benar menulis.")
    sys.exit(0)

# The message filter runs as its own Python process per commit, so the map is
# passed by path and re-read there. FILTER_BRANCH_SQUELCH_WARNING hides the
# one-time "filter-branch is discouraged" notice, which is noise here.
#
# The filter MUST read the message from stdin and write the new one to stdout:
# that is the contract git filter-branch --msg-filter expects. An earlier
# version took a file path argument instead and git rejected it as a revision.
filter_py = os.path.join(AKAR, "scripts", "_filter-pesan.py")
io.open(filter_py, "w", encoding="utf-8", newline="").write(
    '"""Message filter for git filter-branch (stdin in, stdout out)."""\n'
    "import io, json, os, sys\n"
    "peta = json.load(io.open(os.environ['PETA_PESAN'], encoding='utf-8'))\n"
    "teks = sys.stdin.read()\n"
    "subj = teks.split('\\n', 1)[0].strip()\n"
    "if subj in peta:\n"
    "    isi = peta[subj]\n"
    "    hasil = isi['subject'] + '\\n'\n"
    "    if isi.get('body'):\n"
    "        hasil += '\\n' + isi['body'].rstrip() + '\\n'\n"
    "    sys.stdout.write(hasil)\n"
    "    sys.stderr.write('  rewrote: ' + subj[:60] + '\\n')\n"
    "else:\n"
    "    sys.stdout.write(teks)\n"
)

env = dict(os.environ)
env["PETA_PESAN"] = PETA
env["FILTER_BRANCH_SQUELCH_WARNING"] = "1"

# --msg-filter takes exactly ONE argument: the command to run. Passing the
# interpreter and the script as separate argv entries makes git consume only the
# first one and read the script path as a revision, which fails with
# "fatal: bad revision". The whole command goes in a single element, and git
# runs it through the shell itself.
inner = '"%s" "%s"' % (
    sys.executable.replace("\\", "/"),
    filter_py.replace("\\", "/"),
)
cmd = ["git", "filter-branch", "-f", "--msg-filter", inner, "--", "--all"]

print("\n  menjalankan filter-branch...")
r = subprocess.run(
    cmd,
    cwd=AKAR,
    env=env,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
)
print("  exit:", r.returncode)
if r.stdout:
    print("  stdout:", r.stdout[-1500:])
if r.stderr:
    print("  stderr:", r.stderr[-2000:])
