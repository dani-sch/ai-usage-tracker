# AI Usage Tracker

A private Windows and macOS desktop dashboard for AI subscription accounts, reported tokens, and working time. Inspired by [ClaudeBar](https://github.com/tddworks/ClaudeBar); independently implemented in Electron. No ClaudeBar code or assets are included.

## Features

- Multiple named accounts per provider, subscription/provider filters, automatic polling, manual refresh, and tray/menu-bar access.
- Codex remaining quota windows and reset timestamps through the official app server.
- GitHub Copilot personal billing usage, with AI-credit and legacy premium-request modes. AI-credit accounts show estimated credits remaining and a percentage bar using the plan allowance or an editable override.
- OpenAI and Anthropic organization API token reports, with pagination.
- Optional Codex and Claude Code local logs for reported tokens.
- Rolling 30-day token chart with exact hover/keyboard values and an accessible daily table.
- Per-account focus timers, today's and this month's working time, idle/lock/sleep protection.
- Encrypted credentials, isolated Codex sign-ins, atomic persistence, and account removal.

**There is no universal subscription usage API.** Unavailable telemetry is distinct from measured zero. Tokens are never derived from percentages or billing credits. API organization usage is separate from subscription quotas. See [provider coverage](docs/INTEGRATIONS.md).

## Run locally

Requires Node.js 24 LTS and npm. The installer runs without Node.js. Codex accounts additionally require the official native Codex CLI.

```sh
npm ci
npm start
```

Use **Add account**, choose a provider, name the account, and optionally enter a plan label. Then:

- **ChatGPT / Codex:** choose **Sign in with ChatGPT** and finish in your browser. Create another profile for another identity. If CLI discovery fails, choose its native executable in Settings. Existing CLI credentials are never imported. On Windows choose `codex.exe`, not an npm `.cmd` shim.
- **GitHub Copilot:** choose **Connect securely** and follow the on-screen token instructions with **Plan: read** permission. Choose the applicable billing model in account details. For AI credits, enter Pro, Pro+, or Max as the subscription to use the published allowance, or set **Monthly AI credit allowance** to the amount shown on your [GitHub AI usage page](https://github.com/settings/billing/ai_usage). Leave this field blank to use the plan default. Organization-paid seats are excluded from this personal endpoint.
- **Claude:** choose **Select local logs**, typically `~/.claude/projects`, and confirm account attribution. Quota/reset fields remain unavailable.
- **OpenAI API / Anthropic API:** enter the corresponding **organization admin key**. These are organization-wide reports, not subscription allowances. Do not add overlapping reports for the same organization twice.
- **Other:** name any subscription and track focus time.

Never paste credentials into chat, issues, or source files. Enter them only in the app's password field. Browser sign-in is used where available.

For Codex tokens, select a `sessions` folder from the CLI profile whose work you want to attribute. The tracker's isolated sign-in profiles do not automatically contain working sessions. Logs with multiple identities cannot reliably be split by subscription; use separate working profiles. Overlapping folder sources are rejected.

## Data semantics

**Tokens:** input plus output, including cached input exactly once. Codex cumulative snapshots are deduplicated. Claude assistant messages are deduplicated and their disjoint cache categories included. Token dates use UTC, as do API reports. Local values cover only selected folders and retained records. Provider ingestion can lag. Missing values show `—`/Unavailable. Complete successful reports may return zero. Malformed API results preserve previous readings; unreadable JSONL records show a partial-data warning.

**Working time:** an explicit timer, one subscription at a time, not inference runtime or an estimate from tokens. It pauses after five minutes of OS inactivity, on lock, and on sleep. The grace period can include up to five minutes of inactivity. Checkpoints occur every 15 seconds; a crash can lose the last checkpoint interval. Timers never resume after restart; heartbeat gaps over one minute are discarded. Summaries use the local calendar at recording time, including DST.

**Quotas:** Codex displays provider-reported windows; passing a reset time does not reset a displayed quota until the provider confirms it. Copilot AI-credit balances are explicitly **estimated** by subtracting the reported current-month usage from an editable allowance. Published defaults checked October 6, 2026 are Pro 1,500, Pro+ 7,000, and Max 20,000 credits; GitHub's flex allotment can change. The scheduled reset is the first of the next month at 00:00 UTC, per [GitHub's individual billing documentation](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing). Old-month reports never become a new-month balance, excess usage is shown separately, and unknown plans require a custom allowance. Legacy premium requests remain usage-only. Errors explicitly mark saved readings.

## Build and verify

```sh
npm run check
npm test
npm run test:e2e
npm run pack

# On Windows: x64 NSIS installer
npm run dist:win
npm run test:package

# On macOS: Intel and Apple silicon DMG/ZIP
npm run dist:mac
```

Packages go to `release/`. GitHub Actions runs checks, real Electron UI tests, and packaging on Windows and macOS, then uploads artifacts. It does not publish a release. A Windows build cannot validate macOS Keychain, signing, or the DMG.

Default builds are unsigned development builds. Public distribution requires your own Windows and Apple signing/notarization credentials using [electron-builder signing](https://www.electron.build/code-signing.html). Store credentials in CI secrets. The supplied workflow disables signing discovery; remove that setting in a signed release job. No signing identity is provided.

`node scripts/smoke-codex.mjs` checks the actual installed CLI's initialization and an isolated signed-out account read. It does not inspect existing credentials.

## Architecture and storage

- `src/main.js`: hardened window, allowlisted IPC, native file picker, tray, lifecycle.
- `src/core/`: persistence, vault, timer, polling, model, HTTP boundaries.
- `src/providers/`: official Codex JSON-RPC, billing/admin APIs, streaming log parsers.
- `src/renderer/`: dependency-free dashboard; no Node or direct network access.
- `test/`: invariants, refresh/error handling, actual Electron tests. Fixtures exist only in isolated temporary test profiles.

App data lives in `%APPDATA%/AI Usage Tracker` on Windows or `~/Library/Application Support/AI Usage Tracker` on macOS. `state.json` holds labels, aggregates, source paths, settings, and focus totals. `credentials.json` holds OS-encrypted API keys. Codex uses explicit `keyring` storage in app-owned `profiles/<uuid>` homes; plaintext fallback is disabled. Prompt bodies are never persisted. Removing an account signs out and deletes its tracker data, leaving external logs untouched.

Read [SECURITY.md](SECURITY.md) and [verification evidence](docs/VERIFICATION.md).

MIT. See [LICENSE](LICENSE).
