# 2026-06-10 — Minted Seal Branding (E0010)

Session: favicon/logo for git-repo-auth-mcp, "everywhere" — MCP connector UIs, browser tabs, installed contexts. Shipped as PR #2, branch `brand/minted-seal`. Format: DOLCHEO per `klappy://canon/definitions/dolcheo-vocabulary`.

## Decisions

**[D] The mark is "the minted seal."** Viridian seal ring on paper, ink key, amber strike in the bow. Rationale: no canon governs MCP-server visual identity (searched before designing), so the mark derives from the server's own established landing-page identity — palette `#FAFAF6` paper / `#16201B` ink / `#0E5A4A` viridian / `#D9A441` amber, banknote/security-document language, guilloche rings — and from the product thesis itself: tokens minted on demand that die on their own. Master artwork is `public/favicon.svg`; `favicon.ico` carries 16/32/48 (what connector UIs and tabs fetch); `apple-touch-icon.png` + 192/512 PNGs + `site.webmanifest` cover installed contexts. All static via the Worker's existing `assets` binding — zero code change, so the release-validation gate's code-path concerns don't apply, but the PR still waits for the captain's review.

## Observations

**[O] GitHub REST POST returned 401 with a valid installation token until `Content-Type: application/json` was sent explicitly.** POST `/repos/{owner}/{repo}/pulls` failed twice ("Requires authentication", both `Bearer` and `token` schemes) while GETs with the same token returned 200 with authenticated rate limits (`x-ratelimit-limit: 8100`). Adding the explicit header produced 201 immediately. Why it matters: curl's default for `--data` is `application/x-www-form-urlencoded`, and GitHub reports the malformed-body condition as an auth failure rather than 400/422 — which misdirects debugging toward the token and, in this project specifically, toward suspecting the bridge's minting. The bridge was innocent. Full diagnostic path in `docs/troubleshooting.md`.

**[O] Sibling favicon census (2026-06-10).** oddkit.klappy.dev serves `/favicon.ico` and `/favicon.svg` (embedded PNG mascot); ams, aquifer, and gitauth served none at the time of the census. Recorded because it establishes there is no shared family mark to inherit — each server's identity is its own — and because gitauth's 404s were the gap this session closed.

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
