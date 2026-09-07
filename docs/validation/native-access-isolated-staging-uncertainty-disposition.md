# Otto — isolated staging versus production recovery readiness

2026-09-07T21:45:11Z. Read the complete current staging packet, SHA256 `0f54ceae472c2aab8df97f435005b58978a1a3c2e5e7a21cea2c93ef6a01366b`, together with the previously fully reviewed exact start-write design `5676c81c7aa40030a65078f37f12ee98caec623712f71c3a85e6754c6c58c723`.

**Yes: a separately authorized, supervised ISOLATED staging session may expose its callbacks after all other applicable conditions are met, without first implementing a production uncertain-marker clearing procedure.** This is a conditional technical disposition, not current exposure permission. Frozen01ea remains HOLD; an accepted repaired exact source and verified fail-closed marker behavior must precede callback exposure.

The staging contract is deliberately stop-on-uncertainty, not recover-and-continue:

- Native evidence must establish marker persistence and denial of all new repository starts across browser handles after ambiguous execution/reset. No expiry, Cancel, signout or malformed-marker fallback may reopen starts. Existing grants/public access must not be falsely reported as revoked or rolled back.
- The supervised operator stops the affected test and all new starts when uncertainty appears, preserves encrypted staging state and redacted evidence, and reports remaining cases UNRUN. No marker clear, blind retry, resource recreation, alternate namespace or new credentials may bypass that state. Any later recovery/reconciliation is separately reviewed and authorized.
- Staging is isolated from production credentials, grants, resources and caches. Exact configured callback/resource/host facts, protected credential provisioning, purpose separation, staging-specific platform log controls, explicit human grants, actual plan/headroom and approved test budget remain prerequisites. The absence of a recovery procedure waives none of these requirements.
- Assign a real supervising operator and explicit stop responsibility. Display truthful unavailable status and explain that Cancel does not recover the global block. Retained resources may remain billable; do not auto-delete them or claim the supervised request budget is a global spend cap.
- A successful bounded session validates only the exercised staging subset. Production availability, incident reconciliation, restore/retention, actual provider/client, performance and release acceptance remain independent gates. A failure ends that session; inability to continue safely is an acceptable staging result, not a reason to weaken tests.

Read-only protected operator discovery of actual host callbacks/authentication method, administrator capability and billing facts does **not** require production recovery readiness, finished implementation or live callback exposure. It remains non-mutating and must not expose credentials. Do not turn production readiness into a blanket discovery halt.

The current packet's source-head and missing-viewport passages are historical relative to the later source repairs/HOLD. Update those exact evidence labels before presenting an executable setup tray; this disposition is not a new architecture approval or a claim those old heads are currently acceptable. No setup resources, credentials, grants, callback routes, helpers or product files were changed by this review.
