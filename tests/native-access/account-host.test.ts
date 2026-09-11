import { it, expect } from 'vitest';
import { appendFile } from 'node:fs/promises';
async function receipt(value: unknown) { if (process.env.ACCOUNT_HOST_RECEIPT_PATH) await appendFile(process.env.ACCOUNT_HOST_RECEIPT_PATH, JSON.stringify(value) + '\n'); }
import { AccountHost } from './account-host-harness';
// Explicit runner gate keeps process tests out of the fast default unit battery.
const hostTest = process.env.RUN_ACCOUNT_HOST === '1' ? it : it.skip;
hostTest('real workerd persists encrypted grants and connector sessions, revocation epochs and independent namespaces', async () => {
  const a = await new AccountHost().prepare(), b = await new AccountHost().prepare();
  try {
    await a.start();
    expect((await a.connect()).status).toBe(200); expect((await a.connect(1002)).status).toBe(200);
    const user = await a.user(), opaque = await a.opaque(user);
    expect((await a.call('/connector/session', opaque)).status).toBe(200);
    const firstRead = await a.read(user); expect(firstRead.status).toBe(200); expect(await firstRead.text()).not.toContain('INERT_');
    expect((await a.read(await a.user(1002))).status).toBe(403);
    await a.stop(); expect(await a.plaintextAbsent()).toBe(true); await a.start();
    expect(await (await a.call('/grant/status', user)).json()).toEqual({ generation: 1 });
    expect(await (await a.call('/grant/status', await a.user(1002))).json()).toEqual({ generation: 1 });
    expect((await a.call('/connector/session', opaque)).status).toBe(200);
    // Same subject/object name in an independent on-disk namespace has no grant or opaque token.
    await b.start(); expect((await b.call('/grant/status', await b.user())).status).toBe(403);
    expect((await b.call('/connector/session', opaque)).status).toBe(401);
    expect((await b.connect()).status).toBe(200);
    const disconnected = await a.call('/disconnect', user); expect(await disconnected.json()).toEqual({ generation: 2 });
    await a.stop(); await a.start();
    expect((await a.call('/grant/status', user)).status).toBe(403); expect((await a.call('/connector/session', opaque)).status).toBe(403);
    expect((await a.call('/session/renew', undefined)).status).toBe(403);
    expect((await a.connect(1001, 1)).status).toBe(403);
    expect(await (await a.connect(1001, 2)).json()).toEqual({ connected: true, generation: 3 });
    expect((await a.call('/connector/session', opaque)).status).toBe(403);
    expect((await a.call('/session/renew', user)).status).toBe(403);
    expect((await a.call('/connector/session', await a.opaque(await a.user(1001, 3)))).status).toBe(200);
    expect(await (await b.call('/grant/status', await b.user())).json()).toEqual({ generation: 1 });
    expect((await a.stats()).unexpected).toBe(0); expect((await b.stats()).unexpected).toBe(0);
    await a.stop(); await b.stop(); expect(await a.plaintextAbsent()).toBe(true); expect(await b.plaintextAbsent()).toBe(true);
    await receipt({ case: 'restart-revoke-namespaces', a: a.receipts, b: b.receipts, plaintextAbsent: true });
  } finally { await a.close(); await b.close(); }
}, 180_000);
hostTest('real DO concurrent refresh is atomic, verifies numeric identity, and crash ambiguity denies after restart', async () => {
  const h = await new AccountHost().prepare();
  try {
    await h.start(); expect((await h.connect(1001, 1, 'short')).status).toBe(200);
    const user = await h.user(), results = await Promise.all(Array.from({ length: 6 }, () => h.read(user)));
    expect(results.map(r => r.status)).toEqual(Array(6).fill(403));
    expect((await h.stats()).refresh).toBe(1); expect((await h.stats()).identity).toBe(2);
    expect(await (await h.call('/grant/status', user)).json()).toEqual({ generation: 2 });
    await h.stop(); await h.start();
    expect(await (await h.call('/grant/status', user)).json()).toEqual({ generation: 2 });
    expect((await h.read(await h.user(1001, 2))).status).toBe(200);
    expect(await (await h.call('/disconnect', await h.user(1001, 2))).json()).toEqual({ generation: 3 });
    expect((await h.connect(1001, 3, 'wrong')).status).toBe(200);
    expect((await h.read(await h.user(1001, 4))).status).toBe(403);
    expect((await h.call('/grant/status', await h.user(1001, 4))).status).toBe(403);
    // Recover explicitly from rejected provider identity, then kill the process during a persisted refresh.
    expect((await h.connect(1001, 5, 'crash')).status).toBe(200);
    const pending = h.read(await h.user(1001, 6)).catch(() => undefined);
    let entered = false;
    for (let i = 0; i < 60; i++) { if ((await h.stats()).refresh >= 2) { entered = true; break; } await new Promise(r => setTimeout(r, 50)); }
    expect(entered).toBe(true); await h.stop(true); await pending; await h.start();
    expect((await h.read(await h.user(1001, 6))).status).toBe(403);
    expect((await h.call('/grant/status', await h.user(1001, 6))).status).toBe(403);
    expect((await h.stats()).refresh).toBe(0); // Never reuse an uncertain token pair after crash.
    expect(await (await h.call('/disconnect', await h.user(1001, 6))).json()).toEqual({ generation: 7 });
    expect(await (await h.connect(1001, 7)).json()).toEqual({ connected: true, generation: 8 });
    expect((await h.read(await h.user(1001, 6))).status).toBe(403);
    expect((await h.read(await h.user(1001, 8))).status).toBe(200);
    await h.stop(); expect(await h.plaintextAbsent()).toBe(true);
    await receipt({ case: 'atomic-refresh-crash', events: h.receipts, plaintextAbsent: true });
  } finally { await h.close(); }
}, 180_000);
