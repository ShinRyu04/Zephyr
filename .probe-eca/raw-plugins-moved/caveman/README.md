# Caveman

Ultra-compressed communication skill that cuts ~75% of output tokens by making ECA talk like a caveman — while keeping full technical accuracy.

## What it provides

- **`caveman` skill** — A loadable communication mode with multiple intensity levels (lite, full, ultra) and 文言文 (Classical Chinese) variants. Strips filler, articles, hedging, and pleasantries while preserving all technical substance.

## Why use it

- **Faster responses** — fewer tokens to generate means quicker replies
- **Easier to read** — no walls of text, just the answer
- **Same accuracy** — all technical info kept, only fluff removed
- **Cost savings** — significant reduction in output token usage

## Usage

Ask ECA to activate caveman mode:

```
Load the caveman skill
```

```
Talk like caveman
```

Switch intensity levels during a session:

```
/caveman lite    — professional but tight, no filler
/caveman full    — classic caveman (default)
/caveman ultra   — maximum compression, abbreviations + arrows
```

To deactivate:

```
stop caveman
```

## Example

**Without caveman:**
> "Sure! I'd be happy to help you with that. The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle. I'd recommend using `useMemo` to memoize the object."

**With caveman (full):**
> "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."

Credits: Based on the [caveman](https://github.com/JuliusBrussee/caveman) project by [@JuliusBrussee](https://github.com/JuliusBrussee).
