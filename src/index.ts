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

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { GitHubAuthHandler } from "./github-auth";
import { McpApiHandler } from "./mcp-api";

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: McpApiHandler,
  defaultHandler: GitHubAuthHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["github_token"],
});
