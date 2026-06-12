import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTiersDoc, scopeKey, checkMint, refundMint } from "../src/quota";
import { verifyStripeSignature, paymentLinkFor } from "../src/billing";

const tiersDoc = readFileSync("governance/external/tiers.md", "utf8");

describe("governance is parseable (build-time snapshot must never drift)", () => {
  it("parses the bundled tiers.md and the numbers match the doc's table", () => {
    const p = parseTiersDoc(tiersDoc, "bundled");
    expect(p.freeBucket).toBe(100);
    expect(p.paid.solo).toEqual({ window: 10, weekly: 120 });
    expect(p.paid.pro).toEqual({ window: 60, weekly: 720 });
    expect(p.paid.team).toEqual({ window: 400, weekly: 4800 });
    expect(p.paid.fleet).toEqual({ window: 2000, weekly: 24000 });
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

describe("paymentLinkFor", () => {
  const env = {
    STRIPE_PAYMENT_LINKS: '{"solo":"https://buy.stripe.com/a","pro":"https://buy.stripe.com/b"}',
  } as unknown as import("../src/types").Env;
  it("maps known tiers and rejects unknown or non-https", () => {
    expect(paymentLinkFor(env, "solo")).toBe("https://buy.stripe.com/a");
    expect(paymentLinkFor(env, "fleet")).toBeUndefined();
    const bad = { STRIPE_PAYMENT_LINKS: '{"solo":"javascript:alert(1)"}' } as unknown as import("../src/types").Env;
    expect(paymentLinkFor(bad, "solo")).toBeUndefined();
  });
});

describe("failed mints are free (charge at check, refund on failure)", () => {
  // Minimal KV stub: get/put/list over a Map. The policy cache key is
  // pre-seeded with the real tiers.md so loadPolicy never touches the network.
  function stubEnv(tier?: string) {
    const store = new Map<string, string>();
    store.set("quota:policy:cache", tiersDoc);
    const env = {
      QUOTA_ENFORCE: "true",
      OAUTH_KV: {
        async get(key: string) {
          return store.has(key) ? store.get(key)! : null;
        },
        async put(key: string, value: string) {
          store.set(key, value);
        },
        async delete(key: string) {
          store.delete(key);
        },
        async list({ prefix }: { prefix: string; cursor?: string }) {
          const keys = [...store.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((name) => ({ name }));
          return { keys, list_complete: true, cursor: undefined };
        },
      },
    } as never;
    if (tier) store.set("quota:tier:someone", tier);
    return { env, store };
  }

  it("checkMint charges up front — a second check sees the first one's spend", async () => {
    const { env } = stubEnv("solo");
    const a = await checkMint(env, "someone", "scope-a");
    const b = await checkMint(env, "someone", "scope-b");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok && !a.cached && !b.cached) {
      expect(a.remaining).toBe(9); // solo window 10, charged at check
      expect(b.remaining).toBe(8); // the first charge is visible to the second
    }
  });

  it("refundMint releases a failed paid mint's charge", async () => {
    const { env } = stubEnv("solo");
    const a = await checkMint(env, "someone", "scope-a");
    expect(a.ok).toBe(true);
    if (a.ok && a.charge) await refundMint(env, "someone", a.charge);
    const after = await checkMint(env, "someone", "scope-b");
    expect(after.ok).toBe(true);
    if (after.ok && !after.cached) expect(after.remaining).toBe(9); // back to full minus this check
  });

  it("free bucket is charged at check and restored on refund", async () => {
    const { env, store } = stubEnv();
    const a = await checkMint(env, "someone", "scope-a");
    expect(store.get("quota:bucket:someone")).toBe("99"); // bucket 100, charged at check
    expect(a.ok).toBe(true);
    if (a.ok && a.charge) await refundMint(env, "someone", a.charge);
    expect(store.get("quota:bucket:someone")).toBe("100"); // failed mint refunded
  });

  it("a duplicated refund cannot inflate the free bucket past the doc's grant", async () => {
    const { env, store } = stubEnv();
    const a = await checkMint(env, "someone", "scope-a");
    expect(store.get("quota:bucket:someone")).toBe("99"); // bucket 100, charged
    if (a.ok && a.charge) {
      await refundMint(env, "someone", a.charge);
      await refundMint(env, "someone", a.charge); // retry / duplicate delivery
    }
    expect(store.get("quota:bucket:someone")).toBe("100"); // capped, not 101
  });
});

describe("pages stay in sync with governance (thin sync contract)", () => {
  const indexHtml = readFileSync("public/index.html", "utf8");
  const uthHtml = readFileSync("public/under-the-hood.html", "utf8");

  // Copies of the inline hydrator regexes in public/index.html and
  // public/under-the-hood.html (each carries a pointer comment back here).
  // They are cousins of parseTiersDoc, not the same code — they also parse
  // price — and the pages fail SOFT (catch -> static mirror stands), so
  // without this test a doc reshape that breaks them is invisible.
  const PAGE_ROW_RE = /^\|\s*(Solo|Pro|Team|Fleet)\s*\|\s*\*\*([\d,]+)\*\*\s*\|\s*([\d,]+)\s*\|\s*(\$[\d.]+)\/mo[^|]*\|/gim;
  const PAGE_BUCKET_RE = /bucket of \*\*(\d+) mints? total\*\*/i;

  it("the pages' hydrator regex extracts every tier and the bucket from the doc", () => {
    const re = new RegExp(PAGE_ROW_RE.source, PAGE_ROW_RE.flags);
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(tiersDoc))) found.push(m[1]);
    expect(found.sort()).toEqual(["Fleet", "Pro", "Solo", "Team"]);
    expect(tiersDoc).toMatch(PAGE_BUCKET_RE);
  });

  it("static pricing mirrors on both pages match the doc-derived agent counts", () => {
    const perAgent = /two per agent/i.test(tiersDoc) ? 2 : 1;
    const re = new RegExp(PAGE_ROW_RE.source, PAGE_ROW_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(tiersDoc))) {
      const tier = m[1];
      const agents = (Number(m[2].replace(/,/g, "")) / perAgent).toLocaleString("en-US");
      for (const [name, html] of [
        ["index.html", indexHtml],
        ["under-the-hood.html", uthHtml],
      ] as const) {
        const card = html.match(
          new RegExp('data-tier="' + tier + '"[\\s\\S]*?data-slot="quota">([\\d,]+)<')
        );
        expect(card, `${tier} card with a quota slot in ${name}`).toBeTruthy();
        expect(card![1], `${tier} static mirror in ${name}`).toBe(agents);
      }
    }
    const bucket = tiersDoc.match(PAGE_BUCKET_RE)![1];
    expect(indexHtml, "free bucket mirror in index.html").toContain(
      `data-slot="quota">${bucket} keys`
    );
    expect(uthHtml, "free bucket mirror in under-the-hood.html").toContain(
      `data-slot="quota">${bucket} mints`
    );
  });
});
