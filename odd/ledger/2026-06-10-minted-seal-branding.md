# 2026-06-10 — Minted Seal Branding (E0010)

Session: favicon/logo for git-repo-auth-mcp, "everywhere" — MCP connector UIs, browser tabs, installed contexts. Shipped as PR #2, branch `brand/minted-seal`. Format: DOLCHEO per `klappy://canon/definitions/dolcheo-vocabulary`.

## Decisions

**[D] The mark is "the struck coin" (v2), superseding the minted seal (v1) within this same PR.** Captain reviewed both side by side at 16/32/180 and chose v2. What changed and why: v1 spent its pixels on framing (tile border + seal ring) and carried a generic key; v2 inverts it — solid viridian coin fills the canvas, the key is reversed out in paper, and the bow is a dial with an amber hand, putting the product's one distinctive idea (tokens expire on their own) at the center of the mark. Same four site colors. Master is `public/favicon.svg` (v2); full raster set regenerated from it. v1 never shipped to main, so no external supersession concerns.

**[D] Social sharing: OG/Twitter card meta + a 1200×630 share card at `public/og-image.png`.** Card is composed in the site's own banknote language — paper, corner guilloche, certificate hairline frame, the struck coin, Archivo 820-weight headline, Plex Mono body, and a stamp-red "EXPIRES ≤ 1 HOUR" badge. Canonical/og URLs anchor to `https://gitauth.klappy.dev/` (verified live, 200, correct title, this session). Rationale: link unfurls are the first impression for a trust-sensitive tool; the card states the trust claim (expiry) visually before a word is read.

**[D] The minted-seal decision (v1), original rationale preserved for the record:** viridian seal ring on paper, ink key, amber strike — derived from the landing page's palette because no canon governs MCP-server visual identity. Superseded by the struck coin above; the derivation logic (mark from the server's own identity) carries forward unchanged.

## Observations

**[O] GitHub REST POST returned 401 with a valid installation token until `Content-Type: application/json` was sent explicitly.** POST `/repos/{owner}/{repo}/pulls` failed twice ("Requires authentication", both `Bearer` and `token` schemes) while GETs with the same token returned 200 with authenticated rate limits (`x-ratelimit-limit: 8100`). Adding the explicit header produced 201 immediately. Why it matters: curl's default for `--data` is `application/x-www-form-urlencoded`, and GitHub reports the malformed-body condition as an auth failure rather than 400/422 — which misdirects debugging toward the token and, in this project specifically, toward suspecting the bridge's minting. The bridge was innocent. Full diagnostic path in `docs/troubleshooting.md`.

**[O] Sibling favicon census (2026-06-10).** oddkit.klappy.dev serves `/favicon.ico` and `/favicon.svg` (embedded PNG mascot); ams, aquifer, and gitauth served none at the time of the census. Recorded because it establishes there is no shared family mark to inherit — each server's identity is its own — and because gitauth's 404s were the gap this session closed.

**[O] PIL variable-font axes are positional and font-specific: Archivo's order is [Weight, Width], not [Width, Weight].** First share-card render passed `[100, 800]` intending width=100/weight=800 and silently got weight=100 (near-thin headline). No error raised — values clamp to axis ranges. Fix: call `font.get_variation_axes()` first and order accordingly. Caught visually on the hover pass before commit; the second read changed the dive.

**[O] PRs created with minted installation tokens are invisible to the operator's GitHub mobile filters.** The PR author is the app's bot identity (`git-repo-auth[bot]`), so "Created by me" excludes it, and "Involved" stays empty until the operator touches the thread. Observed 2026-06-10 when the captain could not find PR #2 in the app without a direct link. Fix applied (assignee + review request added to PR #2, both 201) and made procedure below.

## Constraints (added)

**[C] Every PR the crew opens with a minted token must assign the operator and request their review at creation time** — two API calls (`POST /issues/{n}/assignees`, `POST /pulls/{n}/requested_reviewers`, requires `pull_requests: write`). This is what makes crew-authored work surface in the operator's "Assigned to me" / "Review requested" filters; bot provenance stays honest in the author field while discoverability goes to the human who must review.

## Learnings

**[L] 401-on-POST with 200-on-GET means suspect the request, not the token.** GitHub reports some malformed-request conditions as 401. Cheap discriminator: `GET /rate_limit` with the token and read `x-ratelimit-limit` — 8100 means an authenticated GitHub App context, 60 means anonymous. If the limit says authenticated, the token is fine and the failing request's headers/body are the problem. Worth knowing in *this* repo above all others, since "the token doesn't work" is exactly the bug report this bridge will attract.

## Constraints

**[C] Brand assets are static-only.** Everything ships through the Worker's `assets` binding from `public/`. No icon-serving logic enters `src/` — keeps the security-sensitive code surface unchanged by branding work.

## Handoffs

**[H] PR #2 awaits the captain's review** — the context break that makes review validation rather than self-review (`klappy://canon/principles/verification-requires-fresh-context`).

## Encodes

**[E]** Artifacts above structured via `oddkit_encode` (governance: knowledge_base) and persisted here per the persist-required contract. Initial encode scored weak (missing rationale); rationale added in this persisted form.

## Open

**[O-open P2] License decision pending.** The landing-page footer says "License decision pending; open an issue if you need clarity." Stays open until the captain decides; affects whether others can lawfully self-host the bridge, which the README actively invites.
