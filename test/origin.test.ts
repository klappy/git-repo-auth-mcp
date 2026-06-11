import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../src/origin";

const SELF = "https://gitauth.example.dev/mcp";

describe("isOriginAllowed", () => {
  it("passes requests with no Origin header (server-to-server, navigations)", () => {
    expect(isOriginAllowed(null, SELF)).toBe(true);
  });

  it("passes same-origin requests", () => {
    expect(isOriginAllowed("https://gitauth.example.dev", SELF)).toBe(true);
  });

  it("rejects cross-origin requests by default", () => {
    expect(isOriginAllowed("https://evil.example.com", SELF)).toBe(false);
  });

  it("rejects scheme-downgrade even on the same host", () => {
    expect(isOriginAllowed("http://gitauth.example.dev", SELF)).toBe(false);
  });

  it("rejects malformed Origin headers", () => {
    expect(isOriginAllowed("not-a-url", SELF)).toBe(false);
    expect(isOriginAllowed("null", SELF)).toBe(false);
  });

  it("passes origins on the configured allowlist", () => {
    expect(
      isOriginAllowed("https://inspector.example.org", SELF, "https://inspector.example.org")
    ).toBe(true);
  });

  it("handles a multi-entry allowlist with whitespace", () => {
    const list = "https://a.example.com, https://inspector.example.org ,https://b.example.com";
    expect(isOriginAllowed("https://inspector.example.org", SELF, list)).toBe(true);
    expect(isOriginAllowed("https://c.example.com", SELF, list)).toBe(false);
  });

  it("ignores malformed allowlist entries rather than failing open", () => {
    expect(isOriginAllowed("https://evil.example.com", SELF, "garbage,, not-a-url")).toBe(false);
  });
});
