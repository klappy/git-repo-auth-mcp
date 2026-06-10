/**
 * The gated /mcp API. OAuthProvider has already verified the access token
 * and decrypted this grant's props into ctx.props before we run. Minting is
 * bound to props.installationId — GitHub enforces that the resulting token
 * cannot reach any other installation's repositories.
 */

import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAppAuth } from "@octokit/auth-app";
import { normalizePrivateKey } from "./keys";
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

function buildServer(env: Env, props: GrantProps): McpServer {
  const server = new McpServer({ name: "git-repo-auth-mcp", version: "0.2.0" });

  server.registerTool(
    "github_token",
    {
      description:
        `Mint a short-lived (≤1 hour) GitHub token scoped to the '${props.accountLabel}' ` +
        `installation this connection is bound to. Optionally down-scope to specific ` +
        `repositories and/or permissions. Usable as a git-over-HTTPS password ` +
        `(username: x-access-token) or REST API Bearer token. Expiry is the rotation.`,
      inputSchema: {
        repositories: z
          .array(z.string())
          .optional()
          .describe("Repository names (without owner) to scope to. Omit for all repos in the installation."),
        permissions: z
          .record(z.string(), z.string())
          .optional()
          .describe('Permission map to down-scope, e.g. {"contents":"read"}. Subset of the App grant.'),
      },
    },
    async ({ repositories, permissions }) => {
      const auth = getAppAuth(env);
      const result = await auth({
        type: "installation",
        installationId: props.installationId,
        ...(repositories ? { repositoryNames: repositories } : {}),
        ...(permissions ? { permissions } : {}),
      });
      const payload = {
        token: result.token,
        expires_at: result.expiresAt,
        account: props.accountLabel,
        permissions: result.permissions,
        repository_selection: result.repositorySelection,
        usage: {
          git_https: "git clone https://x-access-token:<token>@github.com/<owner>/<repo>.git",
          rest_api: "Authorization: Bearer <token>",
        },
      };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }
  );

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
    const handler = createMcpHandler(buildServer(env, props), { route: "/mcp" });
    return handler(request, env, ctx);
  },
};
