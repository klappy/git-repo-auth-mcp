# Refresh provider custody before issuing a read assertion

Scope: B3, source baseline `7f83339599c682efb678c0258aee49308ba5083e`.

The account previously signed its current grant generation in `/session/renew`
without examining provider credential expiry. The following `/read` could rotate
that credential, increment its generation, and correctly deny the now-stale
assertion. The next normal connector exchange then signed the new generation.
This is a deterministic source mechanism consistent with the reported first
private denial followed by success after an idle interval. It does not establish
that provider rotation caused that specific live observation.

Renewal now validates the existing consent lineage, obtains/refreshes custody for
that authorized generation, and signs the returned generation. Both assertions
are verified before grant selection or provider contact. The post-sign current
check and all read-generation checks remain intact. There is no denial retry,
new diagnostic surface, configuration change, or telemetry change.

Synthetic Worker/DO tests cover first-read success following expired custody,
rejection of the old assertion, wrong principal/subject/service, revoked grants,
old consent after reconnect, provider failure, revocation during refresh and
signing, and concurrent renewal during refresh. Concurrent renewal remains
fail-closed while custody is refreshing; this does not promise universal
first-call success under all races.

Validation: 376 tests passed, 11 explicitly skipped; TypeScript passed. The
10 new cases plus existing refresh and Worker-flow tests passed (17 total).
Existing repository blobs were compared to the exact Git tree; only
`account/broker.ts` differs. This is a source cook, not live refresh proof.
