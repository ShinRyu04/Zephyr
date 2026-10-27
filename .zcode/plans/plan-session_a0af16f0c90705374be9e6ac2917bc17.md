## Rombak besar Subagent + Computer/Browser Use + prompt AI

### A. HAPUS sistem subagent lama (total)
1. **Panel bawah main window**: `panelStore.ts` (hapus 'subagents' dari PanelTabId + PANEL_TABS), `Panel.tsx` (branch + import), hapus file `SubAgentView.tsx`, `SubAgentBar.tsx`, `SubAgentPanel.tsx`, `SubAgentInfo.tsx` (cek pemakaian tiap file dulu), command `subagentsPanel.focus` di commandRegistry, sisa 'subagent' di `SettingsNav.tsx`. Menu "…" panel otomatis bersih (checkbox per tab).
2. **Chat Settings**: hapus section 'subagent' dari `SECTIONS` + `ChatSeksi`, hapus 7 baris ROWS (Let sub-agents write s/d Sub-agent provider) + `CustomSubagentsCard`.
3. **PENTING**: settings `subagent.*` (allowWrite, maxParallel, maxSteps, idleSecs, provider) TIDAK dihapus — engine subagent masih memakainya (default tetap jalan).

### B. SubAgent tampil di chat kayak ZCode (dua window)
- `ChatMessage.tsx`: tool `run_subagent` dirender sebagai baris khusus **🤖 SubAgent {peran/nama} · {tugas}** + status live dari `subagentStore` (spinner = jalan, ✓ selesai, gagal merah) menggantikan baris tool generik.
- **Klik baris → detail**: agent window = panel kanan tab **"SubAgent"** (view `'subagent'` baru, komponen `AgentsPanelKananSubAgent` menampilkan langkah/hasil subagent secara live); main window = **tab editor** `SubAgentTab` (isi sama).

### C. Agent Customizations > Subagents (halaman baru gaya ZCode)
- `agentCustomStore` union + NAV + case; NEW `AgcSubagents.tsx`: judul + hitungan, search, list "Installed" (custom subagents dari `subagentCustom`, kartu ikon/nama/tools/deskripsi) + **+ New** → form (Name, Color, Model inherit, Description, Allowed tools, System prompt, Inject AGENTS.md, Scope) — memperluas store custom yang ada; section **Built-in subagents** (general-purpose, Explore dari subagentRoles) dengan dropdown "Inherit default" (disimpan per peran).

### D. Computer Use
- Section baru **Computer Use** di Agent Customizations: toggle "Enable Computer Use" + "Show Computer Use button in the composer" (persist di settings.computerUse). Tombol **🖥 Computer Use** muncul di composer agent window saat showButton aktif (klik = toggle enable). Catat jujur: engine computer use sendiri belum ada — UI + setting dulu.

### E. Browser Use
- Section Browser di Agent Customizations sudah ada (clear data dll) — tambah toggle **"Enable built-in browser control"** (persist settings.browser.enabled, menggate tool browser_open/read/click/type). "Ignore certificate errors" BUTUH Rust (flag webview) — tidak termasuk batch ini.

### F. Prompt AI: paham seluruh Zephyr (gaya agent ZCode)
- `aiStore` prompt builder: blok **pengetahuan aplikasi** di system prompt (chat + subagent): apa itu Zephyr (editor Tauri 2 + React + TS), dua jendela (main + Agents + panel kanan), tool katalog yang tersedia, subagent, konvensi kerja (MCP 9222, settings, git), supaya agent mengerti lingkungannya dan berekerja seperti agent ZCode.

### Verifikasi
- `npx tsc --noEmit` 0 error; grep tidak ada sisa import file yang dihapus; visual CDP dua window (chat rows SubAgent, panel/tab detail, halaman Subagents, toggle Computer/Browser, chip tombol composer).