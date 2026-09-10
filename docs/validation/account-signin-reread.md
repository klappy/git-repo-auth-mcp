# Preserve an in-progress GitHub sign-in on page re-read

## Reproduced defect

In actual local workerd, the connector continuation → sign-in POST → GitHub
callback succeeds normally. Insert a GET of `/account/signin` between the POST
and callback: the GET previously replaced the pending nonce and caused the
original callback to fail with `callback-transaction`.

The live screenshot has that same reference, but does not establish that an
extra GET happened. The reference also covers callback validation before token
exchange. This repair fixes a demonstrated destructive-GET bug, not a proven
explanation of every live recovery failure.

## Repair boundary

After existing browser identity, revocation, account lease, continuation and
restart checks, reuse only an already-started and unexpired pending transaction
whose browser, generation, current nonce, continuation, restart/unbound snapshot,
expected identity and epoch still match. Return only the existing nonce, browser
handle, expiry and pending marker internally. No state/verifier is exposed.

Re-reading makes no storage writes and does not extend expiry, increment attempt
counters, create a provider transaction, or issue another grant. The page reports
that sign-in is already in progress and does not offer a second submit button.
Expired, replaced, canceled or revoked bindings retain their existing behavior.
The existing bound cancellation form remains available. Browser-cookie restoration
is preserved; this does not extend the pending transaction's expiry.

This narrowly protects only the dispatched, not-yet-consumed transaction. A GET
before the first POST still replaces an unstarted form; its old nonce fails.
A GET after consume but before activation still supersedes the activation lease;
the old proof fails. Tests characterize these unchanged fail-closed boundaries.

## Validation

- Actual workerd: standalone and normal connector callbacks succeed.
- Actual workerd: the extra-GET connector callback now succeeds; replay denies.
- Unit: a re-read preserves exact stored bytes and original expiry/nonce.
- Unit: replacing the continuation prevents the old callback from consuming the
  new pending transaction; the replacement callback still succeeds.
- Existing expiry, cancel, sign-out, identity, generation and replay tests remain.

No live provider request, diagnostic ledger read, configuration change or user
retry is part of these synthetic tests.
