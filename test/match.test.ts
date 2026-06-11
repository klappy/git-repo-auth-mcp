import { describe, expect, it } from "vitest";
import { rankByQuery, stem, tokenize } from "../src/match";

// Mirrors the live DOCS catalog's name+about pairs.
const CATALOG = [
  { name: "tiers.md", about: "tier limits, free bucket, windows, pricing" },
  { name: "quota-transparency.md", about: "response fields, remaining, window_reset_at, cached, agent guidance" },
  { name: "getting-started.md", about: "onboarding, first run, connect, create a sandbox repo, demo" },
  { name: "privacy-policy.md", about: "privacy, data collection, storage, retention, third parties, deletion" },
  { name: "terms-of-service.md", about: "terms, billing, refunds, prorated upgrades, liability, governing law" },
  { name: "prompt-injection-stance.md", about: "security, prompt injection, threat model, read-only default, kill switch" },
];

describe("stem / tokenize (adopted from oddkit)", () => {
  it("stems inflections toward shared roots", () => {
    expect(stem("upgrades")).toBe("upgrade");
    expect(stem("pricing")).toBe("pric");
    // The minimal stemmer leaves near-misses ("injec" vs "inject") — the
    // prefix-tolerant matcher in rankByQuery is what bridges them.
    expect(stem("injection")).toBe("injec");
    expect(stem("injecting")).toBe("inject");
    expect(tokenize("The Pricing of the tiers!")).toEqual(["pric", "tier"]);
  });
});

describe("rankByQuery", () => {
  it("matches inflected queries that substring matching missed", () => {
    // old code: "price".includes? no; q in about? "price" not in "pricing"... actually
    // substring DID match "pricing".includes("price") via about.includes(q) — but the
    // reverse failed: query "prices" never substring-matched about "pricing".
    expect(rankByQuery("prices", CATALOG)[0]?.name).toBe("tiers.md");
    expect(rankByQuery("upgrading", CATALOG)[0]?.name).toBe("terms-of-service.md");
    expect(rankByQuery("how do refunds work", CATALOG)[0]?.name).toBe("terms-of-service.md");
    expect(rankByQuery("injected prompts", CATALOG)[0]?.name).toBe("prompt-injection-stance.md");
    expect(rankByQuery("deleting my data", CATALOG)[0]?.name).toBe("privacy-policy.md");
  });

  it("ranks multi-term overlap above single-term", () => {
    const ranked = rankByQuery("prorated upgrade billing", CATALOG);
    expect(ranked[0]?.name).toBe("terms-of-service.md");
  });

  it("returns empty for stop-word-only or unmatched queries (caller falls back)", () => {
    expect(rankByQuery("the of and", CATALOG)).toEqual([]);
    expect(rankByQuery("zebra astronomy", CATALOG)).toEqual([]);
  });

  it("is stable on ties, preserving catalog order", () => {
    const ranked = rankByQuery("window", CATALOG);
    expect(ranked.map((e) => e.name)).toEqual(["tiers.md", "quota-transparency.md"]);
  });
});
