# brepl

A skill for evaluating Clojure code with [brepl](https://github.com/licht1stein/brepl).
This plugin provides instructions only. It does not install the brepl executable,
configure hooks, or automatically evaluate edits.

## Requirements

Install `brepl` separately and make it available on ECA's `PATH`.
Evaluation requires a running nREPL server. Manual bracket repair does not.

See the [brepl repository](https://github.com/licht1stein/brepl) for installation
instructions and optional hook setup.

## Usage

ECA normally loads the `brepl` skill automatically when needed. You can also
ask ECA to load it explicitly. The skill covers command options, safe quoting,
server selection, file loading, raw nREPL messages, error handling, and manual
bracket repair. Its usage instructions are self-contained.

Updating this plugin does not change existing hook configuration.

Credits: Based on [brepl](https://github.com/licht1stein/brepl) by @licht1stein.
