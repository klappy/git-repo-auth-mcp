# TICKET — gitauth-installation-escalation

**What this is:** `git-repo-auth-mcp` binds an MCP connection to an **entire** GitHub App
installation whenever GitHub lists that installation as accessible to the signed-in user.
GitHub lists it if the user holds explicit permission on **one** repo the installation
covers. The grant is never narrowed back. Effect: one shared repo → `contents:write` on
every repo in the other party's installation, including private repos where GitHub reports
the user's permission as `none`. Symmetric. Root cause in one line: **authenticate with a
user token, authorize with an installation token, nothing bridges the two ceilings.**
**Why now:** Observed live 2026-09-01 by the owner's own seat against a collaborator's
private repo (`elsylambert/btservant-tests`, permission `none`, ref read HTTP 200). Seven
outside logins can bind the `klappy` installation (103 repos) today. `admin_stats` shows
zero non-operator tenants — latent, exercised once, by the owner. **Ship-gate: no second
account onboards until this is closed.**
**Your move:** Fresh seat. Four phases, in order, per `HANDOFF.md` §12: (1) prove the
assumptions and size the blast radius — A1 (public-read does not surface an installation)
is the gate, test is Tatiana; (2) evaluate mitigations §7; (3) research who else has this
class of bug; (4) step back — is a GitHub App the right shape at all (user access tokens
are user ∩ installation by construction; lead parked, not pursued). Output is a ticket
amendment with the 4-vs-5 seam declared for captain ruling. **No code.** Do not touch
Elsy's repos beyond re-running the §4 proof (ref read only, no file bodies).

Ordered: 2026-09-01 ET (Otto seat, 3:41 PM ET)
Plate: klappy / Chris Klapp

Class: security / incident + shape review. Risk: HIGH — ALLERGEN (revenue product,
third-party private repo touched, irreversible-if-wrong fix; VERDICT.md required before
plating any code that follows this order). Station: multi-phase; this plate is the
investigation and the ruling request, not the fix. Owner: Otto (dispatcher) for phases
1–3; captain rules phase 4. Promise: set at fire (R6). Depends: none.
Neighbor: `elsylambert/bt-servant-meeting-notes` PR #1 (draft) + Issue #2 — probe
artifacts, disposition owed (close/delete after Elsy answers; amend #2's framing first —
she consented to nothing, the tool was wrong).

Authority (captain, this session, 2026-09-01 ET — read HANDOFF.md, do not gist):
- 3:07 PM: "this is a huge security breach" → investigation ordered.
- 3:17 PM: "run oddkit preflight and challenge … explore mitigation strategies."
- 3:28 PM: "keep that list."
- 3:37 PM: captain's root-cause framing (HANDOFF §2b, Otto's paraphrase, unreviewed).
- 3:39 PM: four-phase plan; "don't you go doing all that, that's to go in the handoff."
- 3:40 PM: "order that ticket."

Ingredients (fetch live; do not paste bodies):
- `klappy/git-repo-auth-mcp` main `e3e22704e6aa9243690e4e0842637a265d089a39` —
  `src/github-auth.ts` (`/callback`, `/select`, `completeFor`), `src/install.ts`
  (`setupOutcome` — the rule that exists on the other path), `src/mcp-api.ts`
  (`github_token` mints on `props.installationId`), `src/quota.ts` (keyed `props.login`),
  `src/service-auth.ts` (calls itself "single-tenant interim").
- `governance/internal/operator-observability.md` in the same repo — closes A3.
- GitHub docs: `GET /user/installations` (explicit permission: owner / collaborator / org
  member); "Generating a user access token for a GitHub App" (user ∩ app).
- Connectors: Git Repo Auth (`klappy`), Git Covenynt (`covenynt`), Git-Elsy
  (`elsylambert`) — all bound `login: klappy`; three independent tells in HANDOFF §3.
- `HANDOFF.md` in this folder — full record, timeline, proof tables, assumptions with
  tests, kept mitigation list, solution space, seat errors.

Declared product:
1. A1–A4 each closed with an observation, or left open with the test named and why it
   didn't run.
2. Blast-radius statement sized by A1's result, not by inference.
3. Mitigation table §7 re-scored: closes / breaks / proving test / fate of existing grants.
4. Phase 3 findings: named prior art or "none found, here's where I looked."
5. Phase 4: the shape question answered as options with costs, user-access-token path
   included; the GitHub App kept or dropped is a captain ruling, not a seat recommendation.
6. Ticket amendment on this folder declaring the seam(s) for ruling. No code on any branch.

Done when: captain has ruled the seam and this folder moves to `2-cooking` with the ruling
recorded — or is 86'd with the reason.

## Failure Modes — What Breaks When This Investigation Writes Code or Treats A1 as Proven
- Code written on any branch — this plate is the investigation and the ruling
  request, not the fix.
- Elsy file bodies opened beyond the §4 ref-read proof.
- Blast radius sized by inference; A1 treated as proven without the Tatiana test.
- GitHub App kept or dropped as a seat recommendation instead of a captain
  ruling.

## Required Response When Detected
- Stop; revert the write; output is a ticket amendment only (HYGIENE 12).
- Stop; do not fetch; remaining proof is ref-read only.
- Leave A1 open; name the test and why it did not run; do not size Phases 2–4
  as if it closed.
