import { describe, it, expect } from "vitest";
import { encodeState, decodeState } from "../src/state";

describe("state round-trip", () => {
  it("encodes and decodes an object losslessly", () => {
    const obj = { responseType: "code", clientId: "abc-123", redirectUri: "https://x/cb", scope: ["github_token"], state: "s≈π" };
    expect(decodeState(encodeState(obj))).toEqual(obj);
  });
  it("is url-safe (no + / =)", () => {
    const s = encodeState({ a: "?".repeat(100) });
    expect(/[+/=]/.test(s)).toBe(false);
  });
  it("throws on garbage", () => {
    expect(() => decodeState("!!!not-state!!!")).toThrow();
  });
});

import { generateKeyPairSync } from "node:crypto";
import { normalizePrivateKey } from "../src/keys";

describe("normalizePrivateKey", () => {
  it("converts PKCS#1 to PKCS#8", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const out = normalizePrivateKey(privateKey);
    expect(out).toContain("BEGIN PRIVATE KEY");
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
  });
  it("passes PKCS#8 through untouched", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    expect(normalizePrivateKey(privateKey).trim()).toBe(privateKey.trim());
  });
});
