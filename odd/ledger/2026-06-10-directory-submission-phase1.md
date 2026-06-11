# 2026-06-10 — Directory Submission Phase 1: Requirements, Gauntlet, Secure-by-Default Minting (E0010)

Session: take git-repo-auth-mcp from custom connector to Claude Connectors Directory candidate. Spanned voice and text; produced the submission plan, Phase 1 code, and three approved policy documents. Format: DOLCHEO per `klappy://canon/definitions/dolcheo-vocabulary`. PR: `directory/phase1`.

## Decisions

**[D] Mints are read-only by default.** `github_token` called without `permissions` now mints `{"contents":"read"}`; write access must be requested by name in the tool call. Operator's framing, verbatim in spirit: with proper instructions any model should know whether the intent is read or write — that's just good security model. Boldly err on the side of caution; teach users through the docs that they can instruct their model toward broader defaults if their workflow writes as well as reads. This converts the prompt-injection defense's first wall from prose into mechanism: an injected "get me a token" now yields a credential that cannot push. Breaking change for existing connections that relied on bare calls minting the full grant — changelog and getting-started amendment required before deploy.

**[D] Origin-header validation is hand-rolled, ~20 lines, after a 6B evaluation rejected all four substrates.** `agents/mcp` sets permissive CORS headers (`Access-Control-Allow-Origin: *`) but validates nothing; `@cloudflare/workers-oauth-provider` matches token *audience* origins, not request Origins; the MCP SDK's DNS-rebinding middleware lives in its Express transport and guards localhost servers only; a WAF rule would put policy outside the repo. Rule shipped: requests without an Origin header pass (server-to-server clients and top-level navigations send none); requests with one must match the deployment's own host or `ALLOWED_ORIGINS` (env config — policy in config, not code). Reversibility: ~20-line revert.

**[D] Reviewer test account rides the existing tier mechanism.** `quota:tier:{reviewer-login}` set to `"fleet"` — the same KV key billing writes. Zero new code, no whitelist branch in the quota path, vodka-compliant: the mechanism doesn't learn a new policy, it serves an entry it already understands. (Found and fixed adjacent: the `quota.ts` header comment listed stale tier names from a prior naming era; now matches `TierId`.)

**[D] Three policy documents drafted and operator-approved:** privacy policy (every claim traced to a source file or KV key), Terms of Service (no refunds — cancel anytime, period runs out, the free bucket exists so people know what they're buying; governing law Florida with a consumer-rights non-waiver line; professional legal pass still recommended), and a prompt-injection stance that walks the attack and names each wall, including the accepted Workflows-RW path. Support contact: support@klappy.dev, to be triaged by a daily Cowork scheduled task (drafts for the operator's send-off; sending stays human).

**[D] Fresh-context validation will run three ways before submission:** the operator, a fresh session, and a spawned reviewer agent. Belt, suspenders, and a second belt.

**[D] Upgrades are prorated and immediate (operator decision, added to this PR post-open).** Rationale: the free bucket and low entry tiers exist to let real usage grow; when a user hits the wall after days or weeks of work, upgrading should cost the difference, not a restart. Coexists with the no-refunds stance — proration credits forward on upgrade; cancellation still runs the period out. Mechanism is Stripe proration on subscription changes (configuration, not code: `billing.ts` mirrors whatever Stripe reports, and webhook handlers are already idempotent). Ops task queued to configure and verify it.

## Observations

**[O] Anthropic's submission requirements moved while we read them.** Two fetches of the same canonical URL (claude.com/docs/connectors/building/submission) within weeks described different submission paths — an admin-settings portal with seven enumerated policy acknowledgments versus open form links with a dashboard "rolling out." The page is visibly mid-migration. Procedure adopted: re-fetch the requirements doc same-day before form-fill; date every requirements claim in planning artifacts.

