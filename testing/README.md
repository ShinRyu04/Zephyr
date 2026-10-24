# testing

A workspace Zephyr's AI was pointed at, kept here as it was left. Nothing in this
folder is part of the editor; it is the work the agent produced while it was
being tested.

The two weeks before 1.1.14 were mostly about whether the agent could finish a
task on its own. These files are what that looked like: real coursework, written
through the agent pane, compiled and run from Zephyr's own terminal.

## What is here

| File | What it shows |
| --- | --- |
| `main.cpp` | Rectangle-area program, written and compiled through the agent |
| `nilai.cpp` | Student grade average, with branches and `getline` |
| `menghitung jumlah.cpp` | Purchase total, with `setprecision` formatting |
| `hitung.py`, `new-file.c++` | Files created empty, then filled by later turns |
| `.zephyr-context.md` | The context file Zephyr writes between runs, verbatim |
| `.zephyr/launch.json` | The debug configuration the editor generated |
| `err.txt` | A real failure the agent hit and then explained |
| `_runuji/` | The same trivial program in eight languages |

`_runuji/` is a smoke test: one file per language, each printing `<lang>-ok 42`.
It exists to prove the agent could reach a real toolchain for every language
Zephyr claims to support, not to be useful code.

## What was left out

Compiled binaries and debug symbols are not included. If you want to rebuild
them, each source file compiles on its own:

```bash
g++ -o main main.cpp
```

`.zephyr-context.md` and `_runuji/` are also useful as a shape reference for
anyone testing an agent CLI of their own: a workspace small enough to read in one
sitting, with the editor's own bookkeeping left intact rather than tidied away.
