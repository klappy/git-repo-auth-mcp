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
