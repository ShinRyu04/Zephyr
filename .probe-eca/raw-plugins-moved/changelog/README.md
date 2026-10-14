# Changelog

A subagent that generates Keep a Changelog entries by analyzing your git history and categorizing commits into user-facing descriptions.

## What it provides

- **`changelog` subagent** — Analyzes commits since the last git tag, categorizes them, and produces a formatted changelog entry ready for your `CHANGELOG.md`.

## How it works

When you ask ECA to generate a changelog, the subagent:

1. Finds the latest version tag and collects all commits since then
2. Reads the existing `CHANGELOG.md` to match its style and conventions
3. Categorizes commits into standard sections (Added, Changed, Deprecated, Removed, Fixed, Security)
4. Rewrites raw commit messages into concise, user-facing descriptions
5. Presents the entry for review and offers to update the file directly

## Usage

```
Generate a changelog entry
```

```
Update the changelog for version 1.3.0
```

```
What changed since the last release?
```

By the ECA team.
