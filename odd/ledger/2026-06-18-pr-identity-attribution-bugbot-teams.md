# 2026-06-18 — PR Identity, Attribution, and the Bugbot Account Gate (E0010)

Session debrief for the identity/attribution work (PR #38) and the live Bugbot investigation. Format: DOLCHEO per `klappy://canon/definitions/dolcheo-vocabulary`.

## Decisions

**[D] Identity/attribution solved at the docs layer, not the token layer.** Shipped `governance/external/identity-and-attribution.md` (served by the `docs` tool) teaching agents to attribute commits to the operator via no-reply email and to surface PRs via assignment. No mint-payload change, no user-to-server tokens, no stored credentials — the flagship promise is untouched. The operator declined the optional `login`/`id` payload echo; the agent resolves id via `GET /users/{login}` instead.

**[D] Default PR surfacing = assign (+ optional mention); review-request demoted to opt-in.** A requested review creates an obligation the operator must clear; assignment is a zero-cost pin. The recipe defaults to assignment alone. Verified shape on #39 (assignee-only, no review request).

## Observations

**[O] The 2026-06-11 "bot-authored PRs never trigger Bugbot" finding is plan-conditional, not absolute.** Individual: Bugbot runs only on PRs you author, so a `git-repo-auth[bot]`-authored PR never auto-triggers (reproduced on #38 — silent at open; only the four CI checks present). Teams: Bugbot runs for all contributors regardless of membership — fresh bot-authored PR #39 auto-fired the `Cursor Bugbot` check on open (no comment, no reopen), conclusion `success`. The account type was the gate; Teams removes it. This refines, not contradicts, the June 11 [O].

**[O] Commit attribution (by email) and PR authorship (by token) are independent.** Setting author and committer to `{id}+{login}@users.noreply.github.com` put the operator on the commit using only the installation token (verified on #38); the PR "opened by" stayed the bot regardless. Two mechanisms, two levers.

**[O] PR findability is by participation, not by commit (co)authorship.** Assignee / mention / requested-reviewer feed the operator's filters (and Involved); commit author/co-author trailers credit the graph but never surface a PR in a filter.

**[O] Cursor Cloud Agent (@cursoragent) is not Bugbot.** A human-posted `@cursoragent run bugbot` spawned a Cloud Agent that reviewed the diff and (citing this repo's own June 11 ledger) explained it cannot trigger the Bugbot check. An identical comment posted by the bot was ignored — Cursor filters bot-authored triggers.

## Learnings

**[L] Read the project journal before reopening a settled question — not just the code.** I inspected `src/` but not `odd/ledger/`, then reopened the bot-author gate as a "low-confidence open question" when the June 11 ledger had already settled it as hard evidence. The Cloud Agent caught the regression by citing that ledger. "Inspect before encoding what it lacks" includes the ledger.

**[L] Test beats predict, twice over.** Two confident claims this session were wrong — "author identity was never the wall" (it was, on Individual) and "reopen may be the trigger" (it wasn't; Teams was already active). The cheap isolating test — a fresh disposable PR (#39) — settled it where assertion failed. Disposable live PRs are the instrument.

**[L] Teams weakens the B1 case.** B1 (user-to-server tokens, amending the no-tokens promise) was driven largely by the Bugbot-on-bot-PRs limitation. Teams resolves that without spending the promise. B1 remains the only path to a literal operator-authored PR, but the Bugbot motivation is now off the table — re-weigh before amending the promise.

## Handoffs

**[H] Stale number:** `getting-started.md` says "50 mints" in two places; `tiers.md` (truth source) says 100. Separate focused fix.
**[H] Teams billing watch:** confirm how a `git-repo-auth[bot]` author is seat-counted against the 200-PR/license cap before relying on auto-review at volume.
**[H] B1 re-weigh:** with Teams covering Bugbot, the sole remaining B1 driver is literal PR authorship.
**[H] Probe cleanup:** close PR #39 and delete `test/bugbot-teams-probe` once assignee-only findability is confirmed.
