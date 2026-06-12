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
