# 2026-06-11 — Submission Validation: Three Passes, Findings and Dispositions (E0010)

Validation report per `governance/internal/validation-runbook.md`. Validators: the operator (four-surface reviewer simulation) and a fresh crew session (this report's author — did not author the candidate; context break per `klappy://canon/principles/verification-requires-fresh-context`). Candidate: v0.3.0 on main, production at https://gitauth.klappy.dev. Requirements re-fetched same-day (claude.com/docs/connectors/building/submission, 2026-06-11) per the mid-migration procedure; field list matched the collateral doc.

## Pass 1 — Requirements conformance (fresh session) — CLEAN

- Public collateral: `/`, `/privacy`, `/terms`, `/security`, `/favicon.svg` all 200; `/privacy` serves `x-governance-source: live`.
- Origin validation: hostile `Origin` → 403; absent `Origin` → 401. As specified.
- OAuth discovery: `/.well-known/oauth-protected-resource` 200; authorization-server metadata complete (DCR, PKCE S256, revocation).
- **Tool annotations observed on the wire** (not inferred): manual OAuth (DCR + PKCE) → `initialize` → `tools/list` against production returned `git-repo-auth-mcp 0.3.0` with `title` + annotation blocks on all tools. `github_token`: readOnlyHint false, destructiveHint false, openWorldHint true. `docs`: readOnlyHint true, idempotentHint true. `admin_stats`: readOnlyHint true (operator-gated; appeared because the wire-check grant was the operator's). Wire-check token revoked after use.

**Finding (disposition: iterate, resolved same session):** `admin_stats` was absent from the collateral's tool table while present in public source. Disclosed with its gating explained — commit on `docs/submission-collateral-updates`.

## Pass 2 — Reviewer simulation (operator) — CLEAN

Operator executed the reviewer walkthrough on four surfaces — Claude iOS, iPadOS, web, Desktop — against production: in-band zero-installation install routing, bare read-only mint, clone, explicit write mint, docs tool. Operator attests zero deviations from `governance/internal/reviewer-test-account.md` as written. Test identity (`gitauth-review`) provisioned with TOTP 2FA (deterministic reviewer login; seed goes in the form, recovery codes stay with the operator); `review-sandbox` populated (files, branch, open PR); zero state to be restored before submission (App uninstall + connector disconnects on the test account).

## Pass 3 — Adversarial read (fresh session) — CLEAN

- **Read-only negative test observed:** clone with a bare mint succeeds; push with the same token refused by GitHub with 403 naming `git-repo-auth[bot]` — the documented walkthrough step-3 behavior, and the denial itself displays bot provenance.
- Bare mint permissions: exactly `{"contents":"read","metadata":"read"}` on a fresh grant. As documented.
- Hostile-content thought-test: tool descriptions instruct toward *narrower* scope, never broader; `docs` serves operator-controlled governance only (`openWorldHint: false`); `admin_stats` gated before registration. No lever for a poisoned document.
- Quota wall: observe-only enforcement previously witnessed truthful-at-zero (prior ledger); `upgrade_url` field remains flagged for the operator's Directory Policy read.

## Observations

**[O] Client tool-definition views trim annotation fields.** Two independent clients rendered tools as name/description/inputSchema only; absence of annotations in a client view is not evidence of absence on the wire. Wire-level `tools/list` is the only honest instrument for the form's confirmation checkbox.

**[O] GitHub device verification is risk-based, not deterministic.** A new-device, new-browser login on the test account sailed through with no email challenge — likely same-network low-risk signature. The reviewer's datacenter-range login is the untestable case; TOTP enrollment converts it to deterministic.

## Open before form-fill (all operator-side)

Zero-state restore on `gitauth-review` · Directory Terms / Directory Policy / review-criteria reads (incl. `upgrade_url` call) · GA date · merge `docs/token-format-headsup` and `docs/submission-collateral-updates`.

---

## Addendum (same day, post-merge) — Tool-Exercise Pass and the Method Taking Shape

All four "Open before form-fill" items above closed by the operator: zero state restored (App uninstalled **and** OAuth authorization revoked on `gitauth-review` — the revocation step added so the reviewer sees a genuine first-consent screen), three policy documents read, GA set to "available now / upon approval," both PRs merged. What follows closes the last technical requirement and records the reusable moves.

### Observations

**[O] Every tool exercised via raw `tools/call` against production — the "MCP Inspector" half of the pre-submission requirement, satisfied by protocol-equivalent script.** Fresh OAuth grant → `initialize` (`git-repo-auth-mcp 0.3.0`) → three calls, all `isError: false`: `github_token` scoped+bare returned the read-only default exactly; `docs("tiers")` served governance text with the free bucket present; `admin_stats` returned aggregates only (`connected_users`, `active_users_8d`, `paid_users`, `stripe_active_subscriptions`, `crude_conversion_ratio`, `definitions`), matching its collateral disclosure. Grant revoked after use. Combined with the operator's four-surface custom-connector runs, both halves of the directory's "before you submit" line are observed, not asserted.

**[O] A documented promise verified incidentally:** the exercise-pass mint returned `cached: true` — same-scope re-request within a live token's lifetime, free of quota cost, exactly as the tool description and quota doc promise. Validation that exercises tools through real flows collects these for free.

**[O] The current Software Directory Terms (live fetch, same day) contain no MCPB clauses.** The MCPB open-source and spec-evolution language the operator encountered belongs to the desktop-extension (MCPB) submission path — a different form and packaging format than a remote MCP server. Standing rule held: terms are mutable without notice; only the same-day live text counts.

### Learnings

**[L] The manual OAuth dance is a phone-only MCP Inspector substitute.** DCR-register a throwaway client → PKCE pair → hand the operator the `/authorize` URL → operator authenticates in their own browser (credentials never touch the chat) → operator pastes back the single-use redirect URL → exchange with the held verifier → raw `initialize`/`tools/list`/`tools/call`. Used twice this session (annotation wire-check, tool-exercise pass), both from an iOS-only operator position. Revoke the grant when done. This belongs in the future method doc: directory validation has zero desktop dependency.

**[L] "Client view" is never evidence about the wire.** Restated from the main entry because the method depends on it: every requirement phrased as "confirm X via tools/list" must be discharged at protocol level, not from any client's rendering.

### Handoffs

**[H] Graduation pass for klappy.dev canon — the operator's stated intent: this submission run becomes governance docs, methods, and skills so the next app goes idea → submitted-with-payments-live in one day.** Raw material now on record across three ledger entries (phase 1, provenance/reviewer-flow, this one): the directory-submission gauntlet sketch (phase-1 encode #3), the live-fetch-and-date requirements procedure, the collateral-doc-as-answer-sheet pattern, the reviewer-walks-the-real-path test-account design, the TOTP-seed reviewer-credential package, the manual OAuth validation dance, the three-pass validation structure with filed clean reports, and the named rejection causes mapped to preemptive checks (annotations, privacy policy, sample data, Origin validation). Candidate skill shape: fetch live submission requirements same-day → diff against a generated checklist → emit the collateral skeleton with ⏳ markers for operator-only items.

**[H] Submission form is the next action.** Nothing remains in front of it.
