# Provider coverage and evidence

Primary documentation checked 2026-10-06. Interface failures preserve prior readings instead of inventing values.

| Account | Connection | Remaining / reset | Token history |
| --- | --- | --- | --- |
| ChatGPT / Codex | Official CLI browser login; separate home per account | Codex windows and multiple limit IDs; excludes ChatGPT chat | Optional local sessions, not account-wide |
| Copilot personal billing | Fine-grained PAT with Plan read | Estimated AI credits remaining using an editable allowance; scheduled monthly reset. Legacy requests: usage only | Unavailable from billing API |
| Claude personal | Explicit local Claude Code projects folder | Unavailable in this implementation | Local reported assistant tokens |
| OpenAI API | Organization admin key | Subscription limits unavailable | Organization completions usage, UTC days |
| Anthropic API | Console admin key | Subscription limits unavailable | Organization messages usage, UTC days |
| Other | No credentials | Unavailable | Unavailable; focus timer works |

## Primary sources

1. [Codex app server](https://developers.openai.com/codex/app-server): stdio initialization, account login/read/logout, quota reads and notifications. No model turns are created. Notifications trigger a fresh full read rather than incorrectly merging sparse windows.
2. [Codex credential storage](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs): OS keyring isolation by canonical home. The app selects `keyring`, not `auto`, to disable plaintext fallback.
3. [GitHub billing REST API](https://docs.github.com/en/rest/billing/usage): personal `ai_credit/usage` and `premium_request/usage` endpoints. Identity comes from `/user`. Uses version `2026-03-10`; checks product and units before summing. The API does not provide entitlements. The renderer separately estimates remaining AI credits using a custom allowance or published plan defaults (Pro 1,500; Pro+ 7,000; Max 20,000), and shows the scheduled first-of-month UTC reset from [individual billing documentation](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing). Defaults were checked October 6, 2026 and can change. Previous-month usage never becomes a current-month balance. Organization-paid seats need different reporting APIs and are excluded here.
4. [OpenAI usage API](https://platform.openai.com/docs/api-reference/usage/completions): `/v1/organization/usage/completions`, daily paginated buckets. Input already includes cached input. Organization scope is labeled.
5. [Anthropic usage API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) and [schema](https://platform.claude.com/docs/en/api/beta/organization/usage_report/retrieve_messages): `/v1/organizations/usage_report/messages`. Uncached input, cache read, both cache write durations, and output are disjoint. Console admin credentials do not provide personal Claude subscription quotas.
6. [ClaudeBar Claude integration](https://github.com/tddworks/ClaudeBar/blob/main/docs/providers/claude/README.md): reviewed as inspiration. Its personal quota adapters use CLI probing and OAuth usage interfaces. This app does not scrape terminal UI, impersonate a first-party OAuth client, or import browser cookies; it labels the limitation and supports local reported tokens.
7. [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): DPAPI on Windows, Keychain-backed encryption on macOS; insecure fallback is rejected.

JSONL formats are implementation details, not stable public APIs. Only recognized reported counters are accepted; non-token content is ignored. Local logs do not reliably identify subscriptions, so users must explicitly attribute folders. Repeated events are deduplicated, parsing problems are surfaced, and no prompts are copied into stored state or sent anywhere.

Contract tests use synthetic responses. Authenticated live validation requires an account owner to connect through the app; no credentials are included in tests or source.

Daily usage views keep source units separate: Codex/Claude/API tokens, GitHub AI credits or legacy requests, and local focus minutes. GitHub history uses explicit year/month/day parameters for each of the last 30 UTC dates, with bounded concurrency and caching. It never distributes a monthly total across dates or translates credit totals into tokens. Codex browser sign-in alone supplies quotas, not token history; the owner must link an attributable working sessions folder. Oversized local records are skipped with a visible partial-history warning so a large attachment cannot erase otherwise valid usage.

Automatic working time is separately estimated from local session event timestamps. Only adjacent events within five minutes contribute intervals; intervals are merged across sessions and accounts before local-day totals are computed. A single isolated event adds no duration. This is a proxy for activity, not measured human working time, and is unavailable for billing-only Copilot accounts. Manual focus tracking remains separate.
