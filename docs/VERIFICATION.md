# Verification record

Environment: Windows 11 x64, Node.js 24.14.0, Electron 44.5.1, electron-builder 26.15.3, Playwright 1.63.0. Date: 2026-10-06.

## Completed

- **Compact side-panel update (2026-10-06):** 25 unit/integration tests and all five Electron desktop scenarios passed on Windows. New checks cover independent daily units, month-crossing billing requests, cached history, rate-limit recovery, missing versus zero days, oversized local records, pin persistence, window resizing, and a 360-pixel layout. Compact screenshots were visually reviewed and the Windows NSIS installer rebuilt in `release/side-panel/`.
- **Live packaged side-panel validation:** after the owner confirmed local Codex sessions belong to one account, the default sessions folder was linked through the app. Real Codex counters populated 16 daily bars; the personal GitHub billing API returned all 30 requested dates, with six nonzero days. Both accounts returned ready without connection errors. Codex partial-history warnings remain visible for unreadable/oversized records. The packaged panel had no horizontal overflow. Only redacted status and day counts were recorded; personal screenshots stay in ignored local test results.

- Source/test/build script syntax checks.
- **18 unit and integration tests:** UTC/local calendar boundaries, DST, unavailable versus zero tokens, focus checkpoint/restart/idle handling, corrupt-state preservation, secure-storage refusal, credential deletion, destination allowlist, account validation, multi-bucket Codex quota mapping, OpenAI/Anthropic pagination and cache accounting, GitHub units/identity, sanitized HTTP errors and cooldowns, duplicate Codex/Claude events, real nested JSONL reading, refresh concurrency, preserved readings on failure, overlapping source rejection, and account/history removal.
- **3 real Electron desktop tests:** account creation/removal and plan filtering; focus start/stop and persistence across restart; settings persistence; local log selection and parsing with duplicate records; credential entry through the UI and real Windows DPAPI encryption; credential exclusion from renderer state; exact graph hover and keyboard values; provider filtering; daily table; blocked unsafe external links; renderer Node isolation.
- Real installed **Codex CLI 0.160.0** app-server initialization and `account/read` in a fresh isolated home with explicit keyring configuration. Account is signed out. Existing credentials were not accessed.
- **Windows x64 NSIS installer built successfully.** Default build is unsigned; Authenticode status is `NotSigned`. Installer is in `release/AI-Usage-Tracker-0.1.0-win-x64.exe`.
- **Packaged executable smoke test passed:** production entry point, isolated user-data directory, empty dashboard, real OS encryption availability, and sandboxed renderer. Test data did not enter the production profile.
- **Native GitHub CI passed on Windows and macOS** for implementation commit `5ef947a80e5a16c79b400785ea683c7001a98736`: syntax checks, all 18 unit/integration tests, all 3 Electron E2E tests, native packaging, and artifact upload. macOS produced Intel and Apple-silicon DMG/ZIP files. [Successful run](https://github.com/dani-sch/ai-usage-tracker/actions/runs/37502771800).
- **Authenticated Codex verification passed in the packaged Windows app.** The owner completed the official browser sign-in, and the app successfully fetched a provider quota window and reset timestamp with ready status and no error. Only redacted status/counts were inspected; no credential or personal account identifier is included in this record.

The E2E provider response is a clearly synthetic GitHub fixture injected only by the test process. Native folder selection is substituted with a temporary test folder. OS inactivity is fixed at zero in the interaction test because hidden Playwright input does not reset Windows' idle counter; actual idle/suspend behavior is covered by deterministic timer tests. Fixtures and these test substitutions are not bundled with the app. OS encryption is real, not substituted, in the desktop test.

## Remaining external validation

Copilot balance update (2026-10-06): all 21 unit/integration tests pass on Windows, including estimated balances, custom allowances, exhausted plans, unknown plans, and month boundaries. All four desktop scenarios pass, including allowance edits and persistence across restart; the new scenario was rerun after correcting its input's accessible label. The screenshot was visually reviewed and the card checked at a 1000×680 window size. These local checks supplement the earlier native CI run above. The owner-provided screenshot also confirms a successful authenticated personal GitHub AI-credit usage read; remaining credits are still an estimate, not a provider-reported entitlement.

- OpenAI/Anthropic admin APIs are covered by contract tests, but authenticated reads have not been exercised here. They require appropriately scoped owner credentials entered in the app. Successful Codex and personal GitHub reads do not establish availability for every provider or plan.
- Native macOS UI, secure storage, and Intel/Apple-silicon packaging passed in CI. Signing/notarization and Keychain behavior across signed application updates still require owner-provided signing credentials and release validation.
- Windows signing and Apple signing/notarization require owner-provided certificates. Public release publishing is not performed.
- The build toolchain audit reports eight moderate findings in one transitive `sprintf-js` logging/proxy dependency chain. There are no production npm dependencies. See SECURITY.md.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run test:e2e
node scripts/smoke-codex.mjs
npm run dist:win
npm run test:package
```

On a Mac run `npm run dist:mac` after the shared checks. CI uploads native artifacts without publishing them.
