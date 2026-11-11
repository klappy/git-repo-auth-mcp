# 🚨 Incident + Handoff — git-repo-auth-mcp binds whole installations off a single shared repo

**Civil date:** Tuesday 2026-09-01 (America/New_York) · **Observed window:** 17:38–19:32 UTC
**Author seat:** Otto (dispatcher) · **Captain:** klappy · **Status:** DRAFT, untasted — not yet on the rail
**Source pinned:** `klappy/git-repo-auth-mcp@e3e22704e6aa9243690e4e0842637a265d089a39` (main, resolved 19:08 UTC)
**Kitchen pinned:** `klappy/kitchen@20b45b9923cf28d57b70d8eadc8e6c4dd5104805`

> 🔔 Everything below is either **observed** (tool result cited), **inferred** (marked), or **assumed** (marked with its test). Nothing is from memory.

---

## 0. Glance layer — read this and you know the incident

| | |
|---|---|
| 🎯 **What** | `/callback` in git-repo-auth-mcp binds an MCP connection to an **entire** GitHub App installation whenever GitHub lists that installation as accessible to the signed-in user. GitHub lists it if the user has explicit permission on **at least one** repo the installation covers. The grant is never narrowed back to what the user actually holds. |
| 🔺 **Effect** | One shared repo → full read **and write** on every repo in the other party's installation, including private repos where GitHub reports the user's permission as `none`. Symmetric in both directions. |
| 🧾 **Proof** | Connector bound as `login: klappy` reads `elsylambert/btservant-tests` (private) — HTTP 200 on a `contents:read`-gated endpoint — while `GET /repos/elsylambert/btservant-tests/collaborators/klappy/permission` returns `none`. |
| 🔦 **Blast radius (observed)** | 7 logins across 7 of klappy's 103 repos can bind klappy's installation. 0 non-operator accounts exist on the service (`admin_stats`). 1 Stripe subscription, klappy's own. |
| ❓ **Load-bearing unknown** | Whether public-read-only qualifies as "accessible." GitHub docs say no (owner / collaborator / org member). **Untested.** If wrong, radius is "any GitHub user." Test: §6. |
| 🩹 **Touched** | `elsylambert/bt-servant-meeting-notes`: branch `probe/2026-09-01-access-check`, draft PR #1, Issue #2 (assigned to her). `main` untouched at `706cb58`. One file added, zero read from `meetings/` or `scripts/`. |
| 🛠️ **Fix shape** | Hard owner-match gate on `/callback` (mirrors existing `setupOutcome()`), **or** narrow the grant to the user's real repo set at bind time. Open seam: §7. |

---

## 1. Timeline (all UTC, from `oddkit_time`)

| Time | Event |
|---|---|
| 17:38 | Session boards. `kitchen@20b45b9`. |
| 17:39 | Captain asks what Git-Elsy sees. `Git-Elsy:github_token` (read) → `account: elsylambert`, `repository_selection: all`, 4 repos. |
| 17:44 | Captain asks what all doors see. Three tokens minted: `klappy` (103 repos, `all`), `covenynt` (3, `all`), `elsylambert` (4, `all`). Write tokens minted on all three — write proven on all three. **Quota counter observed decrementing across all three connectors as one bucket** (76→75→74→74→72→72→72→69). Not yet recognized as a signal. |
| 17:48 | Captain orders a tiny reversible probe on Elsy's private repo. Branch + file + draft PR #1 + Issue #2 created. Commit authored `118073+klappy@users.noreply.github.com`. |
| 17:49 | Otto flags "write reaches Elsy's private repos" as a breadth-of-grant curiosity. **Wrong read.** Cost ~1h. |
| 19:07 | Captain: "this is a huge security breach." Investigation begins. Source read at `e3e2270`: `src/github-auth.ts`, `src/install.ts`, `src/service-auth.ts`, `src/quota.ts`, `src/mcp-api.ts` (grep). |
| 19:10 | Collaborator lists on Elsy's 4 repos: klappy is `write` on `bt-servant-meeting-notes` **only**. |
| 19:11 | Reverse sweep: all 103 klappy repos' collaborators. 7 repos, 7 outside logins. |
| 19:13 | Per-repo proof: klappy's own permission vs connector reach (§4 table). |
| 19:16 | GitHub docs fetched for `GET /user/installations` semantics. |
| 19:17 | `oddkit_preflight` + `oddkit_challenge` run (§8). Challenge: `CHALLENGED`, 7 missing prerequisites, `block_until_addressed: false`. |
| 19:28 | `admin_stats`: `connected_users 0 (raw 1)`, `operator_owned_grants 1`, `stripe_active_subscriptions 1`. |
| 19:32 | This document. |

