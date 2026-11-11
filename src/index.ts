/**
 * Git Repo Auth MCP v0.2 — the bridge model.
 *
 * One deployment, many users: "Connect GitHub" binds each MCP grant to the
 * GitHub App installation that user controls. Tokens are minted per
 * installation; GitHub enforces the walls between accounts.
 *
 * Borrowed substrate:
 *   - OAuth 2.1 for MCP clients: `@cloudflare/workers-oauth-provider`
 *     (dynamic client registration, PKCE, hashed grants in OAUTH_KV)
 *   - MCP transport/envelope:    `agents` + `@modelcontextprotocol/sdk`
 *   - Token minting/cache:       `@octokit/auth-app`
 *
 * No GitHub tokens are ever stored. The only state is the provider's own
 * hashed OAuth grants and a 10-minute pending record during installation
 * selection.
 */

import OAuthProvider, { getOAuthApi, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { createAppAuth, type InstallationAccessTokenAuthentication } from "@octokit/auth-app";
import { handleServiceRequest, isServiceRequest } from "./service-auth";
import { GitHubAuthHandler } from "./github-auth";
import { McpApiHandler } from "./mcp-api";
import { isOriginAllowed } from "./origin";
import { normalizePrivateKey } from "./keys";
import { checkMint, recordLiveToken, refundMint, scopeKey } from "./quota";
import { emitMeterEvent } from "./billing";
import type { Env, GrantProps } from "./types";

const providerOptions: OAuthProviderOptions<Env> = {
  apiRoute: "/mcp",
  apiHandler: McpApiHandler,
  defaultHandler: GitHubAuthHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["github_token"],
};
const provider = new OAuthProvider(providerOptions);

// ---- ghs_ access tokens for allowlisted resources (GHS_ACCESS_TOKEN_RESOURCES) ----
// Named exports of this entry module must be functions or handlers (workerd rejects
// a number export at startup), so only the two functions below are exported, for tests.
// A resource server that reads GitHub itself (Cartographer's GitAuth carrier)
// cannot use the provider's opaque token. For a `resource` named exactly in the
// allowlist, POST /token (authorization_code and refresh_token alike) returns a
// fresh read-only installation token as `access_token`. The provider's grant,
// refresh_token and rotation are untouched. Unset/empty var = wrapper off.

/** Read-only, fixed: the resource reads repositories and nothing else. */
const GHS_PERMISSIONS = { contents: "read", metadata: "read" } as const;
/** Report expiry this much early so clients refresh before GitHub rejects. */
const GHS_EXPIRY_MARGIN_S = 300;

export function ghsResources(env: Pick<Env, "GHS_ACCESS_TOKEN_RESOURCES">): Set<string> {
  return new Set((env.GHS_ACCESS_TOKEN_RESOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export interface GhsDeps {
  unwrap(token: string): Promise<{ audience?: string | string[]; grant: { props: GrantProps } } | null>;
  mint(props: GrantProps): Promise<{ token: string; expiresAt: string }>;
}

const tokenError = (status: number, error: string, description: string) =>
  new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function withGhsAccessToken(
  request: Request,
  env: Env,
  forward: (r: Request) => Promise<Response>,
  deps: GhsDeps
): Promise<Response> {
  const allow = ghsResources(env);
  if (allow.size === 0 || request.method !== "POST" || new URL(request.url).pathname !== "/token") {
    return forward(request);
  }
  const form = await request.clone().formData().catch(() => null);
  const asked = form?.getAll("resource") ?? [];
  const resource = asked.length === 1 && typeof asked[0] === "string" ? asked[0] : "";
  if (!allow.has(resource)) return forward(request);

  const res = await forward(request);
  if (res.status !== 200) return res;
  const body = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  const opaque = typeof body?.access_token === "string" ? body.access_token : "";
  const summary = opaque ? await deps.unwrap(opaque) : null;
  const audience = summary ? [summary.audience ?? []].flat() : [];
  const props = summary?.grant.props;
  // Fail closed: never hand an allowlisted resource the opaque token. The
  // provider keeps the previous refresh token valid, so a retry can recover.
  if (!body || !props?.installationId || !audience.includes(resource)) {
    return tokenError(400, "invalid_grant", "Grant is not bound to a GitHub App installation for this resource.");
  }
  let minted: { token: string; expiresAt: string };
  try {
    minted = await deps.mint(props);
  } catch {
    return tokenError(503, "temporarily_unavailable", "GitHub installation token could not be minted.");
  }
  const expiresIn = Math.floor((Date.parse(minted.expiresAt) - Date.now()) / 1000) - GHS_EXPIRY_MARGIN_S;
  if (!(expiresIn > 0)) {
    return tokenError(503, "temporarily_unavailable", "GitHub installation token expires too soon.");
  }
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ...body, access_token: minted.token, expires_in: expiresIn }), {
    status: 200,
    headers,
  });
}

/** Same signer, library call and quota bracket as the github_token tool (src/mcp-api.ts). */
let ghsAppAuth: ReturnType<typeof createAppAuth> | undefined;

function liveGhsDeps(env: Env, ctx: ExecutionContext): GhsDeps {
  return {
    unwrap: (token) => getOAuthApi(providerOptions, env).unwrapToken<GrantProps>(token),
    async mint(props) {
      const scope = await scopeKey(props.installationId, undefined, { ...GHS_PERMISSIONS });
      const decision = await checkMint(env, props.login, scope);
      if (!decision.ok) throw new Error("quota_exceeded");
      ghsAppAuth ??= createAppAuth({
        appId: env.GH_APP_ID,
        privateKey: normalizePrivateKey(env.GH_APP_PRIVATE_KEY),
      });
      let result: InstallationAccessTokenAuthentication;
      try {
        result = (await ghsAppAuth({
          type: "installation",
          installationId: props.installationId,
          permissions: { ...GHS_PERMISSIONS },
          refresh: true, // each /token call is a refresh: always a fresh ghs_
        })) as InstallationAccessTokenAuthentication;
      } catch (err) {
        if (decision.charge) ctx.waitUntil(refundMint(env, props.login, decision.charge));
        throw err;
      }
      if (!decision.cached) {
        ctx.waitUntil(recordLiveToken(env, props.login, scope, result.expiresAt));
        ctx.waitUntil(emitMeterEvent(env, props.login));
      }
      return { token: result.token, expiresAt: result.expiresAt };
    },
  };
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    // Origin-header validation (Connectors Directory requirement; see src/origin.ts).
    // Scoped to the gated /mcp API — the same prefix match the provider uses for
    // apiRoute — so public routes (OAuth discovery metadata, /authorize, webhooks)
    // stay reachable from cross-origin browsers.
    // OPTIONS preflights pass through — the actual request that follows is judged.
    if (
      request.method !== "OPTIONS" &&
      new URL(request.url).pathname.startsWith("/mcp") &&
      !isOriginAllowed(request.headers.get("Origin"), request.url, env.ALLOWED_ORIGINS)
    ) {
      return new Response("Forbidden: cross-origin request rejected", { status: 403 });
    }
    // Machine-credential path (v1-interim, captain ruling 2026-07-14): a
    // single static service key lets the ARS worker reach /mcp without an
    // OAuth grant, pinned to the ARS_SERVICE_ACCOUNT installation. Unset key
    // = path off; wrong key = falls through to the provider's normal 401.
    if (new URL(request.url).pathname.startsWith("/mcp") && isServiceRequest(request, env)) {
      return handleServiceRequest(request, env, ctx);
    }
    if (ghsResources(env).size > 0 && new URL(request.url).pathname === "/token") {
      return withGhsAccessToken(request, env, (r) => provider.fetch(r, env, ctx), liveGhsDeps(env, ctx));
    }
    return provider.fetch(request, env, ctx);
  },
};
