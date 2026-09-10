# Account host locale compatibility repair

Date: 2026-09-10 (America/New_York).
Ticket: klappy/kitchen, `rail/2-cooking/2026-09-07-cartographer-native-access-b3`.
Base: `7934a337c4be2b9b70ec37bd0a102525ef731731`.

## Observation and change

The supervised host request included `ui_locales` alongside the eight supported
OAuth authorization keys. The account route rejected this extra key before
maintained-provider parsing/client lookup. No live OAuth values are reproduced.

The route now validates this optional bounded presentation hint with the runtime
locale parser, then removes it before the maintained OAuth parser and before
rendering or storing authorization intent. It is not an identity or permission
input. Structurally malformed hints still fail closed. The UI remains English.
The README ships the supported input contract alongside the implementation.

## Verification

- Targeted account UI and continuation suite: 12 tests passed.
- TypeScript typecheck passed.
- Full default suite: 305 tests passed, 11 skipped (37 files passed, 2 skipped).
- `git diff --check` passed.
- Synthetic full native flow now uses the actual host key shape, including the
  locale hint; it retains original client state/S256 through identity, separate
  repository consent, connector return and token exchange.
- Negative cases cover malformed/oversized/duplicate locale hints, duplicate
  authorization keys, unknown keys and unchanged authority guards.

These tests are local/synthetic, not a claim of a successful live GitHub flow.
Independent review, CI and Bugbot remain required before integration.

## Scope and reversal

No deployment configuration, activation flag, client, registration ledger,
provider secret, token custody or production branch is changed. Reverting this
source patch restores the previous behavior without altering stored state.
The existing registered host client must be preserved; no registration retry is
part of this fix. Auggie owns integration and Otto owns independent security and
deployment acceptance.

## Lesson

Keep real-host authorization key shapes in the synthetic journey regression.
Strict authority validation must distinguish optional presentation metadata
from the authority-bearing OAuth fields instead of rejecting both alike.
