import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTiersDoc, scopeKey } from "../src/quota";
import { verifyStripeSignature } from "../src/billing";

const tiersDoc = readFileSync("governance/external/tiers.md", "utf8");

describe("governance is parseable (build-time snapshot must never drift)", () => {
  it("parses the bundled tiers.md and the numbers match the doc's table", () => {
    const p = parseTiersDoc(tiersDoc, "bundled");
    expect(p.freeBucket).toBe(50);
    expect(p.paid.solo).toEqual({ window: 5, weekly: 60 });
    expect(p.paid.max_5x).toEqual({ window: 25, weekly: 300 });
    expect(p.paid.max_20x).toEqual({ window: 100, weekly: 1200 });
    expect(p.windowMs).toBe(5 * 3_600_000);
  });

  it("fails loud on a doc that lost its table", () => {
    expect(() => parseTiersDoc("# Tiers\nno table here", "live")).toThrow();
  });
});

describe("scopeKey", () => {
  it("is order-insensitive and scope-sensitive", async () => {
    const a = await scopeKey(1, ["x", "y"], { contents: "read" });
    const b = await scopeKey(1, ["y", "x"], { contents: "read" });
    const c = await scopeKey(1, ["y", "x"], { contents: "write" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("stripe webhook signature", () => {
  it("accepts a correctly signed payload and rejects tampering", async () => {
    const secret = "whsec_test";
    const payload = '{"type":"checkout.session.completed"}';
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const header = `t=${t},v1=${v1}`;
    expect(await verifyStripeSignature(payload, header, secret)).toBe(true);
    expect(await verifyStripeSignature(payload + " ", header, secret)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${t - 9999},v1=${v1}`, secret)).toBe(false);
    expect(await verifyStripeSignature(payload, null, secret)).toBe(false);
  });
});
