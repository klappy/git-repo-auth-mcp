# Account sign-in recovery loop

The user observed recovery → sign-in → recovery in iOS. Source inspection found that account documents sent `Referrer-Policy: no-referrer` while the sign-in POST correctly required the exact account origin. The Fetch standard's append-Origin algorithm serializes non-CORS POST Origin as `null` under that policy: https://fetch.spec.whatwg.org/#append-a-request-origin-header . Existing native synthetic request tests injected Origin and concealed this browser mismatch.

This change uses same-origin referrer policy on account documents. It preserves strict Origin/CSRF guards and suppresses cross-origin Referer. Regression tests reject null/foreign Origin before the valid original nonce succeeds. The repository CI browser fixture submits actual forms under old/new policies and records cross-origin referrer and CSP redirect behavior, with every external destination intercepted and only inert fixture values.

The Work browser could not reach the local fixture (`ERR_BLOCKED_BY_CLIENT`). No local browser bypass or live provider attempt was used. CI browser evidence must be read before merge; this document does not claim an observed iOS success or completed host connection. No cookies, credentials, DCR ledger, provider identity, deployment flags or production resources are altered by this source patch.

Local targeted regression: 12 passed. Typecheck passed. Full suite result and remote CI/Bugbot acceptance are reported in the PR/checkpoint. If CSP blocks a legitimate redirected form in CI, repair it with independent review before considering this dish complete.
