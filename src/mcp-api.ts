/**
 * The gated /mcp API. OAuthProvider has already verified the access token
 * and decrypted this grant's props into ctx.props before we run. Minting is
 * bound to props.installationId — GitHub enforces that the resulting token
 * cannot reach any other installation's repositories.
 *
 * Metering wraps the mint (see src/quota.ts): same-scope re-requests within
 * a live token's lifetime are cache hits and cost nothing; counted mints are
 * accounted in KV and (when billing is configured) emitted to a Stripe
 * Billing Meter. Tier numbers come from governance/external/tiers.md at
 * runtime — never from this code. Enforcement is feature-flagged
 * (QUOTA_ENFORCE) so accounting can ship and be observed first.
 */

import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAppAuth, type InstallationAccessTokenAuthentication } from "@octokit/auth-app";
import { normalizePrivateKey } from "./keys";
import { checkAndRecordMint, recordLiveToken, scopeKey } from "./quota";
import { emitMeterEvent } from "./billing";
import { getDocs, listDocs } from "./docs";
import { computeStats, isOperator } from "./stats";
import type { Env, GrantProps } from "./types";

type AppAuth = ReturnType<typeof createAppAuth>;

/** One app-level signer per isolate; installation is chosen per call.
 *  @octokit/auth-app caches installation tokens internally, keyed on
 *  installation + repositories + permissions, expiry-aware. */
let appAuth: AppAuth | undefined;

function getAppAuth(env: Env): AppAuth {
  if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
    throw new Error("Missing GH_APP_ID / GH_APP_PRIVATE_KEY secrets.");
  }
  appAuth ??= createAppAuth({
    appId: env.GH_APP_ID,
    privateKey: normalizePrivateKey(env.GH_APP_PRIVATE_KEY),
  });
  return appAuth;
}

