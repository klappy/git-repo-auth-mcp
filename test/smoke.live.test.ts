/**
 * Live smoke battery — asserts the unauthenticated surface of a deployed
 * worker. Runs against whatever SMOKE_BASE_URL points at:
 *   - CI (PRs): the auto-deployed branch preview
 *   - live-check (weekly): production
 *
 * Deliberately excluded: token minting. A real mint requires the OAuth
 * dance plus a GitHub App installation; mocking it would test the mock,
 * not GitHub. Unit tests cover the key/state logic; the weekly live check
 * plus daily real use cover the rest.
 *
 * Self-skips when SMOKE_BASE_URL is unset so `npm test` stays green
 * locally and in the unit-test CI job.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");

describe.runIf(!!BASE)(`smoke vs ${BASE ?? "(unset)"}`, () => {
  const url = (p: string) => `${BASE}${p}`;

  it("GET /healthz returns 200", async () => {
    const res = await fetch(url("/healthz"));
    expect(res.status).toBe(200);
  });

  it("GET / serves the homepage", async () => {
    const res = await fetch(url("/"));
    expect(res.status).toBe(200);
  });

  it("unauthenticated POST /mcp returns 401 with RFC 9728 WWW-Authenticate", async () => {
    const res = await fetch(url("/mcp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);

    const www = res.headers.get("www-authenticate") ?? "";
    expect(www).toContain("Bearer");
    expect(www).toContain("resource_metadata=");
    expect(www).toContain("invalid_token");

    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_token");
  });

  it("OAuth authorization-server metadata is well-formed and same-origin", async () => {
    const res = await fetch(url("/.well-known/oauth-authorization-server"));
    expect(res.status).toBe(200);

    const meta = (await res.json()) as Record<string, unknown>;
    for (const field of [
      "issuer",
      "authorization_endpoint",
      "token_endpoint",
      "registration_endpoint",
    ]) {
      const value = meta[field];
      expect(typeof value, `${field} should be a string`).toBe("string");
      // workers-oauth-provider derives endpoints from request origin,
      // so this holds on previews and prod alike.
      expect(value as string, `${field} should be same-origin`).toMatch(
        new RegExp(`^${BASE}`)
      );
    }
    expect(meta.scopes_supported).toContain("github_token");
    expect(meta.response_types_supported).toContain("code");
  });

  it("OAuth protected-resource metadata exists", async () => {
    const res = await fetch(url("/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
  });

  it("GET /authorize without params fails cleanly (400, no 5xx)", async () => {
    const res = await fetch(url("/authorize"), { redirect: "manual" });
    expect(res.status).toBe(400);
  });

  it("GET /register is rejected (405 — registration is POST-only)", async () => {
    const res = await fetch(url("/register"));
    expect(res.status).toBe(405);
  });

  it("POST /register accepts a dynamic client registration", async () => {
    const res = await fetch(url("/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "ci-smoke",
        redirect_uris: ["https://example.com/callback"],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id?: string };
    expect(typeof body.client_id).toBe("string");
  });
});
