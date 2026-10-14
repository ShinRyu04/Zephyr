# Usulan tambalan: menyambungkan konteks repo (ZEPH-KONTEKS-REPO)

Modul `src/lib/konteksRepo.ts` **tidak** dipanggil dari mana pun: berkas yang
harus diubah milik lane lain. Dokumen ini usulan tambalannya - **belum
diterapkan**, dan sengaja tidak mengubah berkas apa pun di lane lain.

Status modulnya: ada, teruji, gerbangnya hijau (`node
scripts/cek-konteks-repo.mjs` → 43 lulus / 0 gagal, `npx tsc --noEmit` → 0
galat). Yang belum ada hanya **pemanggilnya**.

---

## U1 - `src/lib/aiStore.ts`: sisipkan blok konteks repo

Titiknya sudah pas dan tidak perlu berkas baru: `konteksAgent()` (sekitar baris
756) sudah merakit blok teks yang dikirim ke model, dan sudah punya pola yang
benar untuk blok yang bergantung workspace ("not cached: it is pure workspace
state... rebuilding it per turn is cheap next to serving a stale one").

Tambahkan tepat **setelah** blok `proyek` (sekitar baris 792):

```ts
  /*
   * Not cached either, and for the same reason as `proyek`: the file listing
   * is pure workspace state. This is the block that names the files the model
   * would otherwise guess at - capped at 300 names, 8 MiB, and never a secret.
   */
  let repo = '';
  try {
    const { pindaiKonteksRepo } = await import('./konteksRepo');
    repo = (await pindaiKonteksRepo(workspace ?? '', cmd)).konteks.ringkasan;
  } catch {
    /* a bonus block; the workspace line in `hidup` still stands on its own */
  }
```

lalu ubah baris 794 supaya ikut dikirim:

```ts
  return gabung(dariRust, proyek, repo, hidup, kegagalan);
```

**Tidak perlu mengubah `src/lib/systemPrompt.ts`.** Teks dari `konteksAgent()`
sudah diletakkan di bawah header `b.konteksProyek`
(`systemPrompt.ts:1149` dan `:1174`); blok baru ini masuk ke situ apa adanya.
Menambah header kedua justru memecah satu bagian menjadi dua.

**Tidak perlu mengubah `resetCacheKonteks()`.** Blok ini tidak di-cache, jadi
tidak ada yang perlu dibuang. Pemanggilan `resetCacheKonteks()` /
`resetKonteksAgent()` yang sudah ada di `store.ts:668` dan `:697` (buka/tutup
workspace) tetap benar artinya.

### Biaya

`pindaiKonteksRepo` melakukan satu kali `listWorkspaceFiles` (plafon 5.000) +
satu `fsRead` per `.gitignore` (biasanya nol atau satu) + `fsStat` **hanya**
untuk berkas yang akan tampil (plafon `BATAS_STAT_BERKAS` = 300). Bukan satu
panggilan IPC per berkas di repo.

Kalau itu masih terlalu mahal untuk tiap turn, ambil opsi kedua: cache dengan
pola yang sama seperti `ctxCache` (TTL + kunci `workspace`), bukan cache yang
tidak terikat folder.

```ts
  // opsi kedua - cache terikat workspace, TTL sama dengan ctxCache
  if (repoCache && repoCache.workspace === workspace && Date.now() - repoCache.at < CTX_TTL_MS) {
    repo = repoCache.teks;
  } else {
    try {
      const { pindaiKonteksRepo } = await import('./konteksRepo');
      repo = (await pindaiKonteksRepo(workspace ?? '', cmd)).konteks.ringkasan;
      repoCache = { at: Date.now(), teks: repo, workspace };
    } catch {
      repo = repoCache?.teks ?? '';
    }
  }
```

Plus `let repoCache: { at: number; teks: string; workspace: string | null } | null = null;`
di dekat `ctxCache`, dan satu baris `repoCache = null;` di
`resetCacheKonteks()`.

### `workspace` null

`workspace ?? ''` aman: `bangunKonteksRepo` menerima akar kosong dan
`pindaiKonteksRepo` mengembalikan `peringatan`, bukan melempar (diuji: E9).
Tidak ada pengecualian yang perlu ditangkap di pemanggil.

---

## U2 - (opsional) tool agen `baca_konteks_repo`

Kalau model perlu menyegarkan konteks di tengah tugas panjang (workspace
berubah setelah perintah `git checkout`), tool baru di
`src/lib/zephyrTools/` bisa memanggil `pindaiKonteksRepo` dan mengembalikan
`konteks.ringkasan`. **Butuh lane pemilik `src/lib/zephyrTools/**` dan
`src/lib/subsetAlat.ts`** - jangan dikerjakan tanpa itu, karena tool yang tidak
terdaftar di subset tidak akan pernah sampai ke model.

Bentuk yang diusulkan: satu argumen `{ segarkan?: boolean }`, tanpa argumen
jalur (konteks selalu tentang workspace yang sedang dibuka), dan keluaran
ringkasan yang sama persis dengan yang dikirim ke prompt - supaya model tidak
menerima dua bentuk daftar berkas yang berbeda.

---

## Yang JANGAN diubah

- `src/lib/agentGuard.ts` - modul konteks **meminjam** `POLA_RAHASIA` dan
  `DIR_TERPROTEKSI` dari situ, dan sudah mengekspornya ulang. Menambah/mengubah
  daftar di sana mengubah gerbang baca/tulis agen juga; kalau memang perlu,
  bahas dulu.
- `src/lib/projectContext.ts` - blok `proyek` tetap seperti sekarang. Konteks
  repo melengkapinya (daftar berkas), tidak menggantikannya (ringkasan stack).
- `src-tauri/src/**` - tidak ada yang perlu diubah; `list_workspace_files`,
  `fs_read`, dan `fs_stat` sudah cukup, dan pembatasan jalur di
  `periksa_path_baca` tetap berlaku di sisi Rust.