---

## 2. Mechanism — what the code does (observed at `e3e2270`)

### `src/github-auth.ts` `/callback`
1. Exchanges the OAuth code for a **transient user token**.
2. `GET /user` → `user.login`.
3. `GET /user/installations?per_page=100` **with the user token**. GitHub filters this list.
4. `0` installations → park pending, redirect to App install page.
   `1` → `completeFor(...)` immediately.
   `>1` → picker: *"Signed in as **{login}**. Which installation should this MCP connection mint tokens for?"* → `POST /select`.
5. `completeFor` stores grant props: `{ login: user.login, installationId: inst.id, accountLabel: inst.account.login }`.

**No check anywhere that `inst.account.login === user.login`, and no narrowing of `repositories`.**

### `src/install.ts` `setupOutcome()` — the rule that exists on the *other* path
> bind only if `account.login.toLowerCase() === pendingLogin.toLowerCase()`; else `reconnect`. Comment: *"/setup can never bind an installation the just-authenticated user doesn't personally own."*

Two paths, one rule, enforced in one.

### `src/mcp-api.ts` `github_token`
Mints with `installationId: props.installationId`, `repositories` (caller-supplied, optional), `permissions` (caller-supplied, default `contents:read`). Response `account` = `props.accountLabel`. Quota keyed on `props.login` (`src/quota.ts`: `quota:bucket:{login}`). `admin_stats` gated on `isOperator(env, props.login)`.

### `src/service-auth.ts`
Separate machine path (ARS static key) pinned to `ARS_SERVICE_ACCOUNT` installation. Not involved. Noted because its header explicitly calls current design "single-tenant interim" and owes v2 per-tenant credentials.

### 2b. Root cause in one sentence (captain's framing, 19:36 UTC, paraphrased by Otto — captain has not reviewed this wording)

