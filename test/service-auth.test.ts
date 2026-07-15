import { describe, expect, it } from "vitest";
import { bearerOf, isServiceRequest, pickInstallation, timingSafeEqualStr } from "../src/service-auth";
import type { Env } from "../src/types";

const env = (key?: string) => ({ ARS_SERVICE_KEY: key }) as Env;
const req = (auth?: string) =>
  new Request("https://gitauth.klappy.dev/mcp", {
    headers: auth ? { Authorization: auth } : {},
  });

describe("timingSafeEqualStr", () => {
  it("matches equal strings and rejects unequal ones", () => {
    expect(timingSafeEqualStr("abc123", "abc123")).toBe(true);
    expect(timingSafeEqualStr("abc123", "abc124")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
    expect(timingSafeEqualStr("", "")).toBe(true);
  });
});

describe("bearerOf", () => {
  it("extracts the credential, case-insensitively on the scheme", () => {
    expect(bearerOf("Bearer sekrit")).toBe("sekrit");
    expect(bearerOf("bearer sekrit")).toBe("sekrit");
  });
  it("returns null for absent, malformed, or non-bearer auth", () => {
    expect(bearerOf(null)).toBeNull();
    expect(bearerOf("")).toBeNull();
    expect(bearerOf("Basic dXNlcjpwdw==")).toBeNull();
    expect(bearerOf("Bearer")).toBeNull();
  });
});

describe("isServiceRequest", () => {
  it("is OFF when no key is configured — even if a bearer is presented", () => {
    expect(isServiceRequest(req("Bearer anything"), env())).toBe(false);
    expect(isServiceRequest(req("Bearer anything"), env(""))).toBe(false);
  });
  it("accepts exactly the configured key", () => {
    expect(isServiceRequest(req("Bearer k-123"), env("k-123"))).toBe(true);
  });
  it("rejects wrong keys and missing auth (falls through to OAuth)", () => {
    expect(isServiceRequest(req("Bearer nope"), env("k-123"))).toBe(false);
    expect(isServiceRequest(req(), env("k-123"))).toBe(false);
  });
  it("tolerates whitespace in the stored secret (paste hygiene)", () => {
    expect(isServiceRequest(req("Bearer k-123"), env(" k-123\n"))).toBe(true);
  });
});

describe("pickInstallation", () => {
  const list = [
    { id: 11, account: { login: "covenynt" } },
    { id: 22, account: { login: "klappy" } },
    { id: 33, account: null },
  ];
  it("finds the installation owned by the account, case-insensitively", () => {
    expect(pickInstallation(list, "klappy")?.id).toBe(22);
    expect(pickInstallation(list, "Klappy")?.id).toBe(22);
  });
  it("returns null when no installation matches", () => {
    expect(pickInstallation(list, "someone-else")).toBeNull();
  });
});
