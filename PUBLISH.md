# How to publish a Zephyr release

Concise, for use on every release. The hard rules are at the very bottom.

## Repo & visibility

| Repo | Contents | Visibility |
|---|---|---|
| `ShinRyu04/Zephyr` | all source code + GitHub Release artifacts | public |

Releases are created directly in the main repo. The updater endpoint in
`tauri.conf.json` points to
`https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json`,
so `latest.json` and the artifacts must live in this repo's release.

## 1. Bump the version (3 files)

```
package.json            "version": "1.1.1"
src-tauri/Cargo.toml    version = "1.1.1"
src-tauri/tauri.conf.json  "version": "1.1.1"
```

## 2. Build the release (signing key required)

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="C:/Users/home/AppData/Roaming/zephyr/zephyr.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$APPDATA/zephyr/signing-key.txt")"
npm run tauri:build
```

Output in `src-tauri/target/release/bundle/` (Tauri v2: the Windows updater
uses the NSIS/MSI installer directly + `.sig`, NOT a zip):

```
msi/Zephyr_1.1.1_x64_en-US.msi         <- MSI installer
msi/Zephyr_1.1.1_x64_en-US.msi.sig     <- minisign signature
nsis/Zephyr_1.1.1_x64-setup.exe        <- NSIS installer (updater artifact)
nsis/Zephyr_1.1.1_x64-setup.exe.sig    <- its signature
```

## 3. Create the GitHub Release

```bash
gh release create v1.1.1 \
  --repo ShinRyu04/Zephyr \
  --title "Zephyr v1.1.1" \
  --notes-file RELEASE_NOTES.md \
  "src-tauri/target/release/bundle/msi/Zephyr_1.1.1_x64_en-US.msi" \
  "src-tauri/target/release/bundle/msi/Zephyr_1.1.1_x64_en-US.msi.sig" \
  "src-tauri/target/release/bundle/nsis/Zephyr_1.1.1_x64-setup.exe" \
  "src-tauri/target/release/bundle/nsis/Zephyr_1.1.1_x64-setup.exe.sig"
```

## 4. Write `latest.json` + upload it as an asset

`signature` = **the entire contents of the `.exe.sig` file** (one base64 line).
`url` points to setup.exe, not a zip:

```json
{
  "version": "1.1.1",
  "notes": "Release summary.",
  "pub_date": "2026-09-07T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of Zephyr_1.1.1_x64-setup.exe.sig>",
      "url": "https://github.com/ShinRyu04/Zephyr/releases/download/v1.1.1/Zephyr_1.1.1_x64-setup.exe"
    }
  }
}
```

Upload `latest.json` as a release asset too. Since v1.1.1 becomes "latest", the
URL `.../releases/latest/download/latest.json` serves it automatically.

## 5. Verify the updater

Temporarily lower the local version (3 files) to an older number, build,
install, click "Check for updates" - it should find the new version, download,
and install. Or at minimum:
`curl -s https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json`
should show the newest version.

## Hard rules

1. **The signing key `%APPDATA%\zephyr\zephyr.key` must NEVER be committed or
   uploaded.** It is already in `.gitignore` (`*.key`). If it is lost, all
   existing users can no longer update and must install manually. Keep a copy
   in a password manager.
2. **Check `git status` before pushing** - make sure no `.key`, `.env`,
   `secrets.json`, or token is included.
3. The installer is not code-signed (no certificate purchased yet), so
   SmartScreen will warn. This is different from the updater signature above
   and is explained in `RELEASE_NOTES.md`.
4. Do not upload a stale duplicate `latest.json` to a new release - the old
   version is automatically superseded because downloads always come from the
   "latest" release.
