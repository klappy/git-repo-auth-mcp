# Independent partial-source review

Reviewed exact isolated commit `4ad8eb419d41315e3043420aeea19019b9a624d3` against accepted `97571d367bc5b8ac5abdf1f04dcaccbaba28c906`, on 2026-09-07 at approximately 20:36–20:38 UTC. Four changed paths only. Accepted design: `f37debefe667e0f87167253275624664a7074088a8aaf8521c1e85226d985ace`.

Disposition: **HOLD**, not final acceptance. Coordinator reports Otto independently reproduced persisted null/empty/zero/false continuation or active-session values being classified as absence (13 PASS / 12 FAIL of 25 cases). This review did not independently execute that matrix. Source inspection confirms truthiness guards in terminal lookup and restart active-session loading. Author is repairing. My passing cases below do not cover or override that defect.

Independent commands in `/workspace/scratch/b1f4e4a310e1/fresh-standalone-4ad8eb`:

- `./node_modules/.bin/vitest run tests/native-access/account-standalone-recovery.test.ts tests/native-access/account-continuation.test.ts`: 16 PASS across two files. This includes native Miniflare rendered restart login/Cancel/provider-pause/replacement/ABA scenarios; synthetic providers only, no live-provider claim.
- `./node_modules/.bin/tsc --noEmit`: exit 0 before reviewer fixture addition.
- `./node_modules/.bin/vitest run tests/native-access/fresh-standalone-review-only.test.ts`: 2 PASS. Reviewer-only actual BrowserSessions methods with transactional in-memory storage, not native proof. Cases: old ordinary callback cannot erase replacement explicit-restart Pending; malformed revision after consumption denies cancellation and activation while preserving ledger (one-use activation proof discarded on failed activation).
- `git diff --check`: exit 0.

SHA-256 exact source evidence:

| Path | SHA-256 |
|---|---|
| account/browser-session.ts | a92f4ad70f43dd7f5c148e57af2be89f6d873e684fe08001e2f285ba85abb38f |
| account/account-routes.ts | db63fa5416df3a934f05a812d933a6954065fe0015275348e9ca4f54a95705cd |
| account/account-ui.ts | debdd052027073f791b45d218723251e6218df05d8315ddf12e5285d7b2d3370 |
| tests/native-access/account-standalone-recovery.test.ts | ded2feac3ae9c9c883e07126968ab4dc632f2b678d5d2327fe3a39c76b8147f8 |
| tests/native-access/fresh-standalone-review-only.test.ts | 801b9dbb477a7ced0889b887ad4e6dda2d953ffb7f4df4b9ed132a9b56b9769b |

Reviewer fixture is isolated and not part of the author's suite or candidate. Final exact frozen successor, complete manifest and corrected receipts still require review. Source remains disabled; no release, live provider, consumer continuation or whole-journey acceptance.
