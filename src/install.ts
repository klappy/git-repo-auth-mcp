/**
 * Install-resume outcome: after GitHub redirects back to /setup post-install,
 * decide whether the pending OAuth transaction may auto-bind.
 *
 * Bind requires the installation's owning account to be the same login we
 * authenticated at the start of the flow (case-insensitive — GitHub logins
 * are). Anything else — org installs, missing account, mismatch — routes to
 * reconnect, where the normal flow re-verifies with a real user token and
 * auto-binds or offers the picker. Conservative by construction: /setup can
 * never bind an installation the just-authenticated user doesn't personally own.
 */
export function setupOutcome(
  pendingLogin: string,
  account: { login: string; type: string } | null
): "bind" | "reconnect" {
  if (!account) return "reconnect";
  return account.login.toLowerCase() === pendingLogin.toLowerCase() ? "bind" : "reconnect";
}
