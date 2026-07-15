/**
 * Machine-credential path for /mcp — v1-interim, captain-ruled 2026-07-14
 * (board item ars-gitauth-mint-credential, option 1: static service key,
 * ARS_CAPABILITY_KEY pattern).
 *
 * The OAuth face stays the front door for humans. This path exists for ONE
 * machine caller — the ARS worker's edge-side mint client — presenting a
 * static Bearer (ARS_SERVICE_KEY, constant-time compared) instead of an
 * OAuth access token. The grant it impersonates is pinned to a single
 * installation: the one owned by ARS_SERVICE_ACCOUNT (default "klappy"),
 * resolved live against GitHub's /app/installations and cached per isolate.
 *
 * EXPLICITLY single-tenant interim: this key is never a pattern tenants
 * share. v2 multitenancy owes per-tenant credentials (tenant-bound
 * installations, keys encrypted in the tenant DO) per
 * klappy://ars/policy/ars-v2-multitenancy-policy §13.
 *
 * No key configured = the path does not exist (OAuth-only, exactly today's
 * behavior). Wrong key = falls through to the OAuth provider, which rejects
 * it as an invalid token — no oracle distinguishing "path off" from "bad key".
 */

import { createAppAuth } from "@octokit/auth-app";
import { normalizePrivateKey } from "./keys";
import type { Env, GrantProps } from "./types";

/** Constant-time string equality (XOR fold; length mismatch short-circuits,
 *  which leaks only length — acceptable for a 43-char random key). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Extract the Bearer credential, or null. Exported for tests. */
export function bearerOf(authorizationHeader: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((authorizationHeader ?? "").trim());
  return m ? m[1] : null;
}

/** True iff the request presents the configured service key. */
export function isServiceRequest(request: Request, env: Env): boolean {
  const key = (env.ARS_SERVICE_KEY ?? "").trim();
  if (!key) return false;
  const bearer = bearerOf(request.headers.get("Authorization"));
  return bearer !== null && timingSafeEqualStr(bearer, key);
}

interface InstallationRecord {
  id: number;
  account?: { login?: string } | null;
}

/** Pick the installation owned by `account` (case-insensitive). Exported for tests. */
export function pickInstallation(
  installations: InstallationRecord[],
  account: string
): InstallationRecord | null {
  const want = account.toLowerCase();
  return (
    installations.find((i) => (i.account?.login ?? "").toLowerCase() === want) ?? null
  );
}

/** Per-isolate cache: installation lookups are stable for minutes at a time. */
let cached: { login: string; installationId: number; at: number } | undefined;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function resolveServiceInstallation(env: Env): Promise<GrantProps> {
  const account = (env.ARS_SERVICE_ACCOUNT ?? "klappy").trim();
  if (cached && cached.login === account && Date.now() - cached.at < CACHE_TTL_MS) {
    return { login: account, installationId: cached.installationId, accountLabel: account };
  }
  if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
    throw new Error("Missing GH_APP_ID / GH_APP_PRIVATE_KEY secrets.");
  }
  const appAuth = createAppAuth({
    appId: env.GH_APP_ID,
    privateKey: normalizePrivateKey(env.GH_APP_PRIVATE_KEY),
  });
  const { token: jwt } = await appAuth({ type: "app" });
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/app/installations?per_page=100&page=${page}`,
      {
        headers: {
          authorization: `Bearer ${jwt}`,
          accept: "application/vnd.github+json",
          "user-agent": "git-repo-auth-mcp",
        },
      }
    );
    if (!res.ok) {
      throw new Error(`GitHub /app/installations failed: HTTP ${res.status}`);
    }
    const installations = (await res.json()) as InstallationRecord[];
    const hit = pickInstallation(installations, account);
    if (hit) {
      cached = { login: account, installationId: hit.id, at: Date.now() };
      return { login: account, installationId: hit.id, accountLabel: account };
    }
    if (installations.length < 100) break;
  }
  throw new Error(
    `No installation of this App is owned by '${account}' (ARS_SERVICE_ACCOUNT).`
  );
}

/** Serve /mcp for the service caller: same handler, same quota/metering,
 *  props pinned to the service account's installation. */
export async function handleServiceRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let props: GrantProps;
  try {
    props = await resolveServiceInstallation(env);
  } catch (err) {
    return new Response(`Service credential accepted but installation resolution failed: ${(err as Error).message}`, {
      status: 502,
    });
  }
  (ctx as ExecutionContext & { props?: GrantProps }).props = props;
  // Dynamic import keeps this module loadable outside the Workers runtime
  // (mcp-api transitively imports `cloudflare:`-scheme modules, which the
  // Node test loader cannot resolve).
  const { McpApiHandler } = await import("./mcp-api");
  return McpApiHandler.fetch(request, env, ctx);
}
