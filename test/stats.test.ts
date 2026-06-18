import { describe, it, expect } from "vitest";
import { computeStats, isOperator } from "../src/stats";
import type { Env } from "../src/types";

/** Minimal KV mock: enough of `list` for prefix counting, with pagination. */
function kvWithKeys(names: string[], pageSize = 2): KVNamespace {
  return {
    list: async ({ prefix = "", cursor }: { prefix?: string; cursor?: string }) => {
      const matching = names.filter((n) => n.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const page = matching.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: next >= matching.length,
        cursor: next >= matching.length ? undefined : String(next),
      };
    },
  } as unknown as KVNamespace;
}

function envWith(kv: KVNamespace, extra: Partial<Env> = {}): Env {
  return { OAUTH_KV: kv, ...extra } as Env;
}

describe("computeStats — definitions from operator-observability.md", () => {
  it("counts distinct logins per prefix, across KV pagination", async () => {
    const kv = kvWithKeys([
      "grant:alice:g1",
      "grant:alice:g2", // second grant, same human
      "grant:bob:g1",
      "grant:carol:g1",
      "quota:mint:alice:1700:aa",
      "quota:mint:alice:1701:bb",
      "quota:mint:bob:1700:cc",
      "quota:tier:alice",
      "quota:bucket:bob", // different prefix — must not leak into any count
    ]);
    const stats = await computeStats(envWith(kv));
    expect(stats.connected_users).toBe(3);
    expect(stats.active_users_8d).toBe(2);
    expect(stats.paid_users).toBe(1);
    expect(stats.crude_conversion_ratio).toBeCloseTo(1 / 3, 3);
    // With no exclusion set configured, net == raw and nothing is netted out.
    expect(stats.connected_users_raw).toBe(3);
    expect(stats.active_users_8d_raw).toBe(2);
    expect(stats.paid_users_raw).toBe(1);
    expect(stats.operator_owned_grants).toBe(0);
    expect(stats.definitions).toContain("operator-observability.md");
  });

  it("nets operator-owned grants (operator + TEST_LOGINS) out of headline counts", async () => {
    const kv = kvWithKeys([
      "grant:klappy:g1", // operator — excluded
      "grant:tester:g1", // configured test login — excluded
      "grant:carol:g1", // genuine external adoption
      "quota:mint:klappy:1700:aa",
      "quota:mint:carol:1700:bb",
      "quota:tier:klappy", // operator's own paid sub
    ]);
    const env = envWith(kv, { OPERATOR_LOGIN: "klappy", TEST_LOGINS: "tester" });
    const stats = await computeStats(env);
    // Net headline = external adoption only.
    expect(stats.connected_users).toBe(1); // carol
    expect(stats.active_users_8d).toBe(1); // carol
    expect(stats.paid_users).toBe(0); // only the operator pays so far
    // Raw still visible.
    expect(stats.connected_users_raw).toBe(3);
    expect(stats.paid_users_raw).toBe(1);
    expect(stats.operator_owned_grants).toBe(2);
  });

  it("TEST_LOGINS tolerates whitespace and empty entries", async () => {
    const kv = kvWithKeys(["grant:klappy:g1", "grant:bot:g1", "grant:dave:g1"]);
    const env = envWith(kv, { OPERATOR_LOGIN: "klappy", TEST_LOGINS: " bot , , " });
    const stats = await computeStats(env);
    expect(stats.connected_users).toBe(1); // dave
    expect(stats.operator_owned_grants).toBe(2); // klappy + bot
  });

  it("cross-checks Stripe against RAW paid, so the operator's own sub is not a false discrepancy", async () => {
    // Operator has a paid tier in KV and one active Stripe sub. Net paid = 0,
    // but raw paid = 1 matches Stripe = 1 → no discrepancy.
    const kv = kvWithKeys(["grant:klappy:g1", "quota:tier:klappy"]);
    const env = envWith(kv, {
      OPERATOR_LOGIN: "klappy",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: "sub_1" }], has_more: false }), {
        status: 200,
      })) as typeof fetch;
    try {
      const stats = await computeStats(env);
      expect(stats.paid_users).toBe(0);
      expect(stats.paid_users_raw).toBe(1);
      expect(stats.stripe_active_subscriptions).toBe(1);
      expect(stats.discrepancy).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("reports null ratio with zero connected users, and no Stripe field unbilled", async () => {
    const stats = await computeStats(envWith(kvWithKeys([])));
    expect(stats.connected_users).toBe(0);
    expect(stats.crude_conversion_ratio).toBeNull();
    expect(stats.stripe_active_subscriptions).toBeUndefined();
    expect(stats.discrepancy).toBeUndefined();
  });

  it("returns aggregates only — no logins anywhere in the payload", async () => {
    const stats = await computeStats(
      envWith(kvWithKeys(["grant:secretlogin:g1", "quota:tier:secretlogin"]))
    );
    expect(JSON.stringify(stats)).not.toContain("secretlogin");
  });
});

describe("isOperator — configured, not hardcoded", () => {
  it("matches only the configured login, and no one when unconfigured", () => {
    const env = envWith(kvWithKeys([]), { OPERATOR_LOGIN: "klappy" });
    expect(isOperator(env, "klappy")).toBe(true);
    expect(isOperator(env, "mallory")).toBe(false);
    expect(isOperator(envWith(kvWithKeys([])), "klappy")).toBe(false);
  });
});
