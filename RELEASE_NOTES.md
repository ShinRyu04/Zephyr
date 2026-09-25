# Zephyr v1.1.10

Version stays **1.1.10**: this refreshes the release contents, not the version.

## Agent fixes and new AI features

### Fixed

- **Subagents no longer get stuck.** A provider that stalls without closing the
  stream used to leave the agent busy forever, which blocked sending new
  messages and made Stop do nothing. An idle watchdog now releases the step and
  resets the state, and agent state is cleared on startup.
- **The AI can run commands in the terminal again.** The tool that picks a
  terminal pane read a stale store snapshot, so `terminal_exec` failed with
  "cannot open terminal pane". Starting a dev server from chat works now.
- **Menu clicks no longer raise stray errors.** Commands invoked without their
  context are caught and reported instead of surfacing as a global error.

### New

- **Nested subagents:** an agent can split a job into parallel subagents through
  a `subagent_run` tool, with a depth guard against endless nesting.
- **Context compaction:** a Compact button in the AI panel and an
  `AI: Compact Context` command turn a long session into a short summary plus
  the most recent messages.
- **Token and cost per session:** the context meter now shows input and output
  tokens and an estimated cost for the active model.
- **Thinking effort** is adjustable right from the chat header.

## Language, menus, and license

- **Language switching now covers the whole app.** The translator used to check
  the English source before the target-language dictionary, so keys that already
  had a translation still rendered in English, and keys missing from a language
  fell through to Indonesian. Fixed, with the missing keys added. An automated
  audit reports zero leftover Indonesian across nine languages. Default UI
  language is now English.
- **Every menu item is enabled.** The six View > Theme entries are now real
  commands, and an item is only disabled when its command does not exist.
- **Announcements and release notes are per-language** and follow the active UI
  language.
- **Stronger RAM saver mode.** Also disables color decorators and unicode
  highlight, lowers the loaded-tab limit to 3, cuts terminal scrollback to 1000
  lines, and shows a status-bar badge.
- **Apache-2.0 license.**

## Earlier in the 1.1.10 line

- **Parallel subagents** from their own tab, up to 4 at once, read-only by
  design, each capped at 15 steps.
- **Reasoning effort** dropdown mapped per provider, with the model's thinking
  streamed into a collapsible block.
- **AI agent panel**: step-by-step streaming, approval modes, terminal output in
  the chat, a todo panel, image attachments, and inline edit diffs.
- **Skills, memory, and scheduled tasks** stored as plain files under
  `%APPDATA%\zephyr\`.
- **Zen mode, image preview, Customize Layout**, CLI subcommands, and portable
  mode.
- **Smaller and lighter**: optimized release profile, fewer WebView2 processes,
  and no console windows on startup.
- **Bug fixes**: dropped task and test output is kept, SFTP connection errors
  and listing parsing are correct.

## How to update

- **First time:** download `Zephyr_1.1.10_x64-setup.exe` or the `.msi` from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).
- **Already installed:** Settings → About → Check for updates, or wait for the
  bell if auto-update is on.

The installer is signed with a minisign key that the app verifies before
updating. SmartScreen can still warn because this is not a certificate-authority
code-signing certificate: choose **More info** then **Run anyway**.
