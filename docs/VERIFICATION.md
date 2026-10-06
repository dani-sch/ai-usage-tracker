# Verification record

Environment: Windows 11 x64, Node.js 24.14.0, Electron 44.5.1, electron-builder 26.15.3, Playwright 1.63.0. Date: 2026-10-06.

## Completed

- Source/test/build script syntax checks.
- **18 unit and integration tests:** UTC/local calendar boundaries, DST, unavailable versus zero tokens, focus checkpoint/restart/idle handling, corrupt-state preservation, secure-storage refusal, credential deletion, destination allowlist, account validation, multi-bucket Codex quota mapping, OpenAI/Anthropic pagination and cache accounting, GitHub units/identity, sanitized HTTP errors and cooldowns, duplicate Codex/Claude events, real nested JSONL reading, refresh concurrency, preserved readings on failure, overlapping source rejection, and account/history removal.
- **3 real Electron desktop tests:** account creation/removal and plan filtering; focus start/stop and persistence across restart; settings persistence; local log selection and parsing with duplicate records; credential entry through the UI and real Windows DPAPI encryption; credential exclusion from renderer state; exact graph hover and keyboard values; provider filtering; daily table; blocked unsafe external links; renderer Node isolation.
- Real installed **Codex CLI 0.160.0** app-server initialization and `account/read` in a fresh isolated home with explicit keyring configuration. Account is signed out. Existing credentials were not accessed.
- **Windows x64 NSIS installer built successfully.** Default build is unsigned; Authenticode status is `NotSigned`. Installer is in `release/AI-Usage-Tracker-0.1.0-win-x64.exe`.
- **Packaged executable smoke test passed:** production entry point, isolated user-data directory, empty dashboard, real OS encryption availability, and sandboxed renderer. Test data did not enter the production profile.

The E2E provider response is a clearly synthetic GitHub fixture injected only by the test process. Native folder selection is substituted with a temporary test folder. OS inactivity is fixed at zero in the interaction test because hidden Playwright input does not reset Windows' idle counter; actual idle/suspend behavior is covered by deterministic timer tests. Fixtures and these test substitutions are not bundled with the app. OS encryption is real, not substituted, in the desktop test.

## Remaining external validation

- Authenticated quota/billing/admin API reads require the owner to sign in or enter the correct scoped credential in the application. No live account secrets were supplied to this task. The app-server handshake and provider contract tests do not establish successful authenticated reporting for every plan.
- macOS Intel/Apple-silicon packaging, Keychain behavior, and native UI execution require a Mac. Build targets, entitlements, and a native macOS CI job are supplied but were not run on this Windows host.
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