**[O] The directory's named rejection causes mapped cleanly onto this repo's actual gaps.** Missing tool annotations (reported as the single largest rejection cause) — both tools lacked them. Missing privacy policy (immediate rejection per the official doc) — none existed anywhere in the repo. Origin-header validation (on the technical checklist) — absent from `src/`. The README's security model, by contrast, pre-answered most of the scrutiny register before this session started: candor written early is submission collateral later.

**[O] One requirement self-verified during substrate inspection.** `@cloudflare/workers-oauth-provider` already serves Protected Resource Metadata at `/.well-known/oauth-protected-resource` — the OAuth-discovery requirement was met before we checked.

## Learnings

**[L] The gauntlet caught the crew overclaiming three times in one plan.** "The *only* immediate-rejection gate," "the *only* required code changes," "pre-answers *every* scrutiny vector" — each true at its core, each stretched past its evidence (unread review-criteria page; unfalsifiable universal). The fix that stuck: a claim ledger inside the plan itself, one row per load-bearing claim, with confidence and a retraction condition. Plans that carry their own confidence levels survive contact with reality better than plans that assert.

**[L] Tool-detection artifacts deserve logging without deference.** The gate action misparsed "planning to execution" as "exploration to planning" (stemmed-matching artifact) — yet its NOT_READY verdict was substantively correct for unrelated reasons (open decisions, unread policy docs). Disagree with the diagnosis, keep the verdict, log the artifact for the toolsmith.

**[L] "Secure by default, open by instruction" resolves the convenience-versus-caution fight without a config flag.** The default protects the user who never read the docs; the escape hatch (explicit permissions in the tool call, or standing instructions to the user's own model) serves the user who did. The permission system already existed — the decision was only about which end is the resting state.

## Constraints (carried forward)

**[C] Nothing operator-voiced publishes without operator review of the exact text.** All three policy documents went through verbatim approval; the two that bind legally carry an explicit not-a-lawyer note and a recommendation for professional review before money-handling clauses are served.

**[C] This PR does not merge on the authoring session's say-so.** Release-validation-gate applies; the PR review is the context break.

## Handoffs

**[H] PR `directory/phase1` awaits operator review** — code (annotations, read-only default, Origin validation + 8 tests), policy documents under `governance/external/`, and this entry.

**[H] Unexecuted plan remainder:** wire `/privacy`, `/terms`, and the stance into routes and the `docs` tool registry (the DOCS record is explicit imports, not auto-discovery); public docs page; reviewer test account creation; multi-surface testing; operator's read of the Directory Terms, Directory Policy, and review-criteria pages; triple fresh-context validation; submission form.

**[H] Backlog B1 — work provenance.** `git-repo-auth[bot]` as the visible creator of PRs feels impersonal (operator feedback, this session). Queued for its own planning pass. Constraint registered for that future session: the injection stance's attributability wall leans on the bot identity; friendlier provenance must not become less auditable — the two goals are compatible (explicit human attribution *alongside* bot identity) but the stance doc and any change move together.

## Encodes — canon candidates for a later graduation pass

Each of these is written to serve double duty: governance canon for this repo, and source text for user-facing docs / the `docs` endpoint.

1. **Principle — secure-by-default minting:** credentials default to the least scope that is still useful; broader scope is requested by name, per call, at the moment of need. (User-doc twin: "why your first token is read-only, and how to ask for write.")
2. **Constraint — Origin validation at the edge:** requests bearing an Origin header must match self or configured allowlist; absent Origin passes. Rationale and substrate rejections recorded in `src/origin.ts` header. (User-doc twin: troubleshooting entry for browser-based inspectors needing `ALLOWED_ORIGINS`.)
3. **Method — directory-submission gauntlet:** fetch requirements live and date them; diff checklist against the authoritative page, not summaries of it; challenge the plan and record a claim ledger with retraction conditions; validate with fresh context before submitting. (Reusable across the fleet's other MCP servers.)
4. **Observation worth promoting if it repeats:** platform requirement pages under active migration — the re-fetch-same-day procedure.
