import { afterEach, describe, expect, it, vi } from "vitest";
import { countTokens, tokenFooter, TOKENIZER } from "../src/token-footer";
import { docsResponse } from "../src/docs-response";
import { getDocs } from "../src/docs";
import type { Env } from "../src/types";

const offline = { GOVERNANCE_RAW_BASE: "http://127.0.0.1:9" } as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("token footer", () => {
  it("counts with cl100k_base", () => {
    expect(TOKENIZER).toBe("cl100k_base");
    expect(countTokens("hello world")).toBe(2);
    expect(countTokens("")).toBe(0);
  });

  it("ratio = returned/source, null when source is 0", () => {
    expect(tokenFooter(["hello world hello world"], ["hello world"])).toEqual({
      source: 4, returned: 2, ratio: 0.5, tokenizer: "cl100k_base",
    });
    expect(tokenFooter([], ["x"]).ratio).toBeNull();
  });
});

describe("docs tool footer", () => {
  it("rides in _meta.tokens, not in the content text", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const docs = await getDocs(offline, "tiers");
    const res = docsResponse(docs);
    const t = res._meta.tokens;
    expect(t.tokenizer).toBe("cl100k_base");
    expect(t.source).toBe(docs.reduce((n, d) => n + countTokens(d.text), 0));
    expect(t.returned).toBe(countTokens(res.content[0].text));
    expect(t.ratio).toBe(Math.round((t.returned / t.source) * 10000) / 10000);
    // Docs are served verbatim plus a small header per doc: returned ≥ source, near 1.
    expect(t.returned).toBeGreaterThanOrEqual(t.source);
    expect(t.ratio!).toBeLessThan(1.05);
    expect(res.content[0].text).not.toContain("cl100k_base");
  });

  it("emits one numbers-only telemetry event per call", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = docsResponse(await getDocs(offline, "privacy"));
    expect(log).toHaveBeenCalledTimes(1);
    const ev = JSON.parse(log.mock.calls[0][0] as string);
    expect(ev).toEqual({
      event: "tool_tokens", tool: "docs",
      tokens_source: res._meta.tokens.source, tokens_returned: res._meta.tokens.returned,
      ratio: res._meta.tokens.ratio, tokenizer: "cl100k_base",
    });
    expect(log.mock.calls[0][0]).not.toContain("privacy");
  });
});
