# TICKET — gitauth-v1-user-tokens-spec

**What this is:** Supersede every promise git-repo-auth-mcp makes — governance docs (served
verbatim by the `docs` tool), README, troubleshooting, marketing, the five public pages, the tool
description text, and the GitHub App registration itself — so that the contract says *user access
tokens, App as the ceiling* BEFORE any code changes. Major version: not backwards compatible.
**Why now:** Parent `2026-09-01-gitauth-installation-escalation` ruled shape 🅰 (captain, 2026-09-01).
Two public statements are false today: `public/under-the-hood.html` L378 ("a minted token physically
cannot reach another account's repositories") and README L46 ("excludes Administration" — the
registration grants it). Ship-gate: no second account onboards until v1.0.0 lands.
**Your move:** Cut `dish/2026-09-01-gitauth-v1-user-tokens-spec` in `klappy/git-repo-auth-mcp`
from observed main (`e3e2270` at order time; re-resolve). R14: dated supersession, old text retained
with pointer. Every file below. No `src/` change except the `github_token` description string, and
only its text. Captain tastes every page (allergen: revenue + voice + privacy policy).

Ordered: 2026-09-01 ET (Auggie seat, 4:21 PM ET) · Parent: `rail/2-cooking/2026-09-01-gitauth-installation-escalation`
Plate: klappy / Chris Klapp · Class: docs / policy / release. Risk: HIGH — ALLERGEN (`VERDICT.md`
before plating). Promise: set at fire (R6). Depends: version ruling (1.0.0 vs 2.0.0); security-note wording ruling.

## Recipe — supersession list
| File | Change |
|---|---|
| `CHANGELOG.md` | close `v0.3.0` (what is live); `v1.0.0 — Breaking`: user tokens; picker removed; `permissions` param removed; `repositories[]` → `repository_id`; existing grants force-reconnect. **Security**: installation-binding escalation, found 2026-09-01 by operator, 0 tenants exposed; registration over-grant. |
| `governance/external/privacy-policy.md` | L20/L40 "GitHub tokens — none, ever / never stored" → one encrypted refresh token per user, revocable at github.com; access tokens never stored; retention row added. |
| `governance/external/terms-of-service.md` | installation-token framing → user-token on your own behalf; kill-switch clause gains user revocation; "install only on repos you're comfortable with" stays. |
| `governance/external/identity-and-attribution.md` | `[bot]` sections invert: commits/PRs are the user's; Bugbot/Teams-seat notes re-derived. |
| `governance/external/tiers.md`, `quota-transparency.md` | "read then write = two mints" story retired; one mint per repo; re-price or re-word. |
| `governance/external/getting-started.md`, `prompt-injection-stance.md` | "read first, write by asking" retired; new floor: every token is exactly your reach, one named repo. |
| `README.md`, `docs/troubleshooting.md`, `docs/machine-credential-path.md` | flow rewritten; picker gone; ARS path = the only installation-token caller; L46 corrected to the registration truth. |
| `public/*.html` (5) | copy; token demo (`Issued by …[bot]` → the user); L378 "walls" claim corrected with dated note; v1.0.0-coming banner with v0.3.0-until date. |
| `marketing/knowledge-base.md` | re-derive from new governance (23 installation refs, 13 bot refs) — regenerate, never edit in place. |
| `src/mcp-api.ts` `github_token` description | text only; `permissions` gone, `repository_id` in, "your reach, not the App's". |
| **NEW `app-manifest.json`** | declared registration: Contents RW, Pull requests RW, Metadata R (Workflows/Issues only by named need; Administration never); `expire user tokens: true`; callback `/callback`; setup `/setup`; events `[github_app_authorization]`. |
| **NEW CI drift check** | diff `app-manifest.json` against public `GET /apps/git-repo-auth` on every build; fail on drift. |

## GitHub-side actions (captain seat, UI — no API exists; record each as a journal row when done)
1. Narrow App permissions to the manifest; re-approve reduced set on every installation.
2. Optional features → Expire user authorization tokens: ON.
3. Webhook: subscribe `github_app_authorization` → worker route (code dish).
4. `klappy` installation: `all` → selected repos.
5. Revoke Git-Elsy and Git Covenynt connectors from the client until v1.0.0 (parent §7 items 2–3).

## Declared product
1. Every file above superseded on the dish branch with dated pointers; no promise left that the code cannot keep.
2. `app-manifest.json` + drift check green against the narrowed registration.
3. Version ruling recorded; CHANGELOG security note in the ruled wording.
4. Captain `VERDICT.md` on every captain-voice page.

## Done when
Spec dish plated; site + docs deployed behind the "v1.0.0 coming" banner; `…-v1-user-tokens-code` ordered with `Depends: this ticket plated`.

## Failure Modes — What Breaks When This Spec Dish Writes Code, Edits In Place, or Ships Without Taste
- Any `src/` change beyond the description string.
- A page edited in place without the dated pointer (R14).
- Registration narrowed without the manifest committed first — the gap that created finding 2.
- Privacy-policy sentence changed without captain taste.

## Required Response When Detected
- Stop; revert; this is the docs dish.
- Stop; recut as dated supersession with the old text retained and a pointer (R14).
- Stop; commit the manifest first; do not narrow the registration ahead of the declared file.
- Stop; hold the sentence for captain taste; do not ship the privacy-policy change.
