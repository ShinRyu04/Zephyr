# Zephyr 1.1.13

## Highlights

- The agent can work with code through explicit tools for reading open editor tabs and files, writing editor content, making exact replacements, and applying unified patches. File changes remain visible as tool runs rather than happening through an undocumented background process.
- Chat requests sent while a reply is in progress are queued in the composer. The numbered queue items can be edited, reordered, removed, or cleared, and image attachments stay with the request when it is sent.
- Task progress is easier to follow. Agent task lists show completion, while subagent rows show status, model, tool steps, duration, and the available evidence for each result.
- Discord Rich Presence is included. When the local Discord client is available, Zephyr publishes the active workspace and elapsed session time, and clears the activity when the app exits.

## AI and agent workflow

- Automatic context compaction summarizes older turns when a conversation nears the model's context limit. Manual `/compact` remains available.
- Transient provider and network failures can retry before a tool is dispatched. Authentication, invalid-request, malformed-response, and tool failures are not retried, which avoids repeating file or shell side effects.
- Subagents can run tasks in parallel or as an explicit chain, use a selected model, and restore the most recent batch after restart. File ownership checks prevent two writing subagents from changing the same file at once.
- Queued chat requests, terminal servers, scheduled jobs, and subagent runs are the background work covered by this release. Zephyr does not provide a separate, magical detached-agent runtime.

## Editor and terminal

- The command palette now fills as soon as its lazy command list arrives and rebuilds its list whenever it opens, so the first opening is no longer empty.
- Opening Customize Layout no longer closes the window when its panel is loaded for the first time.
- Invalid editor and terminal font settings are rejected, preserving a monospace fallback instead of silently switching to a serif font.
- Popover menus in the terminal tabs, panel tabs, and Extensions view now open even when their trigger reference is temporarily unavailable.
- Scheduled commands now run when they become due. Zephyr prefers a visible terminal pane so the command and output can be inspected; if a pane cannot be opened, it uses the non-interactive command runner and reports the result. This also supports long-running terminal servers, but it is not a detached agent session.

## Themes and localization

- All ten language dictionaries now include 39 interface strings that were previously missing. Six English entries no longer fall back to Indonesian, and the malformed mixed-language line in the built-in prompt has been corrected.
- The editor and terminal apply validated font choices consistently across themes. The Thinking indicator uses the Zephyr mark with motion instead of a generic spinner, while model-only reasoning is no longer shown as a reader-facing block.

## Reliability

- Fixed a Zustand render loop in the context meter when no chat session is active.
- Queued messages retain their image attachments.
- Recursive folder copy now includes nested files and refuses to copy a folder into its own subtree.
- The scheduled-job listener is connected to the existing timer, so a due job is no longer marked as run without executing its command.

## Updating

Installed builds can check for an update from **Settings > About > Check for updates** once the final 1.1.13 metadata and signed artifacts are published. The updater verifies its own release signature, but the Windows installer is not certificate-signed, so SmartScreen may still show an unknown-publisher warning.

Portable mode is detected by a `portable` marker beside the executable and stores application data in the adjacent `data` folder. There is no dedicated in-place portable update path in the current implementation. For a portable copy, download the new portable build and replace the application manually while preserving the marker and data folder.

At the time these notes were prepared, the 1.1.13 build, automated test, updater end-to-end, signature, and installer checks were still release gates. The staged updater signature mismatch must be corrected before its metadata is published.
