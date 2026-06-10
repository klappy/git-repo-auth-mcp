/**
 * Git Repo Auth MCP — worker-minted, short-lived, scoped GitHub App
 * installation tokens over MCP.
 *
 * Currently GitHub; forge-agnostic by design.
 *
 * Borrowed substrate (per 6B evaluation in the plan):
 *   - MCP transport/lifecycle: `agents` createMcpHandler (Cloudflare)
 *   - MCP envelope:            `@modelcontextprotocol/sdk` McpServer
 *   - JWT mint/exchange/cache: `@octokit/auth-app` (expiry-aware cache,
 *                              keyed on installation + repositories +
 *                              permissions — satisfies the scope-aware
 *                              cache spec by construction)
 *
 * This file is deliberately the only thing built: tool surface, bearer
 * gate, env wiring. Everything protocol- or crypto-shaped is borrowed.
 */

import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAppAuth } from "@octokit/auth-app";
import { requireBearer, type AuthEnv } from "./auth";

export interface Env extends AuthEnv {
  /** GitHub App ID (numeric, as a string). */
  GH_APP_ID: string;
  /** Installation ID of the App on the target account/org. */
  GH_APP_INSTALLATION_ID: string;
  /** App private key, PKCS#8 PEM. GitHub downloads PKCS#1 — convert first:
   *  openssl pkcs8 -topk8 -inform PEM -in app.pem -nocrypt */
  GH_APP_PRIVATE_KEY: string;
}

type AppAuth = ReturnType<typeof createAppAuth>;

/**
 * Module-scope singleton: @octokit/auth-app caches installation tokens
 * internally (expiry-aware, scope-keyed) for the lifetime of this instance,
 * which on Workers is the lifetime of the isolate. Cold starts simply mint
 * fresh — correct, just slightly slower.
 */
let appAuth: AppAuth | undefined;

function getAppAuth(env: Env): AppAuth {
  if (!env.GH_APP_ID || !env.GH_APP_INSTALLATION_ID || !env.GH_APP_PRIVATE_KEY) {
    throw new Error(
      "Missing GitHub App configuration: GH_APP_ID, GH_APP_INSTALLATION_ID, and GH_APP_PRIVATE_KEY secrets are all required."
    );
  }
  appAuth ??= createAppAuth({
    appId: env.GH_APP_ID,
    privateKey: env.GH_APP_PRIVATE_KEY,
    installationId: Number(env.GH_APP_INSTALLATION_ID),
  });
  return appAuth;
}

const TOOL_DESCRIPTION = [
  "Mint a short-lived (≤1 hour) GitHub App installation token, optionally",
  "down-scoped to specific repositories and/or permissions. The token is",
  "usable as a password for git-over-HTTPS (username: x-access-token) and",
  "as a Bearer token for the GitHub REST API. Expiry is the rotation:",
  "never request or accept long-lived credentials in chat.",
].join(" ");

function buildServer(env: Env): McpServer {
  const server = new McpServer({ name: "git-repo-auth-mcp", version: "0.1.0" });

  server.registerTool(
    "github_token",
    {
      description: TOOL_DESCRIPTION,
      inputSchema: {
        repositories: z
          .array(z.string())
          .optional()
          .describe(
            "Repository names (without owner) to scope the token to, e.g. ['klappy.dev']. Omit for all repos the App is installed on."
          ),
        permissions: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Permission map to down-scope, e.g. {\"contents\":\"read\"}. Must be a subset of the App's granted permissions. Omit for the App's full grant."
          ),
      },
    },
    async ({ repositories, permissions }) => {
      const auth = getAppAuth(env);
      const result = await auth({
        type: "installation",
        ...(repositories ? { repositoryNames: repositories } : {}),
        ...(permissions ? { permissions } : {}),
      });
      const payload = {
        token: result.token,
        expires_at: result.expiresAt,
        permissions: result.permissions,
        repository_selection: result.repositorySelection,
        usage: {
          git_https: `git clone https://x-access-token:<token>@github.com/<owner>/<repo>.git`,
          rest_api: `Authorization: Bearer <token>`,
        },
      };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Unauthenticated liveness probe — returns no secrets, mints nothing.
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }

    // The entire security boundary. Fail-closed.
    const denied = requireBearer(request, env);
    if (denied) return denied;

    const handler = createMcpHandler(buildServer(env), { route: "/mcp" });
    return handler(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
