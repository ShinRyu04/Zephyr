"""Tambahkan laporan kerja 23 September 2026 (pagi - malam) ke Google Doc."""
import json
import os
import urllib.parse
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
    data = urllib.parse.urlencode({
        'client_id': d['client_id'],
        'client_secret': d['client_secret'],
        'refresh_token': d['refresh_token'],
        'grant_type': 'refresh_token',
    }).encode()
    reqq = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    with urllib.request.urlopen(reqq) as r:
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
doc = req(f'https://docs.googleapis.com/v1/documents/{DOC}', tok=tok)
akhir = doc['body']['content'][-1]
idx = akhir['endIndex'] - 1

B = []
B.append(('H1', 'Laporan Kerja — 23 September 2026 (Pagi sampai Malam)'))
B.append(('P', 'Versi TETAP 1.1.10 (tidak dinaikkan atas permintaan user). '
               'Semua hasil diuji dengan menjalankan aplikasinya lewat CDP, bukan dengan membaca kode.'))

B.append(('H2', '1. Panel AI Pindah ke Kanan (dan bisa fullscreen)'))
B.append(('P', 'Permintaan: "chat AI pindah ke kanan, terminal AI jangan muncul, bisa dilebarkan '
               'atau fullscreen kayak VS Code." Yang dikerjakan: kolom AI kanan bisa di-drag lebarnya '
               '(dari 340px, dibuktikan sampai 520px lewat uji), ada tombol maximize, dan tab AI '
               'di panel bawah DISEMBUNYIKAN otomatis saat chat dipindah ke kanan sehingga panel '
               'bawah tidak ikut terbuka. Uji: 20/20 lulus.'))
B.append(('H2', '2. Bug "Tombol di Customize Layout Tidak Mengubah Apa-apa"'))
B.append(('P', 'Dilaporkan user lewat screenshot. Akar masalah: tombol Kiri/Kanan menyimpan posisi '
               'sidebar ke general.layout.posisiSidebar, tetapi renderer membaca settings.sidebar '
               '(key terpisah). Dua tempat berbeda sehingga klik tidak berpengaruh apa pun. '
               'Diperbaiki: simpan() sekarang menulis ke settings.sidebar, dan muat() membaca key '
               'itu kembali.'))
B.append(('H2', '3. Bug "Sidebar Hilang Total"'))
B.append(('P', 'Laporan lama user ("gua buka menu kiri malah hilang semua"). Akar: bila settings.json '
               'tidak punya key sidebar, posisi jadi undefined sehingga SEMUA cabang render sidebar '
               'gagal — sidebar tidak muncul sama sekali. Diperbaiki dengan fallback kiri di dua titik '
               'pembacaan, plus key ditambahkan ke file settings user.'))
B.append(('H2', '4. Bug "Disuruh Masukin API Key Gemini" padahal Pakai Key Sendiri'))
B.append(('P', 'Dilaporkan user: "kok disuruh masukin api key gemini sih, kan gua pake api key sendiri." '
               'Akar: init() memilih provider aktif dari settings (bernilai gemini) tanpa memeriksa '
               'apakah provider itu punya key, padahal key user tersimpan di provider custom. '
               'Diperbaiki di tiga lapis: (a) init() memilih provider yang BENAR-BENAR punya key; '
               '(b) bila provider aktif kosong tetapi provider lain punya key, aplikasi pindah '
               'otomatis dan menjelaskan: "Gemini belum ada key - pindah ke Custom yang sudah kamu isi"; '
               '(c) pesan galat tidak lagi menyuruh mengisi key provider yang tidak dipakai. '
               'Berlaku untuk chat dan subagent.'))
B.append(('H2', '5. Emoji Diganti Ikon SVG (aturan antislop-ui)'))
B.append(('P', 'Emoji kopi di 4 tempat (tombol donasi, dialog donasi, status bar) diganti ikon SVG '
               'yang mengikuti warna tema lewat currentColor. Hasil audit UI: tidak ada gradient ungu '
               'bawaan, backdrop-filter hanya 2 pemakaian (di bawah batas 1-2), palet warna terkendali.'))
