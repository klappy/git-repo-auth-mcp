# Signed, request-local provider refresh evidence

Source-only follow-up to PR78. Account base: 7f02ca4c5c4b4fb601ccd9c22cd0f57bef623c1b;
consumer base: 6c9c3470acaeaab76b04123f8a6cafbf72c5e6bb.

The renewal assertion signs `provider_refreshed`, computed by comparing the
credential operation's returned generation to the previously authorized generation.
This establishes that this renewal observed a successful custody rotation, rather
than inferring refresh from elapsed time or eventual read success. Existing final
current-generation checks still precede assertion disclosure.

The consumer verifies the optional boolean through its existing JOSE verification.
Unsigned exchange metadata is ignored; missing claims mean false for compatibility;
malformed signed claims deny. A request-local boolean OR preserves a refresh
observed on an earlier exchange. The successful private JSON tool response includes
`access_evidence: { provider_refreshed: boolean }` only after custody.finish succeeds.
False means no refresh was observed by this request, including a missing claim
from an older account server; it is not proof that no refresh occurred elsewhere.
Public, anonymous and error responses omit it. Nothing is written to KV, logs,
telemetry or manifests. No IDs, generations, counters, provider data, new endpoints,
retries or forced refresh are exposed.

Validation: account renewal suite 10 tests passed; both TypeScript checks passed.
Consumer real-signature/auth-context tests passed, including unsigned/malformed
claims, request isolation, OR, and wrong principal denial. Actual read_repo_file
handler tests passed including final-check-before-projection and public/anonymous/
error omission; revoked/rotated final checks emit no evidence.

This draft is not deployment authority or live refresh proof. Exposure requires
independent review and the separately accepted staging release sequence.
