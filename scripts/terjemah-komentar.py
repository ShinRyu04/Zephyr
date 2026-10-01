"""Rewrite the remaining Indonesian code comments as English.

A mapping table, not machine translation: these comments explain WHY a decision
was made, and a translator that rewrites the reasoning invents facts the author
never wrote. Each entry is a hand-written English version of the same point.

The script reports every entry it could not find, so nothing is skipped
silently.
"""

import io
import os

GANTI = [
    # src/App.tsx
    ("/* Rust tidak tersedia (mode browser) \u2014 biarkan */",
     "/* Rust not available (browser mode), leave it */"),
    ("{/* Resizer kolom AI: bisa di-drag seperti sidebar. Sebelumnya lebar",
     "{/* AI column resizer: draggable like the sidebar. Previously the width"),
    # SubAgentBar
    ("// Form tetap terbuka supaya user bisa langsung menyusun batch berikutnya \u2014",
     "// The form stays open so the next batch can be queued right away,"),
    # DebugView
    ("{/* Adapter yang belum terpasang: instruksi install, bukan diam (brief V5). */}",
     "{/* Adapter not installed: show install instructions instead of silence. */}"),
    # FindBar
    ("// tapi harus terbuka supaya state pencarian aktif.",
     "// but it must stay open for the search state to be active."),
    ("/* query regex tidak valid \u2014 ditandai lewat `invalid` */",
     "/* invalid regex query, flagged through `invalid` */"),
    # McpPanel
    ("{/* Satu klik untuk semua CLI yang config-nya ADA di mesin ini.",
     "{/* One click for every CLI whose config EXISTS on this machine."),
    # PromptSection
    ('{/* Apa yang dijawab AI kalau ditanya "kamu model apa". Blok ini TIDAK',
     '{/* What the AI answers when asked "what model are you". This block is NOT'),
    # EditorArea
    ("{/* fase 24.1: <Breadcrumbs /> versi shell DIHAPUS dari sini.",
     "{/* The shell version of <Breadcrumbs /> was REMOVED from here:"),
    # PortsView
    (" * 5 detik: cukup cepat untuk menangkap dev server yang baru naik, cukup jarang",
     " * 5 seconds: fast enough to catch a dev server that just came up, rare enough"),
    (" * untuk tidak memanggil tabel socket sistem terus-menerus.",
     " * that it does not hammer the system socket table."),
    # BrowserPane
    (" * bisa dimuat karena tidak ada iframe yang terlibat.",
     " * can load because no iframe is involved."),
    ("   * Posisi awal diambil dari elemen penampung supaya webview langsung muncul di",
     "   * The initial position comes from the container element so the webview lands"),
    ("   * tempat yang benar; loop sinkronisasi di bawah yang menjaga sesudahnya.",
     "   * in the right place; the sync loop below keeps it there afterwards."),
    ("   * sidebar di-toggle) dan ResizeObserver tidak melihat pergeseran.",
     "   * sidebar toggled), and ResizeObserver does not see a shift."),
    ("       * yang seharusnya menutupinya. Tanpa pemeriksaan ini, dialog Command",
     "       * that should cover it. Without this check, the Command Palette dialog"),
    # agentTools
    (" * store yang sama dengan tombol UI, bukan jalur terpisah, supaya tata letaknya",
     " * store the UI button uses, not a separate path, so the layout stays"),
    # aiStore
    ("// Key sudah dimuat di atas; jangan panggil dua kali.",
     "// The key was already loaded above; do not call twice."),
    ("/* sudah selesai */", "/* done */"),
    # cliStore
    ("// App tetap harus jalan walau pembacaan argumen gagal.",
     "// The app must still start even if argument parsing fails."),
    # cmColor
    ("return false; // klik harus sampai ke <input>",
     "return false; // the click must reach the <input>"),
    # extRunner
    ("// sisi Rust dari binary yang di-whitelist (settings.extensions.trust);",
     "// Rust side of the allow-listed binary (settings.extensions.trust);"),
    ("// worker cuma dapat stdout/stderr/exit \u2014 tidak pernah pegang akses exec",
     "// the worker only gets stdout/stderr/exit, never exec access"),
    ("// untuk mencari binary runtime. Nilai diambil dari proses utama.",
     "// to find runtime binaries. The values come from the main process."),
    ("// Node: process adalah EventEmitter \u2014 ekstensi memanggil process.on/dll.",
     "// Node: process is an EventEmitter, so extensions call process.on etc."),
    ("// Hash asli tidak ada di WebCrypto \u2014 stub jelas yang TIDAK crash saat load",
     "// The real hash is not in WebCrypto, so an explicit stub that does NOT crash on load"),
    # mcpStore
    ("/* Rust sudah timeout \u2014 tidak ada yang bisa dilakukan */",
     "/* Rust already timed out, nothing left to do */"),
    # portsStore
    ("  /** pid proses pemilik port; 0 kalau tidak diketahui (mis. bukan Windows). */",
     "  /** pid of the owning process; 0 when unknown (e.g. not Windows). */"),
    ("   * Baca port yang benar-benar mendengarkan di sistem dan gabungkan dengan",
     "   * Read the ports actually listening on the system and merge them with"),
    # symbolTree
    ("// Server mati / belum siap \u2014 fallback saja, jangan ganggu user.",
     "// Server down or not ready yet, fall back quietly without bothering the user."),
    # systemPrompt
    ("// File tidak ada: lanjut ke kandidat berikutnya.",
     "// File missing: move on to the next candidate."),
    # xtermRegistry
    ("/* sudah ter-dispose */", "/* already disposed */"),
    # bg_image.rs
    ("/// SVG tidak punya magic bytes: isinya teks XML. Deteksi lewat awalan teks",
     "/// SVG has no magic bytes: it is XML text. Detect it by matching a text prefix"),
    ("/// dan seluruh fungsi ini memang sengaja memeriksa isi, bukan nama.",
     "/// and this whole function deliberately inspects content, not the name."),
    # browser_pane.rs
    ("// membaca DOM dan menjalankan klik di dalamnya.",
     "// read the DOM and run clicks inside it."),
    ("// Batas yang tetap berlaku: halaman yang mengirim X-Frame-Options tidak bisa",
     "// The remaining limit: a page that sends X-Frame-Options cannot be"),
    # ports.rs
    ("// ports.rs \u2014 daftar port TCP yang sedang mendengarkan di mesin ini.",
     "// ports.rs: TCP ports currently listening on this machine."),
    ("/// Port yang layak ditampilkan: buang port sistem dan port milik Zephyr sendiri.",
     "/// Ports worth showing: drop system ports and Zephyr's own ports."),
    ("    /// Nama proses dari pid, memakai Toolhelp32 (tanpa cmd, tanpa WMI).",
     "    /// Process name from a pid, via Toolhelp32 (no cmd, no WMI)."),
    ("    /// untuk proses milik user lain, jadi nama proses boleh kosong).",
     "    /// for processes owned by other users, so the name may be empty)."),
    ("/// Daftar port yang sedang mendengarkan, terurut dari yang terkecil.",
     "/// Listening ports, sorted from the lowest number."),
    # skills.rs
    ("        // Folder yang punya SKILL.md tidak ditelusuri lagi: di struktur",
     "        // A folder that has SKILL.md is not walked further: in a nested"),
    (" * kalau nama foldernya berbeda.", " * when the folder name differs."),
    (' * "skill tidak ditemukan" padahal ada.', ' * "skill not found" when it does exist.'),
    ("     * Skill yang berasal dari folder Hermes tidak boleh ditimpa dari sini.",
     "     * A skill that came from the Hermes folder must not be overwritten here."),
    ("     * tidak terlihat dari Zephyr. Untuk mengubahnya, edit langsung di folder",
     "     * is invisible from Zephyr. To change it, edit it directly in the Hermes"),
    # web.rs
    ("// CORS \u2014 DuckDuckGo dan sebagian besar situs menolaknya, jadi fetch() di",
     "// CORS: DuckDuckGo and most sites reject it, so fetch() in the"),
    ("// KENAPA ureq: sudah dipakai browser.rs untuk memeriksa header X-Frame-Options.",
     "// WHY ureq: already used by browser.rs to inspect X-Frame-Options headers."),
    (" * <script> dan <style> BESERTA ISINYA \u2014 kalau hanya tag-nya yang dibuang,",
     " * <script> and <style> WITH their contents: dropping only the tags lets"),
    (" * kode JavaScript ikut masuk ke teks dan membanjiri jawaban.",
     " * JavaScript leak into the text and flood the answer."),
]

LEWAT = {"node_modules", "dist", ".git", "target", "release", ".zephyr"}

ok = 0
miss = []
for cari, ganti in GANTI:
    found = False
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in LEWAT]
        for f in files:
            if not f.endswith((".ts", ".tsx", ".rs")):
                continue
            p = os.path.join(root, f)
            try:
                s = io.open(p, encoding="utf-8").read()
            except Exception:
                continue
            if cari in s:
                io.open(p, "w", encoding="utf-8", newline="").write(s.replace(cari, ganti, 1))
                ok += 1
                found = True
                break
        if found:
            break
    if not found:
        miss.append(cari[:70])

print("  translated: %d/%d" % (ok, len(GANTI)))
if miss:
    print("  NOT FOUND:")
    for m in miss:
        print("    " + m)
