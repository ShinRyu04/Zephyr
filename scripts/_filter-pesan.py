"""Message filter for git filter-branch (stdin in, stdout out)."""
import io, json, os, sys
peta = json.load(io.open(os.environ['PETA_PESAN'], encoding='utf-8'))
teks = sys.stdin.read()
subj = teks.split('\n', 1)[0].strip()
if subj in peta:
    isi = peta[subj]
    hasil = isi['subject'] + '\n'
    if isi.get('body'):
        hasil += '\n' + isi['body'].rstrip() + '\n'
    sys.stdout.write(hasil)
    sys.stderr.write('  rewrote: ' + subj[:60] + '\n')
else:
    sys.stdout.write(teks)
