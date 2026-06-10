import { describe, it, expect } from "vitest";
import { requireBearer, timingSafeEqual } from "../src/auth";

const req = (auth?: string) =>
  new Request("https://example.com/mcp", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

describe("timingSafeEqual", () => {
  it("matches equal strings", () => expect(timingSafeEqual("abc", "abc")).toBe(true));
  it("rejects different strings of same length", () => expect(timingSafeEqual("abc", "abd")).toBe(false));
  it("rejects different lengths", () => expect(timingSafeEqual("abc", "abcd")).toBe(false));
});

describe("requireBearer — fail closed", () => {
  it("503 when MCP_AUTH_TOKEN unset", () => {
    expect(requireBearer(req("Bearer x"), {})?.status).toBe(503);
  });
  it("503 when MCP_AUTH_TOKEN trivially short", () => {
    expect(requireBearer(req("Bearer shorty"), { MCP_AUTH_TOKEN: "shorty" })?.status).toBe(503);
  });
  it("401 on missing header", () => {
    expect(requireBearer(req(), { MCP_AUTH_TOKEN: "a-very-long-secret-token" })?.status).toBe(401);
  });
  it("401 on wrong token", () => {
    expect(requireBearer(req("Bearer wrong"), { MCP_AUTH_TOKEN: "a-very-long-secret-token" })?.status).toBe(401);
  });
  it("null (authorized) on correct token", () => {
    expect(requireBearer(req("Bearer a-very-long-secret-token"), { MCP_AUTH_TOKEN: "a-very-long-secret-token" })).toBeNull();
  });
});
