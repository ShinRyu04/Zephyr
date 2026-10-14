# Usulan UI: git worktree di Zephyr

Status: **USULAN — belum dikerjakan.** Sisi Rust + tool model sudah ada dan
teruji (`docs/LAPORAN-GIT-WORKTREE.md`); UI tidak dikerjakan karena
`src/components/**` sedang dipakai lane lain. Dokumen ini merinci bentuk UI yang
dirancang untuk command yang sudah ada, supaya pengerjaannya nanti tidak
menemukan bentuk data baru.

Command yang dipakai UI: `worktree_list`, `worktree_add`, `worktree_remove`
(`src-tauri/src/worktree.rs`). Ketiganya selalu mengembalikan
`{berhasil, pesan, data}` dan tidak pernah melempar untuk kesalahan pemakaian —
jadi UI **wajib** memeriksa `berhasil`, bukan mengandalkan `catch`.

---

## 1. Di mana

Panel **Git** yang sudah ada (bukan panel baru). Tab kecil di dalamnya:
`Perubahan | Riwayat | Worktree` — tab ketiga hanya muncul kalau repo yang
terbuka memang repo git.

Alasan menempel di panel Git, bukan di bilah samping: worktree adalah hal repo,
bukan hal proyek-sesi. Ia juga harus terlihat berdampingan dengan daftar cabang
yang sudah ada.

## 2. Daftar worktree

Satu baris per entri `data.worktree`:

```
[UTAMA]  D:/Zephyr                        main             a1b2c3d   (sedang dibuka)
[     ]  D:/Zephyr-cabang-tema            feat/tema-gelap  e4f5a6b   [Buka] [Hapus]
[     ]  D:/Zephyr-detached               detached 9c0d1e2            [Hapus]
[     ]  D:/Zephyr-bekas                  feat/lama                    [Prune]
```

- kolom 1: `isMain` → label `UTAMA`; `bare`/`locked`/`prunable` jadi tanda kecil
  (data mentahnya sudah ada di entri, tidak perlu panggilan tambahan);
- cabang kosong → tulis `detached <head 7>` (jangan tampilkan `null`);
- baris worktree yang **sedang dibuka** tidak punya tombol `Hapus` (dan kalau
  dipaksa dari tempat lain, Rust menolaknya dengan pesan yang jelas);
- `[Prune]` muncul hanya untuk entri `prunable: true` — memakai
  `git_worktree_prune` yang sudah ada di `git.rs`.

Kosong / bukan repo: satu baris penjelas + tombol `Muat ulang`. Jangan
menampilkan tabel kosong tanpa penjelasan: pesan `berhasil=false` dari Rust
(menyebut akar yang benar) justru harus ditampilkan **apa adanya** di situ.

## 3. Buat worktree

Formulir kecil di bawah daftar (bukan modal): tiga isian + satu saklar.

| Isian | Perilaku |
| --- | --- |
| **Folder** | Kotak teks + tombol `Pilih…` (dialog folder). Diisi awalan dari akar repo + `-` (mis. `D:/Zephyr-cabang-`) supaya pengguna hampir tidak pernah salah menaruh di dalam repo. Validasi di UI hanya "belum kosong" — penolakan lain datang dari Rust. |
| **Branch** | Datalist cabang lokal yang sudah ada (dari daftar cabang panel Git). Bebas diketik. |
| **Buat branch baru** (saklar) | `false` → mengirim `buatCabang:false`; `true` → `buatCabang:true` dan branch dibuat dari HEAD. |

Tombol `Buat` mengirim `worktree_add {root, path, branch, buatCabang}`. Setelah
`berhasil:true`, **muat ulang daftar** (jangan menambah baris sendiri: entri
resmi datang dari git).

Tampilkan `pesan` apa adanya setelah selesai; kalimat Rust sudah menyebut jalur
dan branch, jadi tidak perlu menyusun kalimat kedua.

## 4. Hapus worktree

Tombol `Hapus` → dialog konfirmasi yang memuat:

1. kalimat tetap: apa yang dihapus (jalur) dan bahwa branch **tetap ada**;
2. peringatan kalau worktree sedang dipakai proses lain;
3. tombol `Hapus` (kirim `paksa:false`).

Kalau balasan pertama `berhasil:false` **dan** pesannya memuat
`belum di-commit`: jangan langsung kirim `paksa:true`. Dialog berubah menjadi
konfirmasi kedua:

> Worktree ini punya perubahan atau berkas baru yang belum di-commit. Kalau
> dihapus, perubahan itu **hilang** dan tidak bisa dikembalikan dari Zephyr.

dengan centang `Saya mengerti perubahan itu hilang` sebagai syarat tombol
`Hapus paksa` (kirim `paksa:true`) aktif. Default selalu `paksa:false`, dan
jangan pernah menyimpan centang itu antar dialog.

Prune (entri `prunable`): konfirmasi ringan saja, karena tidak menghapus folder
yang masih dipakai.

## 5. Watak yang perlu dijaga

- **`root` selalu eksplisit** dari workspace yang terbuka, walaupun Rust punya
  bawaan "root dari store". UI dan model memakai jalur yang sama, jadi jangan
  ada dua arti "repo saat ini".
- **Pesan Rust ditampilkan apa adanya**, bukan diganti teks generik. Penolakan
  di Rust sengaja menyebut jalur, akar yang benar, dan langkah berikutnya —
  menyembunyikannya membuat UI lebih sulit dipakai daripada model.
- **Tidak ada tombol yang memaksa tanpa konfirmasi kedua.** `paksa=true` hanya
  lahir dari tindakan sadar pengguna.
- **`berhasil:false` bukan galat sistem.** Jangan pakai toast merah "IPC gagal";
  itu hasil normal yang harus dibaca (mis. "folder sudah ada, tidak ditimpa").
- **Tidak menyebut nomor commit** di daftar kalau tidak diperlukan; 7 karakter
  cukup, dan hanya di baris `detached`.

## 6. Yang tidak diusulkan

- Editor konflik / checkout otomatis: itu pekerjaan `git checkout`, bukan
  worktree.
- Menghapus branch setelah worktree dihapus: dua hal berbeda; pengguna bisa
  ingin branch tetap ada.
- Menyimpan "profil" worktree: tidak ada kebutuhan yang terlihat, dan datanya
  sudah ada di git.
