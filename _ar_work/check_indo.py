import io, re, json
SRC = 'D:/Zephyr/src/lib/i18n-extra.ts'
text = io.open(SRC, encoding='utf-8', newline='').read()
start = text.index('const AR: Dict = {')
nm = re.search(r'\r?\nconst [A-Z][A-Z]: Dict = \{', text[start+10:])
ar_end = start + 10 + nm.start() if nm else text.index('\r\n};', start) + 4
seg = text[start:ar_end]

# Parse strictly: line format "  'KEY': 'VALUE'," where KEY and VALUE are JS strings.
# Walk char by char to find true key end.
def parse_line(ln, quote="'"):
    if not ln.startswith("  " + quote):
        return None
    n = len(ln)
    i = 3  # after "  '"
    # scan key
    key_chars = []
    while i < n:
        c = ln[i]
        if c == '\\':
            key_chars.append(ln[i:i+2]); i += 2; continue
        if c == "'":
            break
        key_chars.append(c); i += 1
    if i >= n or ln[i] != "'":
        return None
    key_raw = ''.join(key_chars)
    # expect ": '"
    if ln[i+1:i+4] != ": '":
        return None
    j = i + 4
    val_chars = []
    while j < n:
        c = ln[j]
        if c == '\\':
            val_chars.append(ln[j:j+2]); j += 2; continue
        if c == "'":
            break
        val_chars.append(c); j += 1
    if j >= n:
        return None
    val_raw = ''.join(val_chars)
    return key_raw, val_raw

WORDS = ['yang','tidak','sudah','untuk','dari','bisa','harus','belum','kalau','buka','simpan',
         'tutup','cari','hapus','tambah','ubah','berkas','selesai','gagal','kosong','pilih',
         'jalankan','perintah','catatan','riwayat','pengaturan','tertutup','dibuka','dijalankan']
pat = re.compile(r'(?<![\w-])(' + '|'.join(WORDS) + r')(?![\w-])', re.I)

report = []
for ln in seg.split('\r\n'):
    r = parse_line(ln)
    if not r:
        continue
    key_raw, val_raw = r
    pykey = key_raw.replace("\\\\", "\x00").replace("\\'", "'").replace("\x00", "\\")
    pyval = val_raw
    if pat.search(pyval):
        report.append(pykey)

io.open('D:/Zephyr/_ar-indo.json','w',encoding='utf-8',newline='').write(json.dumps(report, ensure_ascii=False, indent=1)+'\n')
print('counting:', len(report))
for k in report: print('  ', repr(k))
