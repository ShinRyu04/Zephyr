# Zephyr v1.1.8

## What's new

Bigger marketplace, fuller AI model list, clearer update notes.

### 101 language marketplace

Every programmer language pack is now in the Marketplace, from Python, JavaScript, Rust, Go, C/C++ down to COBOL, Brainfuck, APL, and more. Search it, hit Install, hit Enable. It works without errors.

### Real logo per language

No more colored initials. Each language in the Marketplace now uses its real logo (Simple Icons / Devicon / VS Code Icons), bundled with the app, so they still show up offline.

### AI models, oldest to newest

Each provider's catalog runs from its earliest models to its latest:

- **Google Gemini:** 1.0 Pro → 3.8 Flash, plus Nano Banana for images
- **OpenAI:** GPT-3.5 → GPT-6 Astra, plus the o1/o3 reasoning series
- **Anthropic:** Claude 1 → Claude Fable 5.1, plus Sonnet/Opus/Haiku
- **DeepSeek:** V3 → V4 Pro, plus Coder and Reasoner

Cheap old models or the newest ones, both are in the dropdown.

### Custom / local AI, easier

Using your own model (Ollama, LM Studio, OpenAI-compatible, etc.) is simpler now:

- **Settings → Model AI → pick "Lokal (opencode / loopback)" or "Custom"**.
- Fill in the **base URL** (for Ollama: `http://127.0.0.1:11434/v1`), then type the **model name** in the field. There is now a **▾ dropdown button** so you can pick from the catalog list plus the API list (the **Refresh** button pulls models straight from the provider).
- It shows up in the **AI panel (bottom left), not just the AI terminal**. The AI panel dropdown lists the custom model you set, with logo and key status. A "how to use" hint sits right on the Settings page.

### Update notifications with the actual changelog

The "new version available" notification (update dialog, banner, and bell) now shows the real release notes: headings, bullet points, and the changelog table. You can see what changed at a glance instead of a bare "New version available".

### Zephyr-style update dialog

The "Zephyr v1.1.8 available" dialog is now Zephyr's own:

- Bigger, so the changelog is visible without long scrolling.
- Shows old version → new version plus the release date.
- A **View on GitHub** button that opens the Release page directly.
- **Later** / **Download & install** buttons.

### Linux build (coming soon)

The `build-linux` GitHub Actions workflow is ready: on the next version release it automatically builds `.deb` + `.AppImage` for Linux and attaches them to GitHub Releases. Stay tuned.

### Automatic extension recommendations

Open a workspace with a given language and the Marketplace suggests matching extensions.

### Donations (Saweria)

Zephyr is free and stays free. If you like it and want to support development, there is a **☕ Donasi** button in the **bottom status bar** (right side) and in **Settings → About**. It opens Saweria (`saweria.co/ShinRyuga04`). You can also go through **Help → Donasi** or press `Ctrl+Shift+P` and type "donasi". Every tip is appreciated.

---

## How to update

- **First time:** grab `Zephyr_1.1.8_x64-setup.exe` or the `.msi` from Releases.
- **Already have it:** Settings → About → Check for updates. Or wait for the bell if auto-update is on.

The app verifies the installer signature before installing. SmartScreen can still complain because this is not an EV certificate. More info → Run anyway. It is safe.

---

**Note:** installers are signed (minisign) for auto-update, so a downloaded update only installs if its signature matches.

Enjoy.
