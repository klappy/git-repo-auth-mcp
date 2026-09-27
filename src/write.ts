/**
 * Scope law for the write verbs (git_put, git_move, pr_open). Pure — no
 * network, no minting. The contract is governance/external/write-verbs.md;
 * this file computes, the document defines.
 *
 * Order of operations for a verb: requiredPermissions → checkGrant → (for
 * default-branch writes) checkMainAllowlist → mint → GitHub → auditRow.
 * A refusal here happens before any mint, so it costs nothing and leaks
 * nothing.
 */

export type WriteVerb = "git_put" | "git_move" | "pr_open";

/** Permission each verb mints. Exactly this, never wider. */
export function requiredPermissions(verb: WriteVerb): Record<string, string> {
  switch (verb) {
    case "git_put":
    case "git_move":
      return { contents: "write" };
    case "pr_open":
      return { contents: "read", pull_requests: "write" };
  }
}

const LEVEL: Record<string, number> = { read: 1, write: 2, admin: 3 };

export type Refusal =
  | { refusal: "missing_permission"; missing: string[] }
  | { refusal: "repo_not_granted"; repo: string }
  | { refusal: "main_protected"; paths: string[] };

/**
 * Is the installation grant wide enough for the verb, on this repo? Names
 * every missing permission as "<name>:<level>" so the fix is in the refusal.
 * `grantedRepos` undefined = installation grants all repositories.
 */
export function checkGrant(
  verb: WriteVerb,
  granted: Record<string, string>,
  repo: string,
  grantedRepos?: string[]
): Refusal | null {
  if (grantedRepos && !grantedRepos.includes(repo)) {
    return { refusal: "repo_not_granted", repo };
  }
  const missing: string[] = [];
  for (const [name, level] of Object.entries(requiredPermissions(verb))) {
    const have = LEVEL[granted[name] ?? ""] ?? 0;
    if (have < (LEVEL[level] ?? 99)) missing.push(`${name}:${level}`);
  }
  return missing.length ? { refusal: "missing_permission", missing } : null;
}

/** Paths that may land on the default branch directly (R19 / HYGIENE 3). */
export const MAIN_DIRECT_ALLOWLIST = ["rail/", "journal/"] as const;

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return "../"; // escapes the tree — never allowlisted
    parts.push(seg);
  }
  return parts.join("/");
}

export function isRailPath(path: string): boolean {
  const n = normalizePath(path);
  return MAIN_DIRECT_ALLOWLIST.some((prefix) => n.startsWith(prefix) && n.length > prefix.length);
}

/**
 * Writes to the default branch are allowed only when every path is a rail
 * path. Returns the offending paths, or null when the write may proceed.
 */
export function checkMainAllowlist(
  branch: string,
  defaultBranch: string,
  paths: string[]
): Refusal | null {
  if (branch !== defaultBranch) return null;
  const offending = paths.filter((p) => !isRailPath(p));
  return offending.length ? { refusal: "main_protected", paths: offending } : null;
}

export interface AuditInput {
  verb: WriteVerb;
  login: string;
  repo: string; // owner/repo
  branch: string;
  /** git_put: file paths. git_move: ["from>to"]. pr_open: [head]. */
  paths: string[];
  outcome: "landed" | "refused" | "upstream";
  sha?: string;
  refusal?: string;
  status?: number;
}

const SECRET = /(ghs_|ghp_|github_pat_|gho_|ghu_)[A-Za-z0-9_.-]+|Bearer\s+\S+/g;

/** Strip anything token-shaped from a free-text field before it hits a log. */
export function redact(s: string): string {
  return s.replace(SECRET, "[redacted]");
}

/**
 * One line per call. Built from the request shape and the outcome only —
 * no token, no content. Free-text fields are redacted anyway (belt and
 * braces): a path or branch name cannot smuggle a credential into the log.
 */
export function auditRow(a: AuditInput): string {
  const kv: [string, string][] = [
    ["verb", a.verb],
    ["login", a.login],
    ["repo", a.repo],
    ["branch", a.branch],
    ["paths", `${a.paths.length}:${a.paths.join(",")}`],
    ["outcome", a.outcome],
  ];
  if (a.sha) kv.push(["sha", a.sha]);
  if (a.refusal) kv.push(["refusal", a.refusal]);
  if (a.status !== undefined) kv.push(["status", String(a.status)]);
  return "audit " + kv.map(([k, v]) => `${k}=${redact(v).replace(/\s+/g, "_")}`).join(" ");
}