- Recut to options with costs; the seam is a ruling request, not a
  recommendation.

---

## Amendment — 2026-09-01, 4:21 PM ET (captain ruling; Otto/Auggie seats, kitchen@16c83cc)

**Phase order inverted by captain ruling.** Phase 4 (shape) ruled first; Phases 1–3 collapse
into it. Phase 1 findings stand (below). Output of this ticket is this amendment plus two new
dishes; no code on any branch.

### Ruling — shape 🅰: GitHub App kept as the ceiling, tokens are user access tokens (`ghu_`)
Captain, verbatim (held for taste — strike or amend at will):
> "None of the above matters if we can take the alternate approach of making the authentication
> be driven by each gh users account and not the app. That Git Repo Auth App identity was so
> confusing from every angle. and raised caution flags. I should have reassessed the approach."
> "Let's explore option A as that looks closer to a happy balance between what is now and
> addresses all issues without becoming B with different risks and broken promises form current app."
> "all the website, policies, documentation has to change before the code can. We need to spec
> this out as a major version change as this is not backwards compatible."

Why 🅰 closes the incident by construction (GitHub docs, fetched 20:01 UTC): a user access token
only has permissions that both the user and the app have, and only reaches resources both can
reach. The bind picker and `permissions` narrowing disappear; GitHub computes the intersection.
Option 🅱 (classic OAuth App, no installation) rejected: no ceiling, coarse `repo` scope,
non-expiring tokens.

### Phase 1 — closed / open (re-observed this session, git-repo-auth-mcp@e3e2270, main unchanged)
- §2 mechanism confirmed (`github-auth.ts` L192–222, L82–100; `install.ts`).
- §4 reproduced: `elsylambert/btservant-tests` klappy permission `none`, connector ref-read 200 (ref only, no bodies).
- §5 population confirmed: `admin_stats` raw 1 / net 0 / operator-owned 1 / Stripe 1.
- A3 CLOSED (`operator-observability.md`: net = raw − OPERATOR_LOGIN − TEST_LOGINS; per-login count).
- A1 OPEN — Tatiana negative test not run; no longer load-bearing under 🅰 (user ∩ app makes public-read irrelevant). Recommended still as the release-validation negative test.
- A2 OPEN — org role unobservable from an installation token (`memberships/klappy` → 403). Moot under 🅰.
- A4 OPEN — covenynt installation covers clearwriter-ai, chief-operating-officer, covenynt-vault; captain to confirm control.

### 🚨 Second finding — the GitHub-side registration IS the ceiling, and it is set to everything
`GET /apps/git-repo-auth` (public, 20:21 UTC): 100+ permissions at `write`, including
`administration`, `organization_administration`, `members`, `secrets`,
`organization_personal_access_tokens`, `workflows`; `events: []`; updated 2026-08-23.
README L46 promises Administration is excluded. Consequences: (1) today the 7 binding logins can
mint `administration:write` on 103 repos; (2) 🅰 provides no ceiling until the registration is
narrowed. The registration has no lineage in git and no API to set it — captain-seat UI action.

### Promise ledger (founding plan klappy://docs/planning/pat-transcendence-github-app → 🅰)
kept: no credential transits chat; expiry replaces rotation; App ceiling (once narrowed); kill
switches (+ user revocation); single-repo scoping via `repository_id`.
changed: relay stores one encrypted `ghr_` per user (privacy-policy L20/L40 "never stored" must be
superseded); attribution moves from `[bot]` to the user (by ruling).
broken: per-mint `permissions` narrowing — user tokens carry App ∩ user, no per-mint subset.
at risk: ≤1h lifetime — `ghu_` lives 8h; recoverable if `DELETE /applications/{client_id}/token`
revokes without killing the `ghr_` (test before promising).

### Seams defaulted (reversible; captain may override)
1. `ghr_` custody: OAuth-provider props (encrypted at rest — verify against workers-oauth-provider README) over KV.
2. Single-use refresh + concurrent mints: cache live `ghu_` for its lifetime; refresh behind a DO mutex (R16 permits DO-as-mutex).
3. Lifetime: test revocation at 1h; keep the promise only if the test passes.
4. `permissions` param: removed, tool description rewritten.

### Rulings still owed
- Version: tag live App-token era as `v0.3.0`; ship user-token as **`v1.0.0`** (seat read) vs `v2.0.0`. `package.json` says 0.1.0, CHANGELOG says 0.3.0-unreleased, zero tags/releases.
- Security note in CHANGELOG: names the collaborator repo, or generic.
- A4 confirmation.

### Dishes cut (HYGIENE 10 — separate dishes, rail never runs backward)
- `rail/1-ordered/2026-09-01-gitauth-v1-user-tokens-spec` — docs/policies/site/registration supersession. ALLERGEN (revenue, captain voice, privacy policy). Parent: this ticket.
- `…-v1-user-tokens-code` — cut only after the spec dish plates. Not yet ordered.

### Untouched, still owed (HANDOFF §11)
Elsy's `bt-servant-meeting-notes` probe branch / draft PR #1 / Issue #2 — amend #2's framing, then close/delete after Elsy answers. Person-to-person message (§7 item 7) is the captain's.