function buildServer(env: Env, props: GrantProps, ctx: ExecutionContext): McpServer {
  const server = new McpServer({ name: "git-repo-auth-mcp", version: "0.3.0" });

  server.registerTool(
    "github_token",
    {
      title: "Mint GitHub token",
      annotations: {
        title: "Mint GitHub token",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      description:
        `Mint a short-lived (≤1 hour) GitHub token scoped to the '${props.accountLabel}' ` +
        `installation this connection is bound to. SECURE BY DEFAULT: omitting 'permissions' ` +
        `mints a READ-ONLY token ({"contents":"read"}). If the task requires writing — pushing ` +
        `commits, opening PRs — request it explicitly, e.g. {"contents":"write","pull_requests":"write"}. ` +
        `Request only the scope the task in front of you needs. Optionally down-scope to specific ` +
        `repositories. Usable as a git-over-HTTPS password ` +
        `(username: x-access-token) or REST API Bearer token. Expiry is the rotation. ` +
        `Responses include quota transparency fields (tier, remaining, window_reset_at, ` +
        `cached) — re-requesting the same scope while a token is live is free. ` +
        `Ask the docs tool about "tiers" or "quota" for how limits work.`,
      inputSchema: {
        repositories: z
          .array(z.string())
          .optional()
          .describe("Repository names (without owner) to scope to. Omit for all repos in the installation."),
        permissions: z
          .record(z.string(), z.string())
          .optional()
          .describe('Permission map, e.g. {"contents":"write"}. Subset of the App grant. OMITTED = read-only default ({"contents":"read"}). Request write explicitly and only when the task needs it.'),
      },
    },
    async ({ repositories, permissions }) => {
      // Secure-by-default: an unscoped request mints read-only. Write access
      // must be asked for by name. The ceiling is still the App grant and the
      // installation — GitHub enforces both. An empty permissions map is
      // treated the same as an omitted one — it must not bypass the default.
      const effectivePermissions =
        permissions && Object.keys(permissions).length > 0 ? permissions : { contents: "read" };
      const scope = await scopeKey(props.installationId, repositories, effectivePermissions);
      const decision = await checkAndRecordMint(env, props.login, scope);

      if (!decision.ok) {
        const wall = {
          error: "quota_exceeded",
          limit_hit: decision.limit_hit,
          tier: decision.tier,
          ...(decision.window_reset_at ? { window_reset_at: decision.window_reset_at } : {}),
          ...(decision.upgrade_url ? { upgrade_url: decision.upgrade_url } : {}),
          docs: 'Ask the docs tool about "tiers" for how limits and upgrades work.',
          governance_source: decision.governance_source,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(wall, null, 2) }],
          isError: true,
        };
      }

      const auth = getAppAuth(env);
      let result: InstallationAccessTokenAuthentication;
      try {
        result = (await auth({
          type: "installation",
          installationId: props.installationId,
          ...(repositories ? { repositoryNames: repositories } : {}),
          permissions: effectivePermissions,
        })) as InstallationAccessTokenAuthentication;
      } catch (err) {
        // GitHub 404s token creation when the installation no longer exists —
        // typically because the App was uninstalled (or uninstalled and
        // reinstalled, which issues a NEW installation id; the old id frozen
        // into this connection's grant is gone forever). Without this catch,
        // Octokit's raw "Not Found - <docs url>" string reaches the user and
        // explains nothing. Diagnose it for them and name the one real fix.
        const status = (err as { status?: number } | null)?.status;
        if (status === 404) {
          const wall = {
            error: "installation_gone",
            detail:
              `GitHub has no installation #${props.installationId} for this App anymore. ` +
              `It was most likely uninstalled — or uninstalled and reinstalled, which creates a new ` +
              `installation id. This connection's grant is permanently bound to the old one.`,
            fix:
              "Disconnect and reconnect this connector in your MCP client (Claude: Settings → Connectors → " +
              "Git Repo Auth). That re-runs the GitHub flow and binds the connection to the current " +
              "installation. Two things that will NOT fix it: the website's Connect GitHub button " +
              "(it installs the App but cannot rebind an existing connection), and reconnecting while " +
              "reusing an already-open conversation (it keeps the token it started with — use a fresh one).",
            docs: 'Ask the docs tool about "getting started" for the full connection flow.',
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(wall, null, 2) }],
            isError: true,
          };
        }
        throw err;
      }

      if (!decision.cached) {
        ctx.waitUntil(recordLiveToken(env, props.login, scope, result.expiresAt));
        ctx.waitUntil(emitMeterEvent(env, props.login));
      }

      const payload = {
        token: result.token,
        expires_at: result.expiresAt,
        account: props.accountLabel,
        permissions: result.permissions,
        repository_selection: result.repositorySelection,
        quota: {
          tier: decision.tier,
          remaining: decision.remaining,
          ...(decision.window_reset_at ? { window_reset_at: decision.window_reset_at } : {}),
          ...(decision.weekly_remaining !== undefined
            ? { weekly_remaining: decision.weekly_remaining }
            : {}),
          cached: decision.cached,
          governance_source: decision.governance_source,
        },
        usage: {
          git_https: "git clone https://x-access-token:<token>@github.com/<owner>/<repo>.git",
          rest_api: "Authorization: Bearer <token>",
        },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.registerTool(
    "docs",
    {
      title: "Service documentation",
      annotations: {
        title: "Service documentation",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        `How this service works, served verbatim from its governance documents: ` +
        `tier limits and pricing mechanics ("tiers"), quota response fields and agent ` +
        `guidance ("quota"), and a first-run walkthrough ("getting started"). ` +
        `Available: ${listDocs().map((d) => d.name).join(", ")}.`,
      inputSchema: {
        query: z.string().describe('What to look up, e.g. "tiers", "quota fields", "getting started".'),
      },
    },
    async ({ query }) => {
      const docs = await getDocs(env, query);
      const text = docs
        .map((d) => `<!-- ${d.name} (source: ${d.source}) -->\n\n${d.text}`)
        .join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  if (isOperator(env, props.login)) {
    server.registerTool(
      "admin_stats",
      {
        title: "Operator stats",
        annotations: {
          title: "Operator stats",
          readOnlyHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        description:
          `Operator-only aggregate service stats: connected users, active users ` +
          `(trailing 8 days), paid users, and the crude conversion ratio, with the ` +
          `paid count cross-checked against Stripe's active subscriptions ` +
          `(disagreement is surfaced, never reconciled). Aggregates only — no ` +
          `per-user data. Definitions are the contract in ` +
          `governance/internal/operator-observability.md; this tool computes, ` +
          `the document defines.`,
        inputSchema: {},
      },
      async () => {
        const stats = await computeStats(env);
        return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
      }
    );
  }

  return server;
}

export const McpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: GrantProps }).props;
    if (!props?.installationId) {
      return new Response(
        "Grant is not bound to a GitHub App installation. Disconnect and reconnect to bind one.",
        { status: 403 }
      );
    }
    const handler = createMcpHandler(buildServer(env, props, ctx), { route: "/mcp" });
    return handler(request, env, ctx);
  },
};
