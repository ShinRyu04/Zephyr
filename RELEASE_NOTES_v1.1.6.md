# Zephyr v1.1.6 — Release Notes

---

## 🇮🇩 Bahasa Indonesia

### Update

Jadi gini, Zephyr sekarang udah makin kece buat yang suka ngoprek.

**Ekstensi sekarang jalan beneran** — bukan cuma baca manifest doang. Kode JS ekstensi dijalankan di Web Worker terisolasi, jadi gak bisa akses window, require, atau fs. Aman lah. Command dari ekstensi muncul di palette dan jalan mulus.

**Marketplace makin lengkap** — sekarang setiap ekstensi di Open VSX nampilin jumlah unduhan sama rating bintang. Ada juga filter kategori biar gak pusing nyari. Jadi kalo mau cari tema, langsung filter Themes, gak usah scroll panjang.

**Git makin mantap** — udah bisa amend commit dan stash (push/pop) langsung dari palette. Gak perlu buka terminal lagi buat hal-hal simpel.

**Outline bisa diklik** — di panel outline, tinggal klik simbolnya, kursor langsung loncat ke posisi di editor. Gak usah scroll manual nyari-nyari.

**Minimap juga bisa diklik** — klik di minimap, editor langsung scroll ke posisi yang sama. Cepet.

**Chat AI gak ilang pas reload** — history chat per provider sekarang tersimpan. Tutup app, buka lagi, chatnya masih ada. Gak perlu mulai dari nol.

**Provider AI kustom** — di Settings → Providers, lo bisa tambah provider AI sendiri. Nama, base URL, API key, bebas. Kalo lo punya LLM lokal atau custom API, tinggal masukin aja.

**Shortcut fix** — `Ctrl+Shift+T` sekarang cuma buat terminal baru. Reopen tab yang ke-tutup pindah ke menu/palette aja, gak bentrok lagi.

**Intinya:** Zephyr makin gacor buat daily driver. Ukuran installer tetep 5,6 MB. Gak gede-gede amat.

---

## 🇬🇧 English

### What's New

Alright, here's what's cooking in v1.1.6.

**Extensions actually run now** — not just manifest-only. Extension JS runs in an isolated Web Worker, so no window, require, or fs access. Safe. Commands from extensions show up in palette and work properly.

**Marketplace got a glow-up** — now shows download counts and star ratings from Open VSX. Also added category filters so you can find what you need without scrolling forever. Want themes? Just filter by Themes.

**Git is smoother** — amend commit and stash (push/pop) are now available directly from the palette. No need to open terminal for simple stuff.

**Outline is clickable** — click any symbol in the outline panel, cursor jumps straight to it in the editor. No more manual scrolling.

**Minimap is clickable too** — click anywhere on the minimap, editor scrolls to that position. Quick.

**AI chat survives reload** — chat history per provider is now saved. Close the app, open it again, your chats are still there. No more starting from scratch.

**Custom AI providers** — head to Settings → Providers and add your own AI provider. Name, base URL, API key — all configurable. Got a local LLM or custom API? Just plug it in.

**Shortcut fixed** — `Ctrl+Shift+T` now only opens a new terminal. Reopen closed tab is moved to menu/palette only, no more conflict.

**Bottom line:** Zephyr keeps getting better for daily use. Installer is still 5.6 MB. No bloat.

---

## How to Update

- **New users:** grab `Zephyr_1.1.6_x64-setup.exe` or `.msi` from [Releases](https://github.com/ShinRyu04/Zephyr/releases).
- **Existing users:** Settings → About → Check for updates. Or just wait for the bell notification if you have auto-update on.

SmartScreen might complain like always — More info → Run anyway. It's fine.

---

Cheers,
ShinRyu04
