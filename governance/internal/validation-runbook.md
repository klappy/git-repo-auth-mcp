# Fresh-Context Validation Runbook — Directory Submission Candidate

For the three validators (operator, fresh session, spawned agent), per `klappy://canon/principles/verification-requires-fresh-context`. Each runs independently and reports findings with dispositions (accept / iterate / pivot). Do not read the authoring session's transcript before running — the point is eyes that didn't build it.

**Candidate:** v0.3 on main, deployed at https://gitauth.klappy.dev (verify `x-governance-source: live` on /privacy).
**Authority for requirements:** https://claude.com/docs/connectors/building/submission and https://claude.com/docs/connectors/building/review-criteria — **fetch both fresh; the pages are mid-migration and have changed within weeks.** Diff what you read against this runbook; the live page wins.

## Pass 1 — Requirements conformance

1. Tool annotations: connect as a custom connector (fresh connection, not a cached one — Claude caches tool schemas from connect time), list tools, confirm `github_token` and `docs` each carry `title` and `readOnlyHint`/`destructiveHint`.
2. Privacy policy at /privacy: confirm the five required areas (collection, usage & storage, third-party sharing, retention, contact) are each present and accurate against the code's actual behavior — spot-check one claim (e.g. mint-log TTL) against `src/quota.ts`.
3. /terms and /security load, dated, internally consistent (no-refunds + prorated upgrades must not contradict; the security stance's read-only-default claim must match observed mint behavior).
4. OAuth: `/.well-known/oauth-protected-resource` resolves; the connect flow completes from a clean browser profile.
5. Origin validation: `curl -H "Origin: https://evil.example.com" https://gitauth.klappy.dev/mcp` → 403; same request without Origin → not 403 (401/405/protocol response acceptable).

## Pass 2 — Reviewer simulation

Execute `governance/internal/reviewer-test-account.md` literally, as written, against the real test account. Every deviation between the instructions and reality is a finding — reviewers get no benefit of the doubt, so neither do we.

## Pass 3 — Adversarial read

1. Bare mint requests `contents: read` only (GitHub's response adds its automatic `metadata: read` — expect exactly those two, nothing broader). A mint requesting permissions beyond the App grant fails cleanly with an intelligible error.
2. Quota wall: confirm the error shape (and note the `upgrade_url` field — flag if the operator's Directory Policy read marked it).
3. Multi-surface: connector works on Claude.ai web, Claude Desktop, Claude mobile. Record pass/fail per surface for the form's launch-readiness field.
4. Hostile-content thought test: does anything in tool descriptions or docs-tool output instruct an agent in ways a poisoned document could exploit? (Descriptions should inform the model, never command it toward broader scope.)

## Reporting

One findings list per validator: finding → severity → disposition. Iterate-class findings return to a scoped execution pass; pivot-class findings reopen planning. Submission proceeds only when all three reports are in and no open iterate/pivot items remain. File reports to `odd/ledger/` per E0010 — including clean ones; "nothing found" by three independent passes is itself evidence.
