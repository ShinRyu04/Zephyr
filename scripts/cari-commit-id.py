"""List every commit whose message contains Indonesian text.

Uses a NUL byte as the record separator so multi-paragraph bodies cannot be
confused with the boundary between commits. The word list is deliberately
narrow: a false positive means rewriting a commit message that was already
fine, which changes a SHA for no reason.
"""

import io
import os
import re
import subprocess

KATA = (
    r"\b(perbaiki|kembalikan|fitur|rapikan|hapus|ubah|tambah|kunci|jalur|"
    r"catatan|bersihkan|dibajak|pindah|hilang|rusak|bikin|ganti|benerin|"
    r"sekarang|biar|udah|belum|masih|dulu|klo|kalo|lagi|jadi|harus|punya|"
    r"kasih|liat|pake|pakai|kayak|terus|malah|gabisa|dll|stiap|tanpa|"
    r"dengan|tersebut|dipakai|dibuat|dihapus|ditulis|menggunakan|adalah|"
    r"kalau|supaya|oleh|jika|sudah|karena|sehingga|sedangkan|atau|serta|"
    r"menjadi|berikut|berhasil|gagal|selesai|menggunakan|memakai|terjadi|"
    r"ditambahkan|diperbaiki|diubah|dihapus|dibuat|ditulis|dibaca|dijalankan|"
    r"hasil|pesan|perintah|berkas|baris|kata|nama|versi|tampilan|warna|"
    r"pengguna|aplikasi|tombol|jendela|panel|kode|file|skrip|uji|tes|"
    r"lulus|benar|salah|masalah|perlu|dapat|tidak|bukan|belum|hanya|saja)\b"
)

out = subprocess.run(
    ["git", "log", "--format=%h|%s|%b%x00"],
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
).stdout

blok = [b for b in out.split("\x00") if "|" in b]
hasil = []
for b in blok:
    if re.search(KATA, b, re.IGNORECASE):
        hasil.append(b.split("|")[0].strip())

print("commits with Indonesian text: %d / %d" % (len(hasil), len(blok)))
for h in hasil:
    print("    " + h)

p = os.path.expandvars("%LOCALAPPDATA%") + "/Temp/commit-id.txt"
io.open(p, "w", encoding="utf-8", newline="").write("\n".join(hasil))
print("list written to: " + p)
