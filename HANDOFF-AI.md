# HANDOFF AI - Zephyr (lanjutkan di sesi baru)

Repo: D:\Zephyr  |  Branch: feat/ai-panel-vscode-layout
Baca juga: AGENTS.md, CLAUDE.md

## Tujuan
Bikin AI Zephyr (panel AI) bisa KERJA BERAT seperti opencode/Hermes/Claude Code.
Model = mr-vip via provider custom2 (baseUrl https://modelrouter.id/v1).
Model yang SAMA lancar di opencode tapi mandek di Zephyr -> akar di Zephyr, bukan model.
JANGAN ganti model sebagai workaround.

## Gejala
- Kerja berat (bikin website 40+ file) berhenti di tengah; todo tidak dipakai (0/8).
- Dulu sering merah: 400 / 'tool call X returned malformed JSON arguments'.

## Sudah DIPERBAIKI (verifikasi, jangan ulang)
1. aiStore.ts: cache baca (agentToolCache) TTL Infinity, tak dibersihkan saat tulisan
   -> list_directory dapat data basi -> muter. FIX: buang cache saat TOOL_PENULIS.
2. aiStore.ts: watchdog aksi-berulang kumulatif lintas tulisan -> list_directory 6x
   membunuh run sehat. FIX: tulisan nyata reset fingerprint.
3. aiStore.ts: frame penutup TELAT dari percobaan lama mematikan langkah baru (merah terus
   saat kerja berat). FIX: hanya lepas langkah bila c.id === activeAgentAttempt.
4. aiStore.ts: chip merah nyangkut (m.error tak dibersihkan walau retry pulih). FIX: bersihkan
   error saat retry mulai + tulis error eksplisit saat run tutup.
5. aiStore.ts: jalur chat tak pakai bentukWireRiwayat (bug user->user 400 di chat). FIX: pakai.
6. aiStore.ts: cancel saat tool jalan meninggalkan assistant(toolCalls) tanpa hasil -> 400.
   FIX: push hasil tool placeholder sebelum break.
7. aiStore.ts: auto-compact tak reset langkahRiwayat (indeks geser -> 400); ambang diukur dari
   history terpangkas (tak pernah nyala). FIX: reset langkahRiwayat; ukur history asli.
8. agent_exec.rs: default timeout bash_run 30s bunuh build berat; cabang timeout kembalikan
   stdout/stderr KOSONG. FIX: default 300_000ms; baca buffer BARENGAN wait
   (tokio::join!(child.wait(), t_out, t_err)).
9. adapters/openai.rs: arguments kosong dianggap malformed -> bunuh langkah. FIX: jadikan json!({}).
10. search.rs + zephyrTools/builtins.ts: grep glob RUSAK di Windows (path backslash vs regex
    slash; folder/**/*.ext butuh subfolder). FIX: normalkan ke slash; **/ cocok nol folder;
    literal_separator(true). 9 unit test di search.rs.
11. ai.rs: stream putus membuang jawaban parsial. FIX: set terminal_error hanya bila belum ada output.
12. FileTree.tsx: klik file = preview (nimpa) -> terasa cuma 1 file. FIX: klik = tab permanen.
13. AiPanel.tsx: auto-scroll berhenti bila 1 langkah nambah >120px. FIX: stick-to-bottom.
14. systemPrompt.ts: prompt 18.8KB->10.9KB; subagent JANGAN fan-out kecuali diminta (pola
    opencode); baca .zephyr-context.md; timeout dipangkas.

## BELUM (kerjakan ini, urut prioritas)
A. Task besar masih mandek (toko 40 file: todo 0/8, kebanyakan read_file, sedikit write).
   Usulan: (i) kurangi tool yang di-expose ke model (subset per tugas);
   (ii) auto work-log: setelah compact suntik daftar file yang SUDAH ditulis + tugas asli;
   (iii) guard paksa tulis: N langkah cuma baca & belum ada file ditulis -> paksa menulis;
   (iv) perkuat enforce todo_write.
B. Toggle Settings izinkan kendali terminal (MCP) - setting mcp.allow_terminal_control sudah ada.
C. Chat sambil agent kerja (tanpa menghentikan agent).
D. Tulis/pelihara .zephyr-context.md otomatis.
E. Bersihkan scripts/_*.mjs, scripts/_prompt-toko.txt.

## Verifikasi (WAJIB, jangan anggap lulus)
- npx tsc --noEmit (dari D:\Zephyr) -> 0 error.
- cd src-tauri; cargo test --lib -> lulus (terakhir 399).
- Dev: terminal A: npm run dev (vite :5173).
  terminal B: cd src-tauri; set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223;
  jalankan .\target\debug\zephyr.exe   (kalau .exe terkunci: taskkill /F /IM zephyr.exe)
- Harness CDP: scripts/lib-cdp.mjs (attach 9223, judul [Zephyr, localhost]).
  Contoh: scripts/uji-urutan-roboh.mjs; scripts/uji-ai-berat.mjs 9223.
  WebView2: pakai helper runAsync() (awaitPromise sering gagal).
- Dev bridge: window.__ZEPHYR__, __ZEPHYR_AI__, __ZEPHYR_RIWAYAT__, __ZEPHYR_TOOLS__,
  __ZEPHYR_FS__, __ZEPHYR_PTY__.
- Uji nyata: suruh agent bikin situs beberapa file di D:\Testing; pantau useAi.getState()
  (agentBusy, agentTodos, agentSteps) sampai idle. Bukti sah = file ADA di disk +
  tak ada .error di pesan assistant + todo ditandai done.

## Aturan keras
- JANGAN commit, JANGAN push tanpa diminta.
- Worktree punya 110+ perubahan lain -> JANGAN git add -A.
- JANGAN hapus folder di dalam D:\Testing.
- Port 9223 = debug WebView2 (harness); MCP Zephyr = 9222.
- JANGAN pernah menulis/menampilkan API key.
- Root-cause dulu; kalau tes gagal baca error asli, jangan ubah tes supaya lulus.
- 3 percobaan gagal -> stop & laporkan bukti.
