/**
 * Origin-header validation — Connectors Directory technical requirement.
 *
 * 6B borrow evaluation (2026-06-10): `agents/mcp` sets permissive CORS
 * headers (Access-Control-Allow-Origin: *) but validates nothing;
 * `@cloudflare/workers-oauth-provider` matches token *audience* origins,
 * not request Origins; the MCP SDK's DNS-rebinding middleware lives in its
 * Express transport and targets localhost servers only. No substrate covers
 * a Workers deployment, so this ~20-line check is hand-rolled deliberately.
 *
 * The rule: requests without an Origin header pass (server-to-server
 * clients — Anthropic's infra, git, curl — send none; top-level navigations
 * in the OAuth flow send none). Requests WITH an Origin must match the
 * deployment's own host or an entry in ALLOWED_ORIGINS (comma-separated,
 * configured per deployment — policy lives in config, not code).
 */

export function isOriginAllowed(
  originHeader: string | null,
  requestUrl: string,
  allowedOrigins?: string
): boolean {
  if (!originHeader) return true; // non-browser clients and navigations
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false; // malformed Origin is hostile until proven otherwise
  }
  const self = new URL(requestUrl);
  if (origin.host === self.host && origin.protocol === self.protocol) return true;
  if (!allowedOrigins) return false;
  return allowedOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((allowed) => {
      try {
        const a = new URL(allowed);
        return a.host === origin.host && a.protocol === origin.protocol;
      } catch {
        return false;
      }
    });
}
