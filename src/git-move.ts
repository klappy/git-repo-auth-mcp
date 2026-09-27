/**
 * git_move — ONE tree commit that drops `from` and adds `to` (file or
 * directory prefix). Same order and plumbing as git_put: validate →
 * checkGrant → mint (contents:write, this repo) → checkMainAllowlist on
 * [from, to] → ref → parent → tree → commit → ref → audit row. Every refusal
 * happens before any write; the token never leaves this call.
 */
import { auditRow, checkGrant, checkMainAllowlist, requiredPermissions, type Refusal } from "./write";
import type { GitPutDeps } from "./git-put";

export interface GitMoveInput {
  repo: string;
  branch: string;
  base?: string;
  from: string;
  to: string;
  message: string;
  author?: { name: string; email: string };
}

export type GitMoveResult =
  | { ok: true; sha: string; branch: string; created_branch: boolean; moved: { from: string; to: string }[] }
  | { ok: false; error: string; detail: Refusal | { status: number; step: string; message: string } };

const API = "https://api.github.com";

export class Upstream extends Error {
  constructor(public status: number, public step: string, message: string) {
    super(message);
  }
}

/** Shared GitHub caller: bearer header, JSON body, Upstream on non-2xx. */
export function ghCaller(f: typeof fetch, full: string, token: string) {
  return async (step: string, method: string, path: string, body?: unknown) => {
    const res = await f(`${API}/repos/${full}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "git-repo-auth-mcp",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) throw new Upstream(res.status, step, String((json as { message?: string }).message ?? res.statusText));
    return json as Record<string, any>;
  };
}

const clean = (p: string) => p.replace(/^\/+|\/+$/g, "");

export async function gitMove(input: GitMoveInput, deps: GitPutDeps): Promise<GitMoveResult> {
  const [owner, name] = input.repo.includes("/") ? input.repo.split("/", 2) : [deps.owner, input.repo];
  const full = `${owner}/${name}`;
  const from = clean(input.from);
  const to = clean(input.to);
  const audit = (a: { outcome: "landed" | "refused" | "upstream"; sha?: string; refusal?: string; status?: number }) =>
    deps.log(auditRow({ verb: "git_move", login: deps.login, repo: full, branch: input.branch, paths: [`${from}>${to}`], ...a }));
  const refuse = (r: Refusal): GitMoveResult => {
    audit({ outcome: "refused", refusal: r.refusal === "missing_permission" ? `missing_permission:${r.missing.join("+")}` : r.refusal });
    return { ok: false, error: r.refusal, detail: r };
  };
  const invalid = (message: string): GitMoveResult => ({ ok: false, error: "invalid", detail: { status: 400, step: "input", message } });

  if (owner !== deps.owner) return refuse({ refusal: "repo_not_granted", repo: full });
  if (!from || !to) return invalid("from and to are required");
  if (from === to || to.startsWith(from + "/")) return invalid("to must differ from from and not sit inside it");

  const grant = await deps.getGrant();
  const g = checkGrant("git_move", grant.permissions, name, grant.repositories);
  if (g) return refuse(g);

  let token: string;
  try {
    token = await deps.mint(name, requiredPermissions("git_move"));
  } catch (err) {
    const status = (err as { status?: number } | null)?.status ?? 0;
    if (status === 404 || status === 422) return refuse({ refusal: "repo_not_granted", repo: full });
    throw err;
  }
  const gh = ghCaller(deps.fetch, full, token);

  try {
    const repoInfo = await gh("repo", "GET", "");
    const defaultBranch = String(repoInfo.default_branch);
    const m = checkMainAllowlist(input.branch, defaultBranch, [from, to]);
    if (m) return refuse(m);

    let parent: string;
    let created = false;
    try {
      parent = (await gh("ref", "GET", `/git/ref/heads/${input.branch}`)).object.sha;
    } catch (err) {
      if (!(err instanceof Upstream) || err.status !== 404) throw err;
      parent = (await gh("base-ref", "GET", `/git/ref/heads/${input.base ?? defaultBranch}`)).object.sha;
      created = true;
    }
    const parentCommit = await gh("parent-commit", "GET", `/git/commits/${parent}`);
    const listing = await gh("tree-read", "GET", `/git/trees/${parentCommit.tree.sha}?recursive=1`);
    if (listing.truncated) throw new Upstream(413, "tree-read", "tree listing truncated; move a smaller subtree");
    const entries = (listing.tree as { path: string; mode: string; type: string; sha: string }[]).filter(
      (e) => e.type === "blob" && (e.path === from || e.path.startsWith(from + "/"))
    );
    if (!entries.length) return invalid(`from not found on ${input.branch}: ${from}`);

    const moved = entries.map((e) => ({ from: e.path, to: to + e.path.slice(from.length) }));
    const tree = await gh("tree", "POST", "/git/trees", {
      base_tree: parentCommit.tree.sha,
      tree: [
        ...entries.map((e) => ({ path: e.path, mode: e.mode, type: "blob", sha: null })),
        ...entries.map((e, i) => ({ path: moved[i].to, mode: e.mode, type: "blob", sha: e.sha })),
      ],
    });
    const commit = await gh("commit", "POST", "/git/commits", {
      message: input.message,
      tree: tree.sha,
      parents: [parent],
      ...(input.author ? { author: input.author } : {}),
    });
    if (created) await gh("ref-create", "POST", "/git/refs", { ref: `refs/heads/${input.branch}`, sha: commit.sha });
    else await gh("ref-update", "PATCH", `/git/refs/heads/${input.branch}`, { sha: commit.sha, force: false });

    audit({ outcome: "landed", sha: commit.sha });
    return { ok: true, sha: commit.sha, branch: input.branch, created_branch: created, moved };
  } catch (err) {
    if (!(err instanceof Upstream)) throw err;
    audit({ outcome: "upstream", status: err.status, refusal: err.step });
    return { ok: false, error: "upstream", detail: { status: err.status, step: err.step, message: err.message } };
  }
}
