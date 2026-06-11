# Terms of Service — Git Repo Auth MCP

*Operator-approved 2026-06-10. Serving route and docs-tool registration land in the docs-page task.*

*Effective: [DATE]. By connecting to the hosted Git Repo Auth MCP service, you agree to these terms. If you self-host the code, these terms do not apply to your instance.*

## 1. The service

Git Repo Auth MCP mints short-lived, scoped GitHub App installation tokens on behalf of accounts that have installed our GitHub App. What the service can and cannot reach is enforced by GitHub: tokens are bounded by the App's permission grant, your installation's repository selection, and a one-hour expiry.

## 2. Your responsibilities

- You connect this service to AI agents that act with the tokens it mints. **You are responsible for what your agents do with those tokens**, including commits, pull requests, and workflow changes made under the App's bot identity on your repositories.
- Install the App only on repositories you are comfortable granting your agents access to.
- Do not attempt to circumvent quota enforcement, probe other users' installations, or use the service to access repositories you do not control.

## 3. Tiers, billing, and quotas

- Tier limits and pricing are published at [tiers documentation URL] and served verbatim by the service's `docs` tool. The published document is authoritative; if service behavior and the document disagree, the document wins and the behavior is a bug.
- Paid tiers are billed via Stripe at the cadence stated per tier (Solo: $24 per two years; Pro: $60 per year; Team and Fleet: monthly). You may cancel anytime; access continues to period end.
- **Upgrades are prorated and immediate.** Switch to a higher tier at any time; the unused remainder of what you already paid is credited toward the new tier, so you never pay twice for the same days. Downgrades take effect at the end of the current period.
- **Refunds: none.** Subscriptions are cancel-anytime; access continues to the end of the paid period, and no partial or pro-rated refunds are issued. Try the free tier's 50 mints before paying — it exists so you can know what you're buying.
- The free tier is a one-time bucket of 50 mints with no expiry.

## 4. Availability and support

The service is provided as-is, without an uptime guarantee. We respond to issues in good faith via GitHub issues and email. Security reports are prioritized; see the repository for current contact details.

## 5. The kill switch

Uninstalling the GitHub App from your account immediately ends our ability to mint tokens for it. Outstanding tokens expire within one hour. This control is yours, unilateral, and requires nothing from us.

## 6. Limitation of liability

To the maximum extent permitted by law: the service's operator is not liable for actions taken by your agents using minted tokens, for losses arising from GitHub or Stripe outages, or for indirect or consequential damages. Our total liability is capped at the amount you paid us in the twelve months preceding a claim. The security model — including its honestly documented limits, such as the Workflows-permission escalation path — is published in the repository README; connecting constitutes acceptance of that model.

## 7. Changes and termination

We may update these terms with notice at this URL. We may suspend accounts that violate section 2. You may stop using the service at any time (sections 5 and 3 cover the mechanics).

## 8. Contact

- Email: support@klappy.dev
- Issues: https://github.com/klappy/git-repo-auth-mcp/issues

## 9. Governing law

These terms are governed by the laws of the State of Florida, USA, without regard to conflict-of-law principles. Any dispute not subject to small-claims jurisdiction will be brought in the state or federal courts located in Florida, and you consent to their jurisdiction. Where consumer-protection law in your place of residence grants you rights that cannot be waived by contract, those rights are unaffected by this section.

*[Drafted by an AI, not a lawyer; recommend a professional pass before publishing, given real money changes hands.]*
