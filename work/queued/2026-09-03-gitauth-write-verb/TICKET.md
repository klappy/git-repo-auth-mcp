# TICKET — gitauth-write-verb

**What this is:** A server-side write verb on GitAuth — put file(s) on a
branch, move a path, open a draft PR — so any seat that can mint a token can
land a plate, regardless of the harness's network egress.
**Why now:** A fetch-first seat learns which repos it needs from the boarding
read; a Cowork cloud session's GitHub allow list is fixed before the session
starts. Cold boarding and the allow list are in the wrong order by
construction. Three doors died on it (2026-08-31, 2026-09-03 ×2, CoS ledger);
the "fix" each time was remembering checkboxes, which is the rule-in-memory
class. Same day, a session opened with sources attached still returned 403
and an empty attach mount: the binding is not something the seat can verify
until first git touch, and reads via cartographer mask it. The allow list is
not a fix, it is a guess. The write must ride the token, not the sandbox.
**Your move:** Taste the verb's permission shape (mint-scope = write-scope,
no wider) and the audit line format. Nothing else is voice.

Class: entrée. Risk: ALLERGY (credentials path, R4). Owner: Otto.
Promise: 6 h. Priority: P0 — every Cowork seat is read-only until this plates. Depends: none. Meal: none (standalone; cross-link
2026-09-03-lens-framework HANDOFF as the casualty).
driver-seat: run before fire (entrée; receipt `DELTA.md` beside this ticket).

Ingredients: GitAuth service repo + `docs` (identity-and-attribution,
quota-transparency); GitHub REST `contents`, `git/refs`, `git/trees`,
`pulls` (create, draft); R4 (credentials never enter model context — the
verb must accept the seat's minted token or mint its own, never echo it);
R16 write topology (cargo on `dish/<ticket>`; only the expeditor merges
main; rail moves direct to main per R19 / HYGIENE 3); CoS ledger
`claude/2026-08-31-cos-door-ledger.md` §Why not landed; HANDOFF
`rail/meals/2026-09-03-lens-framework/HANDOFF.md` L29–33.

Declared product:
1. GitAuth MCP tool `git_put` — `{repo, branch, base?, files[{path, content|
   from_path, mode}], message, author}`; creates branch from base if absent;
   one commit; returns sha + blob urls. Honors the same permission map as
   `github_token`; a request wider than the installation grant is refused.
2. `git_move` — `{repo, branch, from, to, message}` — rail moves (`git mv`)
   as one commit, direct to the named branch.
3. `pr_open` — `{repo, head, base, title, body, draft: true}`; assigns the
   operator per identity-and-attribution; never requests review.
4. One audit row per call in GitAuth's own log: who, repo, branch, paths,
   sha. Token never logged.
5. `docs`: `write-verbs.md` — contract, scope law, refusal cases.
6. Proof: from a Cowork cloud session with **no** GitHub sources attached,
   a seat lands a journal row on `klappy/kitchen` main and opens a draft PR
   on `klappy/klappy.dev`; both shas in the DEBRIEF.

Done-means:
- A reader can see the proof commit on kitchen main and the draft PR, both
  authored via the verb, from a session whose git egress to GitHub was 403.
- A seat calling `git_put` with a scope wider than the grant observes a
  refusal naming the missing permission.
- A grep of GitAuth logs for the proof call shows the audit row and no token.
- `docs` answers "write verbs" with the contract.

## Failure Modes — What Breaks When the Write Door Is Wider Than the Read
- Verb accepts a repo the installation does not grant → silent 404/403
  swallowed as "landed".
- Token round-trips through the seat's context on the way to the verb.
- Verb merges to main for cargo (bypasses R16 expeditor-only).
## Required Response When Detected
- Refusal is explicit and names the permission; no "landed" without a sha.
- Verb mints server-side; the seat never sees a credential (R4).
- `git_put` to a protected main for non-rail paths is refused; rail paths
  (`rail/**`, `journal/**`) are the only main-direct allowlist.

---
Landed on rail: 2026-09-03 ~19:10 ET by CoS door (mobile), hand-carried from
the Cowork seat that wrote it and could not push. CHECKLIST-RUN.md: the
Cowork seat ran it off-rail; hand-carry owed, or the expeditor re-runs at
fire. Casualties to date: Cowork sessions 2026-08-31, 2026-09-03 ×4 (ledger
`claude/2026-08-31-cos-door-ledger.md`; meal 2026-09-03-lens-framework
HANDOFF). Until this plates: no Cowork dispatch for anything that must land.
