# 2026-06-11 — Provenance Meets Tooling, and the Reviewer Walks the Real Path (E0010)

Addendum to `2026-06-10-directory-submission-phase1.md`, covering the merge night and the morning's design correction. Format: DOLCHEO per `klappy://canon/definitions/dolcheo-vocabulary`.

## Decisions

**[D] B1 (work provenance) promoted from backlog to next planning session.** The operator, after the Bugbot failure below: the limitation makes him not want to use his own service until crew can create PRs as him. The creator's hesitation is the user's hesitation — product-shaping, not polish. Session scope sketched: user-attribution minting via GitHub App user access tokens, refresh token inside the already-encrypted per-grant props, `attribution: "user" | "bot"` parameter. The session's real work is amending the flagship promise — "no GitHub tokens stored, ever" would become "no repository tokens stored; one encrypted refresh credential per grant, revocable by you" — and the privacy policy, README security model, and injection-stance wall #4 move together with it. Gauntlet before any code.

**[D] Interim provenance convention: crew pushes branches, operator opens PRs.** Holds until B1 ships. Two clicks per PR; PR authorship matches the human whose behalf the work is on, and author-keyed tooling functions.

**[D] Reviewer test-account design superseded (operator): the reviewer walks the real first-run path.** The original design pre-installed the GitHub App and pre-armed a `fleet` tier in KV. Both removed: the connect flow already routes a zero-installation user to install in-band — that routing IS the designed onboarding — and the free tier's 50-mint bucket IS the designed first-run experience, ample for a review. The review now validates real onboarding, demos quota transparency live, and requires near-zero setup. `quota:bucket:{login}` reset documented as recovery lever only.

## Observations

**[O] Cursor Bugbot on Individual plans author-matches the PR creator; bot-authored PRs never trigger it.** PRs #10/#11 (created via installation token, author `git-repo-auth[bot]`) had to be closed and recreated by the operator (#12/#13) to get a review run. Hard evidence that provenance breaks tooling, not just aesthetics. Filed against B1.

**[O] Anthropic's connector layer caches tool schemas from connect time.** Post-deploy, the live worker served v0.3 (verified: policy pages 200 with `x-governance-source: live`; bare mint returned `{"contents":"read","metadata":"read"}` in production) while the established connection still showed v0.2 tool descriptions. A reconnect refreshes. Baked into the validation runbook so the reviewer simulation connects fresh.

**[O] Observe-only quota enforcement behaved exactly as designed at the wall.** With the rolling window's accounting at 0 remaining and `QUOTA_ENFORCE="false"`, a mint succeeded while the response reported the exhausted window truthfully. Accounting shipped and observed before enforcement — the feature flag earned its keep on its first real wall.

**[O] The comparison target moved after examination, twice in one night.** (1) Anthropic's submission page changed between two reads weeks apart (admin-portal language → open form links). (2) "Phase 2's files are disjoint from main" was true when stated and false by merge time — the operator had merged the monetization work into the same `github-auth.ts` block. Same failure shape as the prior session's stale-comment find: freshness of the comparison is part of the claim. Candidate procedure if it repeats: re-verify any "X doesn't conflict with Y" claim at the moment of action, not the moment of analysis.

**[O] Bugbot's autofix and the crew's fix raced on the same branch.** Both implemented whitespace-anchored autolinking of bare URLs; the autofix version (merged) lacks trailing-punctuation trimming (`https://example.org.` hyperlinks the period). Cosmetic; optional follow-up.

## Learnings

**[L] Constraints the product already absorbed are features, not obstacles to design around.** The zero-installation routing and the free bucket were both built as the answer to "how does a stranger start" — the test-account design that pre-arranged around them was solving solved problems and hiding the product's best evidence from the people grading it.

**[L] Expiry-as-rotation reads as a failure the first time it fires.** A push failed mid-session with an auth error; the cause was the minted token hitting its one-hour wall — the security model working. Worth a troubleshooting-doc line so operators recognize the signature: sudden 401 on a previously working token ≈ check `expires_at` before suspecting the bridge.

## Handoffs

**[H] Pending small fix:** Bugbot autolink trailing-punctuation trim (above).
**[H] B1 planning session** — fresh session; carry this entry and the plan's B1 section in.
**[H] Operator-side remainder:** Directory Terms/Policy/review-criteria reads, test account per `governance/internal/reviewer-test-account.md`, surface testing, support-email routine, Stripe proration config; then triple validation per `governance/internal/validation-runbook.md`, then the form.
