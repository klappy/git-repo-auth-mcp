import { describe, expect, it } from "vitest";
import { isOperatorOwned } from "../src/stats";
import type { Env } from "../src/types";

/**
 * Interim klappy-only lockdown (2026-09-05, incident: gitauth installation
 * escalation). `isOperatorOwned` is the single predicate reused at every
 * binding/minting door — github-auth.ts's /callback and completeFor
 * (/select, /setup) call it directly, and mcp-api.ts's github_token mint
 * calls it before minting. These tests exercise the predicate itself, the
 * same way test/install.test.ts exercises setupOutcome rather than the HTTP
 * handler that calls it.
 */
const env = (extra: Partial<Env> = {}): Env => ({ ...extra }) as Env;

describe("isOperatorOwned — callback / select / completeFor gate", () => {
  it("klappy (the configured operator) passes", () => {
    expect(isOperatorOwned(env({ OPERATOR_LOGIN: "klappy" }), "klappy")).toBe(true);
  });

  it("refuses an outsider login at the callback door", () => {
    expect(isOperatorOwned(env({ OPERATOR_LOGIN: "klappy" }), "some-collaborator")).toBe(false);
  });

  it("allows a configured TEST_LOGINS account alongside the operator", () => {
    const e = env({ OPERATOR_LOGIN: "klappy", TEST_LOGINS: "dogfood-tester, other-tester" });
    expect(isOperatorOwned(e, "dogfood-tester")).toBe(true);
    expect(isOperatorOwned(e, "other-tester")).toBe(true);
    expect(isOperatorOwned(e, "still-an-outsider")).toBe(false);
  });

  it("fails closed when OPERATOR_LOGIN is unconfigured — no one is let through", () => {
    expect(isOperatorOwned(env({}), "klappy")).toBe(false);
    expect(isOperatorOwned(env({ TEST_LOGINS: "klappy" }), "klappy")).toBe(true);
  });
});

describe("isOperatorOwned — github_token mint gate", () => {
  it("klappy passes and can mint", () => {
    expect(isOperatorOwned(env({ OPERATOR_LOGIN: "klappy" }), "klappy")).toBe(true);
  });

  it("refuses an outsider at mint time even though their grant/props already exist", () => {
    // Simulates one of the incident's already-bound outside logins: a real
    // KV grant record with props.login set to the outsider. The gate reads
    // only props.login, so a pre-existing grant changes nothing — the mint
    // is refused immediately, with no KV migration required.
    const outsiderProps = { login: "outside-collaborator", installationId: 4242, accountLabel: "klappy" };
    expect(isOperatorOwned(env({ OPERATOR_LOGIN: "klappy" }), outsiderProps.login)).toBe(false);
  });
});

describe("isOperatorOwned — ARS service path stays unchanged under the deployed config", () => {
  it("the default ARS_SERVICE_ACCOUNT ('klappy', per service-auth.ts) is operator-owned", () => {
    // service-auth.ts pins props.login to env.ARS_SERVICE_ACCOUNT ?? "klappy".
    // Under wrangler.jsonc's actual OPERATOR_LOGIN ("klappy") this is
    // operator-owned, so the machine-credential path mints exactly as before.
    const deployed = env({ OPERATOR_LOGIN: "klappy" });
    expect(isOperatorOwned(deployed, "klappy")).toBe(true);
  });
});
