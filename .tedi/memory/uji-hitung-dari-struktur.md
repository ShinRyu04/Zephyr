# Menghitung dari STRUKTUR, bukan dari pola nama

Ditulis 2026-10-03, saat memverifikasi kartu persona. Tiga perbaikan berturut-turut
GAGAL, dan tiap kegagalan memperburuk yang sebelumnya. Semuanya karena satu
kesalahan yang sama.

## Apa yang terjadi

Uji perlu mengenali "baris persona" di antara semua elemen ber-`data-testid`.
Tiga percobaan:

| Pola | Yang ikut tertangkap salah |
|---|---|
| `/^persona-[a-z]+$/` | `daftar`, `card`, `cara` - bukan baris persona |
| `+ [a-z0-9]{6,}` untuk id buatan | `daftar` (6 huruf) masih lolos |
| `[a-z0-9]+-[a-z0-9]+` untuk id buatan | `zeph-pilih`, `zeph-aktif` - tombol DI DALAM baris |

Tiap perbaikan menangkap himpunan yang salah, dan yang terakhir justru membuat
uji **lebih** salah daripada yang pertama.

## Kenapa pola nama tidak akan pernah tepat

**Semua turunan baris memakai awalan `persona-` yang sama.** Barisnya
`persona-zeph`, tombolnya `persona-zeph-pakai`, penandanya `persona-zeph-aktif`.
Dari namanya saja, ketiganya tidak bisa dibedakan dengan andal - dan setiap
percobaan membedakannya hanya dengan menambah aturan yang menangkap kasus
sebelumnya, tanpa menyelesaikan penyebabnya.

## Yang benar

Kenali dari **isinya**:

    [...document.querySelectorAll('[data-testid^="persona-"]')]
      .filter(e => e.querySelector(':scope > .persona-pilih'))

Baris persona adalah elemen yang punya anak `.persona-pilih`. Tombol tidak.
Satu definisi, tidak perlu diperbarui saat markup berubah, dan tidak bisa
menangkap elemen yang tidak seharusnya.

## Aturan umum

**Kalau sebuah uji butuh tiga perbaikan berturut-turut untuk daftar yang sama,
berhenti memperbaiki polanya dan ganti CARA MENGENALINYA.** Perbaikan pola yang
beruntun adalah tanda bahwa yang dipakai bukan penanda yang membedakan.

## Jebakan lain dari sesi yang sama

- **Uji harus mengunci keadaan awal.** Persona aktif tersimpan di settings dan
  bertahan antar sesi, jadi uji mulai dari `coder` yang tertinggal dari sesi
  sebelumnya, mengklik `zeph`, dan melaporkan "klik meleset" - padahal
  aplikasinya benar. Kunci ke nilai yang diinginkan dulu; kalau tidak bisa,
  **lewati dengan pesan jelas**, jangan laporkan gagal.
- **Klik CDP di luar viewport tidak sampai.** Dua kali di sesi ini. Selalu
  `scrollIntoView({ block: 'center' })` lalu ukur ulang koordinatnya, dan
  periksa `elementFromPoint` untuk memastikan elemennya memang di titik itu.
