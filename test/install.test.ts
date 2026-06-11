import { describe, expect, it } from "vitest";
import { setupOutcome } from "../src/install";

describe("setupOutcome", () => {
  it("binds when the installation owner is the authenticated login", () => {
    expect(setupOutcome("klappy", { login: "klappy", type: "User" })).toBe("bind");
  });
  it("is case-insensitive, as GitHub logins are", () => {
    expect(setupOutcome("Klappy", { login: "klappy", type: "User" })).toBe("bind");
  });
  it("routes org installs to reconnect (real user-token verification path)", () => {
    expect(setupOutcome("klappy", { login: "some-org", type: "Organization" })).toBe("reconnect");
  });
  it("routes lookup failures to reconnect, never bind", () => {
    expect(setupOutcome("klappy", null)).toBe("reconnect");
  });
});
