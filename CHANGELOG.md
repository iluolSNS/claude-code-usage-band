# Changelog

## 1.2.0 (2026-10-03)

### Added

- **Window stats**: press 📈 at the end of the pills, or run `/usage-band stats`, to open one card per rate-limit window above them.
  - **Chart view**: the window's value at API prices (dollars spent ÷ share of the limit used), where it ends at your current pace or when it hits the limit, your average spend rate, and the rate that lands exactly on the limit at reset, each with a token equivalent. A chart shows usage, the projection, the budget line and the previous window.
  - **By model view**: tokens left in each window for Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 4.5 at your token mix, plus the tokens each model has used.
  - In the terminal the same figures show as text.
- **◐ theme toggle** for the cards and the pills: follow the system, light or dark.
- `/usage-band stats` command.
- A per-session request ledger in the plugin's store, so every Claude Code session on the machine counts toward the windows they share. Entries older than 8 days are dropped.
- Plugin tests (`claude plugin test plugins/usage-band`).

### Notes

- Counting starts when 1.2.0 is installed. A window that was already running is marked `tracked …` and measured from the first reading after install.
- Usage outside Claude Code on the machine (claude.ai, the apps, other computers) is not in the ledger, so dollar values read low when there is some.

## 1.1.0 (2026-10-03)

- First release: 5h / 7d limits, in / out / cache tokens, live tokens per second, cost and context fill as pills above the prompt, fitting any width, with a status line mode (`/usage-band status`).
