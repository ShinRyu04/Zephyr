"""Tambahkan laporan penyelesaian ke Google Doc 'Update Zephyr'."""
import json
import os
import urllib.request

TOKEN = os.path.expanduser(r'C:\Users\home\.hermes\google_token.json')
DOC = '1ZykBIF_YS01mhjDJrMeE6B9461hzND179cZS0m_oGEg'


def access_token():
    d = json.load(open(TOKEN, encoding='utf-8'))
    import time
    from datetime import datetime, timezone
    exp = d.get('expiry')
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp.replace('Z', '+00:00')).timestamp()
        except Exception:
            exp = 0
    if exp and time.time() < float(exp) - 60:
        return d['token']
    # refresh
    data = urllib.parse.urlencode({
        'client_id': d['client_id'],
        'client_secret': d['client_secret'],
        'refresh_token': d['refresh_token'],
        'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    with urllib.request.urlopen(req) as r:
        t = json.load(r)
    d['token'] = t['access_token']
    d['expiry'] = time.strftime('%Y-%m-%dT%H:%M:%S.000000Z', time.gmtime(time.time() + t.get('expires_in', 3600)))
    json.dump(d, open(TOKEN, 'w', encoding='utf-8'))
    return d['token']


def req(url, method='GET', body=None, tok=None):
    h = {'Authorization': 'Bearer ' + (tok or access_token())}
    data = None
    if body is not None:
        h['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


tok = access_token()

# Ambil akhir dokumen untuk tahu posisi index terakhir.
doc = req(f'https://docs.googleapis.com/v1/documents/{DOC}', tok=tok)
akhir = doc['body']['content'][-1]
idx = akhir['endIndex'] - 1

# Bangun blok laporan.
B = []
B.append(('H1', 'Laporan Penyelesaian — Fitur Baru v1.1.10'))
B.append(('P', 'Dikerjakan 22-23 September 2026. Versi TETAP 1.1.10 (tidak naik). '
               'Semua fitur diuji dengan menjalankannya, bukan dengan membaca kode.'))

B.append(('H2', 'Ringkasan Hasil'))
B.append(('P', '15 task selesai, 0 gagal, 2 dibatalkan atas keputusan user (maxOut token Mr Vip '
               'karena bukan pekerjaan Zephyr; dan tiga item C yang memang di-skip: EV cert, '
               'delta update, Open VSX).'))
B.append(('P', 'Total verifikasi: 235 unit test Rust lulus + 134 tes harness CDP lulus + '
               'tsc 0 error + i18n 10 bahasa sinkron.'))

B.append(('H2', 'Fitur yang Ditambahkan'))
f = [
    ('Subagent paralel', 'Sampai 4 agen jalan bersamaan, masing-masing punya nama '
     '(Comet, Odyssey, Nova...), log langkah hidup, dan tombol batal. Setiap agen maksimal 15 '
     'langkah dan DILARANG menulis file — dua agen menulis file yang sama itu race condition, '
     'bukan fitur. Diuji: 2 agen paralel selesai 367ms.'),
    ('Reasoning effort + blok Reasoned', 'Dropdown Penalaran (minimal/low/medium/high/ultra) '
     'dipetakan per provider: OpenAI reasoning_effort, Anthropic thinking.budget_tokens '
     '(1.024-65.536, dijaga di bawah max_tokens), Gemini thinkingConfig.thinkingBudget '
     '(negatif = dinamis, 0 = mati). Proses berpikir model mengalir ke blok "Reasoned" yang '
     'bisa dilipat, bukan dibuang.'),
    ('API Client', 'Koleksi, request tersimpan, environment dengan {{variabel}}, dan penampil '
     'respons (status, waktu, header, body). Koleksi disimpan di folder data Zephyr, bukan di repo.'),
    ('Dev Environment', 'PHP, Nginx, MariaDB, Redis dari D:\\DevEnv\\ tanpa bundel gaya XAMPP. '
     'Beberapa versi bisa hidup berdampingan (PHP 8.3.33 dan 8.1.34). Port yang sudah dipakai '
     'DITOLAK, tidak pernah direbut. Diuji: Redis benar-benar dinyalakan, port 6379 menjawab, '
     'lalu dimatikan.'),
    ('Database browser', 'Buka file SQLite, jelajahi tabel/view, jalankan SELECT, hasil dalam '
     'grid. Koneksi READ-ONLY kecuali toggle tulis dinyalakan — membuka database yang sedang '
     'dipakai aplikasi lain tidak boleh mengunci atau merusaknya.'),
    ('Cloudflare Tunnel', 'Buka port lokal ke internet sekali klik (cloudflared diunduh ke '
     'D:\\DevEnv\\bin). Banner peringatan permanen selama tunnel hidup. Semua tunnel dimatikan '
     'saat Zephyr keluar — tunnel yang tertinggal = localhost terbuka tanpa pengawasan.'),
    ('Test Explorer', 'Deteksi runner dari file project (package.json, Cargo.toml, go.mod, '
     'pytest, composer.json, Makefile, plus npm run verify/soak/stress/lint). Hanya menawarkan '
     'runner yang BENAR-BENAR ada: tanpa scripts.test, tombol npm test tidak muncul.'),
    ('SFTP + port forwarding', 'Jelajahi file remote, unduh, hapus, dan buka tunnel port '
     '(ssh -L lokal, -R remote, -D SOCKS) dari satu panel. Tunnel dibersihkan saat keluar; '
     'port yang sudah dipakai ditolak, bukan dibajak.'),
    ('Zen mode + pratinjau gambar', 'View: Toggle Zen Mode menyembunyikan Activity Bar, sidebar, '
     'panel, dan status bar. Membuka .png/.jpg/.gif/.webp/.bmp/.ico/.avif/.svg menampilkan '
     'pratinjau nyata dengan zoom, bukan biner di editor.'),
    ('CLI subcommand', 'zephyr ext list, zephyr ext remove <id>, zephyr ext registry [url], dan '
     'zephyr info jalan tanpa membuka jendela — Zephyr bisa dikendalikan dari skrip dan CI. '
     'Diuji: zephyr ext list membaca 2 ekstensi nyata.'),
    ('Portable mode', 'Letakkan file bernama "portable" di sebelah zephyr.exe dan SEMUA data '
     '(settings, kunci, ekstensi, log) pindah ke folder data/ di sebelah exe. Diuji dengan exe '
     'nyata: data pindah, APPDATA tidak tersentuh.'),
]
for nama, ket in f:
    B.append(('H3', nama))
    B.append(('P', ket))

B.append(('H2', 'Tiga Bug Nyata yang Ditemukan dan Diperbaiki'))
B.append(('H3', 'Output task dan test dibuang tanpa jejak'))
B.append(('P', 'Buffer output membuang setiap baris untuk channel yang belum ada, dan tidak ada '
               'yang membuat channel itu sebelum baris pertama datang. Menjalankan task '
               'menghasilkan spinner dan panel kosong. Diperbaiki dengan membuat channel sebelum '
               'proses dijalankan.'))
B.append(('H3', 'SFTP menampilkan "folder kosong" saat gagal terhubung'))
B.append(('P', 'Status exit sftp tidak pernah diperiksa, jadi host mati, kunci ditolak, dan '
               'direktori yang benar-benar kosong terlihat identik. Sekarang error sebenarnya '
               'ditampilkan ("Connection refused").'))
B.append(('H3', 'Parser listing SFTP salah membaca nama file'))
B.append(('P', 'Memecah pada SETIAP spasi, bukan pada rentetan spasi, jadi listing dengan kolom '
               'rata mengembalikan ekor baris sebagai nama file.'))

B.append(('H2', 'Perubahan Tampilan Sesuai Permintaan'))
B.append(('P', 'Panel AI: chip CLI (Native/Codex/Claude/Gemini/opencode) DIHAPUS — fokus ke AI '
               'Zephyr sendiri. Panel TODO dipercantik dengan progres bar dan status per item. '
               'Panel subagent dibuat: grid 2 kolom, judul batch menyebut jumlah, '
               'langkah terakhir selalu terlihat saat bekerja.'))
B.append(('P', 'Lokasi panel AI: awalnya diminta ke kanan, lalu dikoreksi balik ke BAWAH. '
               'Sekarang aiPanel = "bottom" di settings maupun default kode, terverifikasi '
               'posisi y=733 dari tinggi jendela 960.'))

B.append(('H2', 'Rilis'))
B.append(('P', 'Artifact dibangun ulang: MSI 6,52 MB dan NSIS 4,37 MB. KEDUA signature SAH, '
               'diverifikasi ulang memakai crate minisign-verify (bukan sekadar "file .sig ada"). '
               'Versi tetap 1.1.10. latest.json diperbarui.'))
B.append(('P', 'Commit lokal: 2c2ab79 (fitur) dan ca414d0 (rilis + dokumen). BELUM di-push ke '
               'GitHub — hanya cron Minggu yang push.'))
B.append(('P', 'README: 10 blok fitur baru, 8 screenshot baru (total 13), dan bagian "Honest '
               'state" diperbarui dengan batasan yang jujur. Release notes diperbarui dan '
               'disalin ke 3 tempat dengan md5 identik.'))

B.append(('H2', 'Yang Belum Dikerjakan (jujur)'))
B.append(('P', 'Docker panel, Live Share, notebook .ipynb, Vim mode, Setting Sync, dan Profiles '
               'BELUM dikerjakan. Alasannya berbeda per item: Docker CLI tidak terpasang di '
               'mesin ini sehingga tidak bisa diuji; Live Share butuh server relay yang tidak '
               'ada; sisanya butuh keputusan desain dari user dulu. MySQL/PostgreSQL browsing '
               'juga belum — baru SQLite, karena SQLite itu file sedangkan MySQL/Postgres '
               'butuh server dan kredensial.'))

# Susun request batchUpdate.
requests = []
i = idx
for tipe, teks in B:
    if tipe == 'H1':
        requests.append({'insertText': {'location': {'index': i}, 'text': teks + '\n'}})
        requests.append({'updateParagraphStyle': {
            'range': {'startIndex': i, 'endIndex': i + len(teks) + 1},
            'paragraphStyle': {'namedStyleType': 'HEADING_1'},
            'fields': 'namedStyleType'}})
    elif tipe == 'H2':
        requests.append({'insertText': {'location': {'index': i}, 'text': teks + '\n'}})
        requests.append({'updateParagraphStyle': {
            'range': {'startIndex': i, 'endIndex': i + len(teks) + 1},
            'paragraphStyle': {'namedStyleType': 'HEADING_2'},
            'fields': 'namedStyleType'}})
    elif tipe == 'H3':
        requests.append({'insertText': {'location': {'index': i}, 'text': teks + '\n'}})
        requests.append({'updateParagraphStyle': {
            'range': {'startIndex': i, 'endIndex': i + len(teks) + 1},
            'paragraphStyle': {'namedStyleType': 'HEADING_3'},
            'fields': 'namedStyleType'}})
    else:
        requests.append({'insertText': {'location': {'index': i}, 'text': teks + '\n'}})
    i += len(teks) + 1

req(f'https://docs.googleapis.com/v1/documents/{DOC}:batchUpdate',
    method='POST', body={'requests': requests}, tok=tok)

doc2 = req(f'https://docs.googleapis.com/v1/documents/{DOC}', tok=tok)
n_p = sum(1 for c in doc2['body']['content'] if 'paragraph' in c)
print(f'  laporan ditambahkan: {len(B)} blok, total {n_p} paragraf di dokumen')
print(f'  https://docs.google.com/document/d/{DOC}/edit')
