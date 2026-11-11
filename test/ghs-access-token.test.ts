import { describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ WorkerEntrypoint: class {} }));
// The /token wrapper is exercised alone; the MCP and GitHub handlers (agents, cloudflare:*) stay out of node.
vi.mock("../src/mcp-api", () => ({ McpApiHandler: { fetch: vi.fn() } }));
vi.mock("../src/github-auth", () => ({ GitHubAuthHandler: { fetch: vi.fn() } }));
vi.mock("../src/service-auth", () => ({ handleServiceRequest: vi.fn(), isServiceRequest: () => false }));
import { ghsResources, withGhsAccessToken, type GhsDeps } from "../src/index";
import type { Env, GrantProps } from "../src/types";

const GHS_EXPIRY_MARGIN_S = 300; // mirrors src/index.ts
const STAGING = "https://cartographer-staging.klappy.dev/mcp";
const PROD = "https://cartographer.klappy.dev/mcp";
const props: GrantProps = { login: "klappy", installationId: 4017983, accountLabel: "klappy" };
const OPAQUE = "user:grant:opaque-provider-token";
const GHS = "ghs_TESTONLY0000000000000000000000000000";

const env = (v?: string) => ({ GHS_ACCESS_TOKEN_RESOURCES: v }) as Env;
const tokenRequest = (fields: Record<string, string>) =>
  new Request("https://gitauth.klappy.dev/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
const providerBody = (resource: string) => ({
  access_token: OPAQUE,
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "user:grant:refresh-rotated",
  scope: "github_token",
  resource,
});
const forwardFor = (resource: string) =>
  vi.fn(async (r: Request) => {
    await r.formData(); // the provider must still be able to read the body
    return new Response(JSON.stringify(providerBody(resource)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
const deps = (over: Partial<GhsDeps> = {}): GhsDeps & { mint: ReturnType<typeof vi.fn> } => ({
  unwrap: vi.fn(async () => ({ audience: STAGING, grant: { props } })),
  mint: vi.fn(async () => ({ token: GHS, expiresAt: new Date(Date.now() + 3600_000).toISOString() })),
  ...over,
}) as GhsDeps & { mint: ReturnType<typeof vi.fn> };

describe("GHS_ACCESS_TOKEN_RESOURCES /token wrapper", () => {
  it("allowlisted resource: access_token becomes a fresh ghs_, refresh_token untouched, expires_in has margin", async () => {
    const grants: Record<string, string>[] = [
      { grant_type: "authorization_code", code: "c", code_verifier: "v", client_id: "x" },
      { grant_type: "refresh_token", refresh_token: "user:grant:refresh-old", client_id: "x" },
    ];
    for (const grant of grants) {
      const d = deps();
      const res = await withGhsAccessToken(tokenRequest({ ...grant, resource: STAGING }), env(STAGING), forwardFor(STAGING), d);
      const body = (await res.json()) as Record<string, any>;
      expect(res.status).toBe(200);
      expect(body.access_token).toBe(GHS);
      expect(body.refresh_token).toBe("user:grant:refresh-rotated");
      expect(body.resource).toBe(STAGING);
      expect(body.expires_in).toBeGreaterThan(3600 - GHS_EXPIRY_MARGIN_S - 5);
      expect(body.expires_in).toBeLessThanOrEqual(3600 - GHS_EXPIRY_MARGIN_S);
      expect(d.unwrap).toHaveBeenCalledWith(OPAQUE);
      expect(d.mint).toHaveBeenCalledWith(props);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("non-allowlisted resource (incl. prod Cartographer and GitAuth's own /mcp): response unchanged, no mint", async () => {
    for (const resource of [PROD, "https://gitauth.klappy.dev/mcp"]) {
      const d = deps();
      const res = await withGhsAccessToken(
        tokenRequest({ grant_type: "authorization_code", code: "c", resource }),
        env(STAGING),
        forwardFor(resource),
        d
      );
      expect(await res.json()).toEqual(providerBody(resource));
      expect(d.mint).not.toHaveBeenCalled();
    }
  });

  it("unset or empty var: wrapper off, response unchanged, no mint", async () => {
    for (const v of [undefined, "", " , "]) {
      expect(ghsResources(env(v)).size).toBe(0);
      const d = deps();
      const res = await withGhsAccessToken(
        tokenRequest({ grant_type: "authorization_code", code: "c", resource: STAGING }),
        env(v),
        forwardFor(STAGING),
        d
      );
      expect(await res.json()).toEqual(providerBody(STAGING));
      expect(d.mint).not.toHaveBeenCalled();
    }
  });

  it("fails closed without leaking the opaque token when the grant has no installation or the audience differs", async () => {
    for (const unwrap of [
      async () => null,
      async () => ({ audience: STAGING, grant: { props: { ...props, installationId: 0 } } }),
      async () => ({ audience: PROD, grant: { props } }),
    ]) {
      const d = deps({ unwrap: vi.fn(unwrap) as GhsDeps["unwrap"] });
      const res = await withGhsAccessToken(
        tokenRequest({ grant_type: "authorization_code", code: "c", resource: STAGING }),
        env(STAGING),
        forwardFor(STAGING),
        d
      );
      const text = await res.text();
      expect(res.status).toBe(400);
      expect(text).not.toContain(OPAQUE);
      expect(d.mint).not.toHaveBeenCalled();
    }
    const failing = deps({ mint: vi.fn(async () => { throw new Error("quota_exceeded"); }) });
    const res = await withGhsAccessToken(
      tokenRequest({ grant_type: "refresh_token", refresh_token: "r", resource: STAGING }),
      env(STAGING),
      forwardFor(STAGING),
      failing
    );
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain(OPAQUE);
  });

  it("provider errors pass through untouched", async () => {
    const d = deps();
    const err = new Response('{"error":"invalid_grant"}', { status: 400 });
    const res = await withGhsAccessToken(
      tokenRequest({ grant_type: "refresh_token", refresh_token: "r", resource: STAGING }),
      env(STAGING),
      async () => err,
      d
    );
    expect(res).toBe(err);
    expect(d.mint).not.toHaveBeenCalled();
  });
});

// Real @cloudflare/workers-oauth-provider 0.7.2 end to end (only GitHub is faked):
// proves unwrapToken is reachable outside the provider via the exported
// getOAuthApi(options, env) helper and that the token audience is the resource.
import OAuthProvider, { getOAuthApi, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";

class MemoryKV {
  m = new Map<string, string>();
  async get(k: string, o?: { type?: string } | string) {
    const v = this.m.get(k);
    if (v === undefined) return null;
    return (typeof o === "object" ? o.type : o) === "json" ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
  async list(o: { prefix?: string } = {}) {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(o.prefix ?? "")).map((name) => ({ name })), list_complete: true, cursor: "" };
  }
}

async function s256(v: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("with the real provider (0.7.2)", () => {
  it("code and refresh for the allowlisted resource return ghs_; refresh_token rotates as the provider does", async () => {
    const opts: OAuthProviderOptions<Env> = {
      apiRoute: "/mcp",
      apiHandler: { fetch: async () => new Response("api") },
      defaultHandler: { fetch: async () => new Response("default") },
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: ["github_token"],
    };
    const realProvider = new OAuthProvider(opts);
    const e = { OAUTH_KV: new MemoryKV(), GHS_ACCESS_TOKEN_RESOURCES: STAGING } as unknown as Env;
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const helpers = getOAuthApi(opts, e);
    const client = await helpers.createClient({ redirectUris: ["https://claude.ai/cb"], tokenEndpointAuthMethod: "none" });
    const verifier = "v".repeat(64);
    const { redirectTo } = await helpers.completeAuthorization({
      request: { responseType: "code", clientId: client.clientId, redirectUri: "https://claude.ai/cb", scope: ["github_token"], state: "s", codeChallenge: await s256(verifier), codeChallengeMethod: "S256", resource: STAGING },
      userId: "klappy",
      metadata: {},
      scope: ["github_token"],
      props,
    });
    const code = new URL(redirectTo).searchParams.get("code")!;
    const d: GhsDeps = {
      unwrap: (t) => getOAuthApi(opts, e).unwrapToken<GrantProps>(t),
      mint: vi.fn(async () => ({ token: GHS, expiresAt: new Date(Date.now() + 3600_000).toISOString() })),
    };
    const forward = (r: Request) => realProvider.fetch(r, e, ctx);

    const first = await withGhsAccessToken(
      tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.clientId, redirect_uri: "https://claude.ai/cb", resource: STAGING }),
      e, forward, d);
    const a = (await first.json()) as Record<string, any>;
    expect(first.status).toBe(200);
    expect(a.access_token).toBe(GHS);
    expect(a.refresh_token).toMatch(/^klappy:/);

    const second = await withGhsAccessToken(
      tokenRequest({ grant_type: "refresh_token", refresh_token: a.refresh_token, client_id: client.clientId, resource: STAGING }),
      e, forward, d);
    const b = (await second.json()) as Record<string, any>;
    expect(second.status).toBe(200);
    expect(b.access_token).toBe(GHS);
    expect(b.refresh_token).not.toBe(a.refresh_token);
    expect(d.mint).toHaveBeenCalledTimes(2);
    expect(d.mint).toHaveBeenCalledWith(props);
  });
});