B.append(('H2', '6. README Dibersihkan dan Diperbarui'))
B.append(('P', 'Hapus blok fitur yang sudah dibuang dari aplikasi (Test Explorer, SFTP) beserta 6 '
               'screenshot usang (api-client, devenv, database, test-explorer, tunnel, sftp). Tambah '
               'blok 19 tema dan latar belakang kustom plus screenshotnya. Total 16 screenshot dirujuk, '
               'semua file ada (tidak ada tautan rusak).'))
B.append(('H2', '7. i18n 10 Bahasa Lengkap'))
B.append(('P', 'Semua teks Indonesia terjemahkan ke EN, JA, KO, ZH, ES, FR, DE, PT, AR. Verifikasi '
               'otomatis: 577 kunci x 10 bahasa LULUS (tidak ada kunci bolong di bahasa mana pun).'))

B.append(('H2', '8. Rilis v1.1.10 — Windows DAN Linux, Semua Bertanda Tangan'))
B.append(('P', 'Windows: NSIS 3,8 MB dan MSI 5,3 MB, keduanya ditandatangani. Linux: AppImage 81,5 MB '
               'dan deb 5,7 MB — dibangun ULANG dari source terbaru di WSL (build lama masih dari '
               'kode 22 September sebelum perbaikan API key), plus tanda tangan .sig untuk keempatnya. '
               'latest.json diperbarui dengan signature baru.'))
B.append(('H2', 'Verifikasi Rilis (bukan klaim)'))
B.append(('P', 'Signature diverifikasi secara KRIPTOGRAFIS memakai crate minisign-verify — dan file '
               'yang diverifikasi adalah installer yang DIUNDUH ULANG dari GitHub, bukan file lokal, '
               'hasilnya VALID. Verifikasi ulang: tsc 0 error, i18n 577 kunci LULUS, versi 1.1.10 '
               'konsisten di package.json, tauri.conf.json, dan Cargo.toml.'))
B.append(('H2', 'Uji Hidup Semua Harness'))
B.append(('P', 'Keseluruhan lulus: panel subagents 20/20, AI kanan + maximize 20/20, About 25/25, '
               'pemilih model 23/23, Reset settings 19/19, subagent paralel 13/13, tema + latar 32/32, '
               'timeline 17/17, settings subagent 23/23, prompt AI 20/20, sweep bug 31/31. '
               'Mock provider diperbaiki (v4) supaya subagent meniru format functionCall Gemini.'))
B.append(('H2', 'API Key User: TIDAK TERBAWA ke Build'))
B.append(('P', 'Diperintah: "klo rebuild ver bru api key gua jgn terbawa." Diperiksa: tidak ada API key '
               'asli di source code maupun seluruh riwayat git (yang ada cuma data uji dummy). Key '
               'disimpan di %APPDATA%/zephyr/secrets.json yang berada DI LUAR folder repo, dan '
               'installer hanya berisi program — memasang ulang pun tidak menyentuh file key.'))
B.append(('H2', 'Dikirim ke GitHub'))
B.append(('P', 'Commit 8c59ef9 (fitur), b06c99e (perbaikan API key + posisi sidebar), 8ef503c '
               '(catatan rilis). Tag v1.1.10 dibuat dan rilis berisi 9 asset (NSIS + sig, MSI + sig, '
               'latest.json, AppImage + sig, deb + sig) sudah dipublikasikan dan latest. '
               'Catatan rilis diperbarui dengan bagian Fixed.'))

B.append(('H2', 'Masih Tersisa (jujur)'))
B.append(('P', 'Penyatuan penuh command palette (12 duplikat terdeteksi; sebagian sudah dibereskan '
               'lewat pembaruan daftar section dan pemetaan shortcut, tetapi dua sistem command lama '
               'di commandRegistry.ts belum disatukan). ID dan label command sudah diperiksi tidak '
               'ada duplikat, jadi sisa duplikat itu berasal dari cache saat palette dibuka.'))

# Susun request batchUpdate.
requests = []
i = idx
for tipe, teks in B:
    if tipe in ('H1', 'H2', 'H3'):
        requests.append({'insertText': {'location': {'index': i}, 'text': teks + '\n'}})
        requests.append({'updateParagraphStyle': {
            'range': {'startIndex': i, 'endIndex': i + len(teks) + 1},
            'paragraphStyle': {'namedStyleType': {'H1': 'HEADING_1', 'H2': 'HEADING_2', 'H3': 'HEADING_3'}[tipe]},
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
