# 2026-06-12 — Directory Submission: Submitted. Full-Day Debrief (E0010)

The MCP Directory submission form was completed and submitted (confirmation received; Anthropic notes they cannot promise individual responses). This entry journals the submission day end-to-end — the failures carry the most value. Companion entries: phase-1, provenance/reviewer-flow, validation-pass (+ addendum).

## Decisions

**[D] Company of record: Covenynt Ventures LLC.** The Stripe account bills as Covenynt; the Directory Terms' indemnity should sit on the LLC, not the individual. Consequence: the entity was named in terms (counterparty), privacy (controller), homepage footer, and README the same night — previously no legal entity was named anywhere while card statements said Covenynt.

**[D] Statement descriptors: account prefix + per-product suffix.** A static account descriptor can't serve an umbrella LLC with future products. Set `statement_descriptor: "GITAUTH"` on all four tier products via API; operator set prefix `COVENYNT` in the dashboard. Statements read `COVENYNT* GITAUTH`; future products mint their own suffix.

**[D] Test-account credential design: TOTP seed shared in the form.** Final design after one full reversal (see Learnings): account email stays operator-controlled; TOTP enabled; the setup key + password + username go in the form with a one-line authenticator instruction; recovery codes never leave the operator. Deterministic reviewer login, no inbox dependency.

**[D] Forced-checkbox ranking under a "select at least 3" constraint.** "No data stored beyond session requirements" was checked (defensible: everything persisted is operationally required and TTL'd; the privacy policy says exactly this); "GDPR compliant" was left unchecked (a legal claim requiring an assessment not performed). Rule: when a form forces selection, rank claims by what survives a hostile read against published documents.

**[D] Ownership checkbox: check + disclose.** "I work for the company that owns or controls the API endpoint(s)" is aimed at unofficial wrappers. Our shape: the server's own API is wholly ours; zero GitHub endpoints exposed as tools; brokerage runs through our own registered GitHub App on GitHub's sanctioned third-party platform. Checked, with the structure disclosed verbatim in Additional Information so the reviewer rules with full facts.

**[D] Marketing assets live in the public repo** (`marketing/directory-listing/`), pushed by the bot identity with self-minted tokens. The form's filestore link is the GitHub tree URL. The marketing is a demo.

## Failures → Learnings (the expensive ones)

**[L] E0010-1: Operator-facing instructions are claims and carry the same evidence debt as code.** First officer instructed an email-swap on the test account (set primary to mcp-review@anthropic.com, disable 2FA) without verifying GitHub's mechanics — GitHub requires verification *before* an email can be primary, and the verification link lands in an inbox nobody can read pre-review. The operator executed the 2FA-disable step before the error surfaced; cost: a full TOTP re-enrollment. Rule: platform mechanics get verified before any instruction that moves the operator's hands.

**[L] E0010-2: Numbers are grepped from the enforced document at write time, never recalled.** First officer wrote "50-mint free bucket" into four artifacts (form connection-requirements, form test instructions, promo card 3, knowledge base §6) while `tiers.md` — present verbatim in the knowledge base's own appendix — says **100 mints** (two tokens per agent; Solo = 5 agents/10 tokens). NotebookLM's generated deck got it right by reconciling against the verbatim source; the authored summary lost to the appendix it shipped with. All four artifacts corrected pre-submission.

**[L] E0010-3: Marketing claims about agent behavior are checked against how agents behave, not how the demo was staged.** Card 2 originally implied users ask for tokens and routinely meet 403s. Reality (operator observation): capable models mint the correct scope for the task, sometimes visibly self-correcting mid-thought; the 403 is the floor that greets what *can't* ask properly — a leaked token, an injected instruction. Reframed: "Your agent never hits this wall. The wall is for everyone else." Paired prompts rewritten outcome-first ("Take a look at my repo…"), because nobody asks for a token — that's the product.

**[L] Secrets-in-chat burn rule, applied live.** Recovery codes were pasted into chat in a draft; per standing rule they were treated as compromised and regenerated (one click — recovery codes regenerate without re-enrollment). TOTP seed mechanics learned the hard way: the setup key is a *candidate* until a code confirms it (each page load mints a new candidate); once enrolled it is permanent and shareable — one seed, n authenticators, identical codes.

**[L] GitHub device verification is risk-based, not deterministic** (carried from validation entry; it drove the credential design above).

## Observations

**[O] Google favicon service is the long pole of submission day.** The form requires verifying `https://www.google.com/s2/favicons?domain=<domain>&sz=64` behind a *required* checkbox. A never-crawled subdomain returns the default globe regardless of correct site-side favicons. Resolution chain: declare `<link rel="icon">` tags on the root page (index lacked them; other pages had them) → Search Console domain property → URL Inspection → Request Indexing → converged overnight; faviconV2 (the store) updated before the s2 edge caches. **One-day-pipeline rule: request indexing on the day the domain goes live, not on submission day.**

**[O] The form's structure (6 pages):** company/server details → tools & technical → test-account access → launch readiness & media → (skills) → requirements checklist + Submit. Drafts persist across days. "Never submit passwords through Google Forms" is Google boilerplate; the form itself solicits test credentials.

**[O] Anthropic's directory categories on the public site differ from the form's** (site: "Code"; form: "Development tools"). Tagline house style is short and benefit-first; ours fit unmodified.

**[O] MCPB clauses (open-source requirement, spec evolution) belong to the desktop-extension path, not remote MCP submissions** — verified by same-day live fetch of the Directory Terms, which contained neither.

**[O] admin_stats day-zero truth:** connected=2 (operator + test account), paid=1 (operator's own Solo subscription, Stripe cross-check agrees). External users: zero. The funnel is proven end-to-end with real money; distribution starts now.

## Constraints

**[C] Reviewer test account state at submission:** zero installations, OAuth authorization revoked, sandbox populated (files, branch, open PR), credentials durable >30 days, 100-mint free bucket untouched-enough. Nothing may touch `gitauth-review` until review completes.

**[C] The form remains editable post-submission** ("Edit your response") — corrections route there, not through resubmission.

## Handoffs

**[H] Method doc drafting begins now** — destination: klappy.dev canon (`klappy://canon/methods/` namespace), distilled from the four ledger entries. Draft delivered to operator for placement and review.

**[H] Post-acceptance queue:** listing live → swap directory link into README/site; NotebookLM projections (video, infographic, podcast) regenerate from the **corrected** `marketing/knowledge-base.md`; announce.

**[H] Standing watch items:** GitHub token-format change (tripwires in troubleshooting.md), reviewer outreach via chris@klappy.dev, mint-quota weekly backstop untouched.
