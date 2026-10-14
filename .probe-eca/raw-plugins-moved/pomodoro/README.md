# Pomodoro

A lightweight Pomodoro Technique integration for ECA that reminds you to take breaks while coding.

## What it provides

- **pomodoro-start** (`chatStart` hook) — Silently records the session start timestamp when a chat begins.
- **pomodoro-check** (`postRequest` hook) — Checks elapsed time after each request and nudges you to take a break once 25 minutes have passed.

## How it works

When a chat session starts, the current timestamp is saved to `/tmp/eca-pomodoro-start`. After every request, the plugin calculates how many minutes have elapsed since the timer started. If 25 or more minutes have passed, it displays a friendly reminder to take a 5-minute break and resets the timer automatically.

## Customization

Fork this plugin and adjust the `25`-minute interval in `pomodoro-check.sh` to match your preferred work/break cadence.

---

By the ECA team.
