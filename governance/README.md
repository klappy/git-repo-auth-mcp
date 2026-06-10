# Governance

Policy for this server lives here, not in code. The worker is a thin broker — mint, count, gate, proxy docs — and fetches everything that smells like *policy* (tier numbers, quota rules, user-facing copy) from these documents at runtime. Changing the pricing model is a doc edit, not a deploy. This is vodka architecture (`klappy://canon/principles/vodka-architecture`) and prompt-over-code (`klappy://canon/principles/prompt-over-code`) applied to a paid product.

## The split

- **`external/`** — User-facing. Served verbatim by the `docs(query)` tool (per P0006/P0004 conventions). These documents teach both the human and their model how the system works: tiers, quotas, transparency fields, onboarding. **`external/tiers.md` is the single runtime source of tier numbers.** Nothing in `external/` is secret; full transparency on pricing mechanics is a deliberate product decision.
- **`internal/`** — Operator-facing. Decision records, rationale, billing architecture. Not served by the docs tool. Nothing here is sensitive in the security sense (no keys, no secrets — those live in worker secrets only); it is internal because it is *about* the product rather than *for* the user.

## The rule

If a number or a sentence governs what a user experiences, it lives in `external/`. If code contains a tier number, that is a vodka violation and a bug.
