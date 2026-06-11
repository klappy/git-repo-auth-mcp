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
    expect(stats.definitions).toContain("operator-observability.md");
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
