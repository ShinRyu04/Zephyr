# Kurs 1 USD ke IDR, 1998–2026 — TABEL + SUMBER

Berkas ini memuat TABEL kurs **1 USD = … IDR** per tahun. Aturan kerasnya satu:
**setiap nilai hanya boleh berasal dari sumber nyata yang bisa diperiksa.**
Tahun yang sumbernya belum menerbitkan angka TIDAK diisi — lihat bagian
"Tahun tanpa sumber" di bawah. Tidak ada angka yang ditebak.

## Bagaimana nilainya diambil (bukan dikarang)

Perintah nyata yang dipakai, keluaran apa adanya:

```
$ curl -s -m 15 "https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&per_page=100&date=1998:2026"
[
  {"page":1,"pages":1,"per_page":100,"total":28,"sourceid":"2","lastupdated":"2026-10-08"},
  [ {"indicator":{"id":"PA.NUS.FCRF","value":"Official exchange rate (LCU per US$, period average)"},
     "country":{"id":"ID","value":"Indonesia"},"countryiso3code":"IDN",
     "date":"2025","value":16477.8651797835,"unit":"","obs_status":"","decimal":2}, ... ]
]
```

Arti indikatornya: *Official exchange rate (LCU per US$, period average)* —
LCU Indonesia adalah IDR, jadi nilainya tepat "rata-rata nilai tukar resmi
1 USD dalam rupiah pada tahun itu". `total: 28` artinya sumber mengisi 28 tahun
dari rentang yang diminta (1998–2026); tahun 2026 belum terbit.

## Tabel

| tahun | nilai | sumber |
| --- | --- | --- |
| 1998 | 10013.6225 | WB:PA.NUS.FCRF |
| 1999 | 7855.15 | WB:PA.NUS.FCRF |
| 2000 | 8421.775 | WB:PA.NUS.FCRF |
| 2001 | 10260.85 | WB:PA.NUS.FCRF |
| 2002 | 9311.19166666666 | WB:PA.NUS.FCRF |
| 2003 | 8577.13333333333 | WB:PA.NUS.FCRF |
| 2004 | 8938.85 | WB:PA.NUS.FCRF |
| 2005 | 9704.74166666666 | WB:PA.NUS.FCRF |
| 2006 | 9159.31666666666 | WB:PA.NUS.FCRF |
| 2007 | 9141 | WB:PA.NUS.FCRF |
| 2008 | 9698.9625 | WB:PA.NUS.FCRF |
| 2009 | 10389.9375 | WB:PA.NUS.FCRF |
| 2010 | 9090.43333333333 | WB:PA.NUS.FCRF |
| 2011 | 8770.43333333333 | WB:PA.NUS.FCRF |
| 2012 | 9386.62916666666 | WB:PA.NUS.FCRF |
| 2013 | 10461.24 | WB:PA.NUS.FCRF |
| 2014 | 11865.2112962963 | WB:PA.NUS.FCRF |
| 2015 | 13389.4129365079 | WB:PA.NUS.FCRF |
| 2016 | 13308.3268020541 | WB:PA.NUS.FCRF |
| 2017 | 13380.8338788891 | WB:PA.NUS.FCRF |
| 2018 | 14236.9387734817 | WB:PA.NUS.FCRF |
| 2019 | 14147.6713605454 | WB:PA.NUS.FCRF |
| 2020 | 14582.2034678177 | WB:PA.NUS.FCRF |
| 2021 | 14308.1439011896 | WB:PA.NUS.FCRF |
| 2022 | 14849.8539362104 | WB:PA.NUS.FCRF |
| 2023 | 15236.8846620506 | WB:PA.NUS.FCRF |
| 2024 | 15855.448286671 | WB:PA.NUS.FCRF |
| 2025 | 16477.8651797835 | WB:PA.NUS.FCRF |

Jumlah baris data per tahun: **28** (1998–2025). Setiap baris punya kolom
`sumber` yang menunjuk satu-satunya entri di daftar sumber di bawah.

## Sumber

- `WB:PA.NUS.FCRF` — Bank Dunia (World Bank), indikator
  `PA.NUS.FCRF` = *Official exchange rate (LCU per US$, period average)*,
  negara `IDN`, rentang diminta 1998–2026, `lastupdated` 2026-10-08.
  URL: https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&per_page=100&date=1998:2026

Nilai ditampilkan apa adanya seperti yang dikembalikan sumber (tanpa pembulatan
buatan) supaya bisa dibandingkan ulang.

## Tahun tanpa sumber (DILARANG diisi tebakan)

- **2026 — TANPA SUMBER.** Sumber tidak mengembalikan nilai untuk 2026
  (`total: 28`, tahun terakhir terisi 2025). Rata-rata tahun berjalan belum
  terbit, jadi barisnya sengaja KOSONG. Jalur agen wajib **BERHENTI** di sini,
  bukan menaksir angka — perilaku berhenti itu diuji di
  `scripts/uji-pane-kurs-rencana.mjs` (kasus K13/K14).

## Catatan

- Jalur otomatis "agen buka pane → panggil sumber → tulis berkas → verifikasi"
  beserta usulan agar bisa jalan tanpa manusia ada di
  `docs/LAPORAN-PANE-DAN-KURS.md` dan `docs/USULAN-PANE-DAN-KURS.md`.
- Nilai di tabel ini diperoleh lewat `curl` nyata ke API sumber (keluaran
  ditempel di atas), bukan lewat pane app. Bagian pane-nya masih BUTUH APP —
  lihat laporan.