The connector has two halves: the MCP server (ours) and the GitHub App (GitHub's). We assumed that if the user logged in, GitHub would enforce the ACL naturally — a user would never reach anything they couldn't already reach through their normal GitHub login. That assumption was correct **for user tokens** and wrong **for installation tokens**:

- The user's OAuth login produces a **user access token** — capped to that user's permissions. We use it for two GETs and discard it.
- `github_token` mints an **installation access token** — capped to the *installation*, never to the user. It has no idea who asked.

**We authenticate with the first and authorize with the second, and nothing bridges the two ceilings.** The picker is the only place the user's identity touches the grant, and the picker's list comes from GitHub's "installations this user has *any* explicit access to," not "installations this user *owns*." So whoever installs the App exposes their whole selection — personal or org — to every person holding explicit permission on any one repo inside it.

We built our surface carefully and assumed the other surface was doing the per-user check. It was never designed to. That check is what user tokens are for, and we throw ours away.

---

## 3. Proof that all three connectors are bound as `klappy` (three independent tells)

1. 💳 **One quota bucket** across Git Repo Auth / Git Covenynt / Git-Elsy. Bucket key is `props.login`. Three logins → three buckets. Observed: one.
2. 🔧 **`admin_stats` exposed on all three** connectors. Gated on `isOperator(props.login)`.
3. 📊 **`admin_stats` → `connected_users_raw: 1`** with three live grants. Per-login count.

Therefore: Git-Elsy = `{ login: "klappy", accountLabel: "elsylambert" }`. Elsy never completed OAuth; she only **installed**. Her install did not reach into klappy's account — klappy signed in as himself and the picker offered her installation.

---

## 4. Proof of escalation — klappy's real GitHub permission vs what the connector reaches

Queried 19:13 UTC with a Git-Elsy read token (`contents:read`, `metadata:read`).

| Repo | Visibility | `…/collaborators/klappy/permission` | Connector `GET git/ref/heads/main` | Verdict |
|---|---|---|---|---|
| `elsylambert/bt-servant-meeting-notes` | 🔒 private | **write** | 200 | ✔️ legitimate |
| `elsylambert/btservant-tests` | 🔒 private | **none** | **200** | 🚨 escalation — no GitHub relationship at all |
| `elsylambert/bt-servant-v3-cookbook` | 🌐 public (fork) | read | 200 | ⚠️ read was public; **direct write** is escalation |
| `elsylambert/elsylambert` | 🌐 public | read | 409 (empty repo) | ⚠️ same |

`git/ref` requires `contents:read`; a 200 proves the grant covers file contents, not just metadata. No file bodies were opened in `btservant-tests`; the ref was the minimum that settled it.

---

## 5. Blast radius (observed, not modeled)

### Reverse direction — who can bind **klappy's** installation
Sweep of all 103 repos' collaborators, 19:11 UTC, 0 errors:

| Login | Via repo(s) | Reaches private repos? |
|---|---|---|
| `elsylambert` | `bt-servant-meeting-notes` 🔒, `bt-servant-v3-cookbook` | yes |
| `stevewatters` | `3d-quality-review` 🔒 | yes |
| `rahul-samaddar` | `bible_app_ui`, `offline_bible_app`, `offline_bible_app_ui` | public entry only |
| `joelthe1` | same three | public entry only |
| `udkumar` | `offline_bible_app`, `offline_bible_app_ui` | public entry only |
| `thegillis` | `xsl-filter` | public entry only |
| `jmcwilliam` | `xsl-filter` | public entry only |

What binding gets any of them: all 103 repos, `all` selection, mintable `contents:write` — including `klappy-llc`, `personal-cashflow`, `refinery`, `truthkit-kb`, `kitchen`, `kitchens`, `cartographer`, `oddkit`, four `*-first-brain`, `TataOroChat`, `market-scanner`, `project-red-table`.

### Service population
`admin_stats` 19:28 UTC: 0 non-operator connected users, 0 non-operator paid, 1 Stripe sub (operator). **No third-party tenant has ever connected.** The defect is latent, exercised once, by the owner, against one collaborator.

---

## 6. Assumptions — marked, with tests (per `oddkit_challenge`)

| # | Assumption | Believed because | Test | If false |
|---|---|---|---|---|
| A1 | GitHub surfaces an installation on `/user/installations` **only** for owner / collaborator / org-member; public read does not qualify. | GitHub REST docs (fetched 19:16) say exactly that; Elsy's case fits "collaborator". | `tatacurly` (0 collaborator status on all 103) installs the App on a throwaway repo of hers and connects. Her picker must **not** show `klappy`. | Radius is every GitHub user. Stop-the-world. |
| A2 | Org-member access surfaces org installations the same way. | Docs list it. Not observed here. | Any org where klappy is member-not-owner with the App installed. | Fix #4 (owner-match) would break legitimate org use. |
| A3 | `admin_stats` "raw vs headline" = operator excluded. | Response shape. **Did not read** `governance/internal/operator-observability.md`. | Read the doc. | Tenant count could differ. |
| A4 | `covenynt` is klappy-controlled. | Bound under `login: klappy`; captain called both accounts "mine". | Captain confirms. | Second party exposed. |

---

## 7. Mitigation — the kept list (captain said keep it)

| # | Move | Cost | Buys | Costs / risk |
|---|---|---|---|---|
| 1 | **Tatiana negative test** (A1) | ~10 min | Converts the load-bearing assumption to fact | One throwaway install |
| 2 | **Narrow `klappy` install `all` → selected** | ~2 min, GitHub settings | Shrinks prize from 103 to the handful agents need | Re-select when adding repos |
| 3 | **Revoke the two cross-account connectors** (Git-Elsy, Git Covenynt) from Claude | ~1 min | Stops the owner's seat exercising the defect | Lose Elsy/covenynt reach until fixed |
| 4 | **Hard owner-match gate on `/callback`** — filter picker to `inst.account.login === user.login`, same rule as `setupOutcome()` | hours | Closes it completely | Kills legitimate org installs (A2); breaks any existing cross-account grant on reconnect — would have broken the captain's own three connectors |
| 5 | **Narrow-the-grant** — at bind, resolve user's actual repo access inside the installation (`GET /user/installations/{id}/repositories` with the user token), pin that list into props, cap every mint's `repositories` to it | days | Closes it **and** preserves collaborator/org use | Most code; list goes stale (re-resolve per mint or per reconnect?); DoD needs a failing test first |
| 6 | ~~Disclose to paying tenants~~ | — | — | **Struck**: zero tenants exist |
| 7 | **Message Elsy** — person-to-person; correct Issue #2's framing (she did not consent to anything; the tool was wrong) | ~5 min | Trust | None |
| 8 | **Ship-gate**: no account #2 onboards until 4 or 5 lands | policy | Hard deadline the captain controls | — |

Recommended order (Otto's vote, not a ruling): **7 → 1 → 2 → 3 today; 4 as the ship-now patch; 5 as the real fix behind it; 8 as standing policy.**

---

## 8. Solution space to explore further (for the fresh session)

Beyond 4 vs 5, questions the fresh seat should pressure:

- **Picker honesty.** Even with 5, should the picker *show* an installation the user doesn't own? Show it labeled "(collaborator on N of M repos)" so the user sees the narrowing?
- **Re-resolution cadence.** If 5: does the repo set get re-resolved at every mint (needs a user token — we discard it), at reconnect only, or via a stored refresh token? Storing a user token contradicts "used twice and discarded." Trade-off is the whole design.
- **Per-repo mints as the floor.** `github_token` already accepts `repositories[]`. Could the default flip from "all repos in installation" to "require `repositories[]`, error if omitted"? Cheap, orthogonal, reduces prize even for legitimate grants.
- **GitHub user-to-server tokens instead of installation tokens.** A user access token is inherently capped to the user's permissions. Loses the `[bot]` identity and the App's own permission ceiling; changes attribution story in `identity-and-attribution.md`. Worth a paragraph, probably a no.
- **`/setup` and `/callback` share one function.** `setupOutcome()` already encodes the rule. Whatever ships, both paths must call the same guard — a test that binds a non-owned installation via each path should fail identically.
- **Existing grants.** Any fix must decide what happens to a stored grant that violates the new rule on next `/mcp` call: reject with reconnect prompt, or silently narrow?
- **Threat-model the reverse.** A malicious collaborator today needs only to connect. Post-fix, what's left? (Answer should be: exactly their GitHub permission, nothing more.)
- **Does `service-auth.ts`'s `ARS_SERVICE_ACCOUNT` path have the same gap?** It pins to an installation by owner login — different mechanism, probably fine, but verify.

---

## 9. Precedent from canon (preflight, 592 hits; two that bite)

- `klappy://writings/the-submission-changes-exposure-not-function` — self-audit before the stranger's audit; four failures → standing rules. This document is that pattern.
- `klappy://writings/habits-die-slower-than-tokens` — the product's own promise: scoped keys, dead in an hour. Expiry holds. **Scoping does not.**
- `klappy://canon/definition-of-done` — logic change needs failing test → passing test, decisions referenced.
- Challenge governance: `klappy://odd/challenge/base-prerequisites`, `klappy://odd/challenge/stakes-calibration`.

---

## 10. Seat errors this session (for the debrief, not the blame)

1. **17:49** — Saw write reach Elsy's private repos and filed it as a breadth curiosity. The shared quota counter was visible and unread. Cost ~1h.
2. **19:12** — Said "every customer with a collaborator is exposed." True of code, false of world. `admin_stats` was in the tool list from turn one and unrun until 19:28.
3. **19:13** — Said klappy had "no access" to three of Elsy's repos. Two are public; he always had read and fork-PR. Corrected same turn on captain's push.
4. Pattern: sized from source and inference, skipped the tool that measures reality. Three times. Standing rule candidate: **before stating a blast radius, run the tool that counts.**

---

## 11. Artifacts and their disposition

| Artifact | Where | State | Disposition |
|---|---|---|---|
| Branch `probe/2026-09-01-access-check` | `elsylambert/bt-servant-meeting-notes` | exists, 1 commit `4b1b002` | delete after Elsy answers |
| Draft PR #1 | same | open, draft | close after Elsy answers |
| Issue #2 | same | open, assigned `elsylambert`, cc `klappy` | **amend framing** (§7 item 7) |
| Comment on PR #1 | same | links to #2 | — |
| `.github/ACCESS-PROBE-2026-09-01.md` | same, on branch only | — | goes with branch |
| This document | `/mnt/user-data/outputs/` | untasted draft | needs a rail ticket to become record |

No tokens appear in any artifact. All tokens minted this session expired ≤ 20:13 UTC.

---

## 12. Handoff — the captain's plan, in order (ruled 19:39 UTC)

**Your job:** run these four phases. Do not trust this document; re-observe.

### Phase 1 — Prove the assumptions, size the blast radius
1. Board per SHIM. Clock first.
2. Pin `klappy/git-repo-auth-mcp` at `e3e2270` (or resolve `main`, note drift). Read `src/github-auth.ts` `/callback`, `src/install.ts`, `src/mcp-api.ts` `github_token`, `src/quota.ts`. Confirm §2 or refute it.
3. Re-run §4 with a fresh Git-Elsy read token. Expect `none` + 200 on `btservant-tests`. **Do not open file bodies.**
4. `admin_stats` → confirm §5 population. Read `governance/internal/operator-observability.md` → close A3.
5. **A1 is the gate.** If the Tatiana negative test has run, record it. If not, it is the first thing to ask the captain for. Everything in Phase 2–4 is sized by it.
6. Org case (A2): find or construct one org install where klappy is member-not-owner; observe whether it appears on `/user/installations`.

### Phase 2 — Evaluate the mitigations (§7)
For each of 2, 3, 4, 5, 8: what it closes, what it breaks, what test proves it, what happens to existing grants. Produce the 4-vs-5 seam as a ruling request, not a recommendation.

### Phase 3 — Who else has this bug
Research, not assumption: MCP servers and agent tools that mint GitHub **installation** tokens after a user OAuth login. Is this a known class ("confused deputy via installation token")? Has anyone published the pattern or a fix? Candidates to check first: other MCP GitHub-auth servers in the Anthropic directory; the ARS-style relays in klappy's own fleet (`bee-ai-auth-mcp` — same author, same era, same shape?).

### Phase 4 — Step back: is a GitHub App the right shape?

**Captain authority, 19:45 UTC (brain dump, Otto's transcription — captain has not reviewed this wording):**

> Why work on the App at all? If we can fix this without the GitHub App on the GitHub side, then installing it is overkill. Needing the App is what makes every commit, PR, issue, and comment — mine, Elsy's, the Actions underneath — show up as that one application's name, and that has bothered me from the beginning. What I want is for the *user's* authentication to be what acts: Klappy, Elsy, whoever is logged in, has actions taken on *their* behalf, under *their* name. Everything appearing under the App's name as if the bot did all the work should have been a red flag. We abused the model. The installation model has a real use case for whoever installs it — but that's not the shape we needed.

**What this changes for Phase 4:** the question is no longer "App vs. something else" with the App as default. The default is inverted: **user-identity auth is the target; the App installation is the thing that has to justify itself.** Evaluate:
- User access tokens (`ghu_`): user ∩ app by construction; actions attributed to the user; refresh token storage and 8h expiry are the costs to price.
- What the installation model still buys that a user token cannot: machine callers with no human present (Actions, the ARS `service-auth.ts` path), and a permission ceiling the *app author* controls. Name those as separate needs, not as reasons to keep the current shape.
- Whether a GitHub App can exist *without* installation-token minting at all — OAuth-only, user-token-only — and what the product loses.
The captain's question, verbatim in spirit: *can we get the same impact without this access? Is the GitHub App the right option? Right type, right scope? Is there a way to guarantee nobody with a relation to the org automatically gets everything?*

One lead, found in a single search at 19:39 and **not pursued further by order** — pursue it:
> GitHub docs: a **user access token** (`ghu_`) can only reach resources that *both* the user and the app can reach — installation ∩ user's own permissions. That is the ceiling-carrying token this design lacks. Cost to evaluate: refresh tokens must be stored (contradicts "used twice, discarded"), attribution shifts from `[bot]` to the user (changes `identity-and-attribution.md`), 8h expiry vs 1h. Source: docs.github.com → "Generating a user access token for a GitHub App".

Also on the table: keep installation tokens but require `repositories[]` on every mint; mint installation tokens only against installations the user *owns*; drop the App and use fine-grained PATs the user mints themselves (loses the whole product premise — say why).

### Ground rules
- No code. HYGIENE 12: the output is a ticket amendment with declared seams.
- Do not touch Elsy's repos beyond Phase 1 step 3.
- **Doors:** cartographer for kitchen markdown; contents API (`Accept: application/vnd.github.raw`) for TypeScript; Git Repo Auth / Git-Elsy for tokens — read-only unless the task writes; R4, never in prose or files.

🔔 Faites simple.
