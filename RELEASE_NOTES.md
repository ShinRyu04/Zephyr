# Zephyr v1.1.9

## What's new

Terminal shortcuts, AI CLI multiline input, Linux compatibility fixes, visual Git graph, and new BYOK AI providers.

### Terminal clipboard & shortcuts

- **Native `Ctrl+V` paste:** You can now paste straight into the terminal with `Ctrl+V`, alongside `Ctrl+Shift+V` and `Shift+Insert`. Right-clicking is no longer required.
- **`Shift+Enter` for AI CLIs:** In the terminal, `Shift+Enter` now emits a true multiline escape sequence (`\x1b[13;2u` / `\n`) instead of immediately submitting the command. This makes typing multiline prompts in Claude Code, Codex, Hermes, or Aider work as expected.
- **Bracketed paste (anti-truncation):** Pastes are now wrapped in bracketed paste mode (`\x1b[200~ ... \x1b[201~`) with 512-byte paced chunks. Large code snippets or multiline commands no longer overflow ConPTY or drop characters on Windows.

### Linux & cross-platform fixes

- **File reveal on Linux & macOS:** "Reveal in File Explorer" now invokes `xdg-open` on Linux and `open -R` on macOS instead of failing when Windows `explorer.exe` is absent.
- **DAP process cleanup:** Debuggee processes under Linux/macOS are now killed cleanly via `kill -9` when stopping a debug session, mirroring Windows `taskkill /T /F`.
- **Packaging workflow:** `.github/workflows/build-linux.yml` is wired up to build `.deb` and `.AppImage` packages.

### Expanded BYOK AI providers

Added presets and official SVG brand logos for popular OpenAI-compatible providers:

- **Groq:** Llama 3.3 70B Versatile, Llama 3.1 8B Instant, Mixtral 8x7B
- **OpenRouter:** Claude 3.7 Sonnet, Llama 3.3 70B, DeepSeek V3
- **xAI:** Grok 2, Grok 2 Mini
- **Mistral AI:** Mistral Large, Codestral, Mistral Small
- **Cerebras:** Llama 3.3 70B, Llama 3.1 8B
- **Ollama (Local):** Qwen 2.5 Coder, Llama 3.2, DeepSeek R1

Default base URLs and authentication headers are configured in the Rust backend (`adapters/openai.rs` and `secrets.rs`).

### Visual Git graph & Terax theme

- **Git commit graph:** The Source Control panel now renders a visual branch/commit history graph with commit hashes, commit messages, author info, dates, and branch/tag refs.
- **Terax Acrylic theme:** A new dark theme (`terax-dark`) inspired by modern developer workspaces, featuring dark graphite surfaces, crisp contrast, and cyan accent colors.

### Direct agent tools & project memory

- **`file_write` & `file_edit` agent tools:** In agent mode, Zephyr can now directly write new files or apply targeted edits to existing files on disk, automatically syncing any open editor tab buffers.
- **Project memory (`ZEPHYR.md` / `TERAX.md`):** The built-in AI assistant automatically reads instructions from `ZEPHYR.md` or `TERAX.md` located at the workspace root when present.

---

## How to update

- **First time:** grab `Zephyr_1.1.9_x64-setup.exe` or the `.msi` from Releases.
- **Already have it:** Settings → About → Check for updates. Or wait for the bell if auto-update is on.

The app verifies the installer signature before installing. SmartScreen can still warn because this is not an EV certificate: click **More info → Run anyway**.

---

**Note:** Installers are signed (minisign) for auto-update, so a downloaded update only installs if its signature matches.
