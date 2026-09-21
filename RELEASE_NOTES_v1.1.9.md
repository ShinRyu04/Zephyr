# Zephyr v1.1.9

## What's new

Terminal shortcuts, AI CLI multiline input, Linux builds, visual Git graph, expanded AI providers, 10 UI languages, and a wider update dialog.

### Terminal clipboard & shortcuts

- **Native `Ctrl+V` paste:** You can now paste straight into the terminal with `Ctrl+V`, alongside `Ctrl+Shift+V` and `Shift+Insert`. Right-clicking is no longer required.
- **`Shift+Enter` for AI CLIs:** In the terminal, `Shift+Enter` now emits a true multiline escape sequence (`\x1b[13;2u` / `\n`) instead of immediately submitting the command. This makes typing multiline prompts in Claude Code, Codex, Hermes, or Aider work as expected.
- **Bracketed paste (anti-truncation):** Pastes are now wrapped in bracketed paste mode (`\x1b[200~ ... \x1b[201~`) with 512-byte paced chunks. Large code snippets or multiline commands no longer overflow ConPTY or drop characters on Windows.

### Linux & cross-platform fixes

- **File reveal on Linux & macOS:** "Reveal in File Explorer" now invokes `xdg-open` on Linux and `open -R` on macOS instead of failing when Windows `explorer.exe` is absent.
- **DAP process cleanup:** Debuggee processes under Linux/macOS are now killed cleanly via `kill -9` when stopping a debug session, mirroring Windows `taskkill /T /F`.
- **Packaging workflow:** `.github/workflows/build-linux.yml` is wired up to build `.deb` and `.AppImage` packages.
- **Linux builds available:** this release ships `Zephyr_1.1.9_amd64.deb` and `Zephyr_1.1.9_amd64.AppImage`, both signed with minisign.

### Expanded BYOK AI providers

Added presets and official SVG brand logos for popular OpenAI-compatible providers:

- **Groq (24 models):** Llama 3.3/3.1/3/4, Qwen3 family, GPT OSS family, Kimi K2, DeepSeek R1 Distill, Mixtral, Gemma 2, MiniMax M2.7, Compound
- **OpenRouter:** curated presets plus automatic live model list — saving your API key pulls the full catalog from the provider, no typing needed
- **xAI (17 models):** Grok 4.6 → 4.5 → 4.3 → 4.20 family → Build 0.1 → Grok 4/3/2 generations, Beta and Vision variants
- **Mistral AI (13 models):** Large 3, Medium 3.5, Small 4, Ministral 3B/8B/14B, Devstral 2, Codestral, Magistral, Voxtral, OCR
- **Cerebras (7 models):** GPT OSS 120B, Llama 3.1 8B, Llama 3.3 70B, Qwen 3 32B/235B, GLM 4.7, Gemma 4 31B
- **Ollama (Local):** Qwen 2.5 Coder, Llama 3.2, DeepSeek R1

Default base URLs and authentication headers are configured in the Rust backend (`adapters/openai.rs` and `secrets.rs`). Any provider's catalog also refreshes live from its `/v1/models` endpoint whenever a key is saved or the dropdown is opened.

### Visual Git graph & Zephyr Dark Acrylic theme

- **Git commit graph:** The Source Control panel now renders a visual branch/commit history graph with commit hashes, commit messages, author info, dates, and branch/tag refs.
- **Zephyr Dark Acrylic theme:** A new dark theme (`zephyr-acrylic`) inspired by modern developer workspaces, featuring dark graphite surfaces, crisp contrast, and cyan accent colors.

### Direct agent tools & project memory

- **`file_write` & `file_edit` agent tools:** In agent mode, Zephyr can now directly write new files or apply targeted edits to existing files on disk, automatically syncing any open editor tab buffers.
- **Project memory (`ZEPHYR.md` / `TERAX.md`):** The built-in AI assistant automatically reads instructions from `ZEPHYR.md` or `TERAX.md` located at the workspace root when present.

### Update experience & UI languages

- **Auto-update on by default:** fresh installs check for new releases on startup and notify through the bell — no manual toggle needed.
- **Wider update dialog:** the "new version available" dialog is now wider with cleaner changelog typography, plus Install / Later / View on GitHub actions.
- **Update-finished notes:** after restart, a banner announces the new version with a "What's new" button that opens the full changelog.
- **10 UI languages:** Settings → General now offers Indonesia, English, 日本語, 한국어, 中文, Español, Français, Deutsch, Português, and العربية — every label synced, with layered fallback so nothing ever shows blank or mixed.

### Donations

- **Support dialog:** the ☕ button (status bar, Settings → About, Help menu, Command Palette) now opens a choice of **Trakteer** (`trakteer.id/ryuga-9jfin`) or **Saweria** (`saweria.co/ShinRyuga04`).

### Bug fixes in this refresh

- **AI panel black screen:** fixed a crash that blanked the entire window when opening the AI panel. The model dropdown (`ModelSelector`) used Zustand v5 selectors that returned new objects/arrays on every render, causing an infinite render loop ("Maximum update depth exceeded") that unmounted the whole UI. The dropdown now reads store values through stable references.
- **Linux builds refreshed:** `.deb` and `.AppImage` were rebuilt with the AI panel fix and signed for auto-update.
- **Linux packaging pipeline fixed:** the release workflow now installs dependencies (`npm ci`) and signs bundles via GitHub secrets, so Linux artifacts ship with valid signatures.

---

## How to update

- **First time:** grab `Zephyr_1.1.9_x64-setup.exe` or the `.msi` from Releases.
- **Already have it:** Settings → About → Check for updates. Or wait for the bell if auto-update is on.

The app verifies the installer signature before installing. SmartScreen can still warn because this is not an EV certificate: click **More info → Run anyway**.

---

**Note:** Installers are signed (minisign) for auto-update, so a downloaded update only installs if its signature matches.
