/**
 * Fail-closed bearer authentication for the MCP endpoint.
 *
 * This middleware is the ENTIRE security boundary of this worker: anyone who
 * passes it can mint write-capable tokens for every repo the GitHub App is
 * installed on. There is no second gate. Treat MCP_AUTH_TOKEN with the same
 * care as the App private key.
 *
 * Fail-closed: if MCP_AUTH_TOKEN is not configured, the server refuses to
 * serve (503) rather than serving unauthenticated.
 */

export interface AuthEnv {
  MCP_AUTH_TOKEN?: string;
}

/** Constant-time string comparison (length leaks; contents do not). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Returns null when the request is authorized; otherwise returns the
 * Response to send (401 or 503). Callers must return that Response as-is.
 */
export function requireBearer(request: Request, env: AuthEnv): Response | null {
  if (!env.MCP_AUTH_TOKEN || env.MCP_AUTH_TOKEN.length < 16) {
    // Fail closed. An unset or trivially short secret is a misconfiguration,
    // not an invitation to serve openly.
    return new Response(
      "Server not configured: set the MCP_AUTH_TOKEN secret (>=16 chars). This server fails closed.",
      { status: 503 }
    );
  }
  const header = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(header, `Bearer ${env.MCP_AUTH_TOKEN}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
