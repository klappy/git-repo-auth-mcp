/**
 * git_put — the first write verb. Orchestration only; the law is src/write.ts
 * and the contract is governance/external/write-verbs.md.
 *
 * Order: validate → checkGrant (installation grant) → checkMainAllowlist →
 * mint (server-side, contents:write, this repo only) → refs → blobs → tree →
 * commit → ref create/update → audit row. Every refusal happens before the
 * mint. The token lives only inside this call; it is never returned or logged.
 */
import { auditRow, checkGrant, checkMainAllowlist, requiredPermissions, type Refusal } from "./write";

export interface PutFile {
  path: string;
  content: string;
  mode?: "100644" | "100755";
}

export interface GitPutInput {
  repo: string; // "owner/name" or bare name (owner = installation account)
  branch: string;
  base?: string;
  files: PutFile[];
  message: string;
  author?: { name: string; email: string };
}

export interface Grant {
  permissions: Record<string, string>;
  /** undefined = installation grants all repositories */
  repositories?: string[];
}

export interface GitPutDeps {
  owner: string; // installation account login
  login: string; // operator, for the audit row
  getGrant: () => Promise<Grant>;
  /** Mint an installation token with exactly `permissions` on `repo`. */
  mint: (repo: string, permissions: Record<string, string>) => Promise<string>;
  fetch: typeof fetch;
  log: (line: string) => void;
}

export type GitPutResult =
  | { ok: true; sha: string; branch: string; created_branch: boolean; blobs: { path: string; sha: string; url: string }[] }
  | { ok: false; error: string; detail: Refusal | { status: number; step: string; message: string } };

const API = "https://api.github.com";

class Upstream extends Error {
  constructor(public status: number, public step: string, message: string) {
    super(message);
  }
}

export async function gitPut(input: GitPutInput, deps: GitPutDeps): Promise<GitPutResult> {
  const [owner, name] = input.repo.includes("/") ? input.repo.split("/", 2) : [deps.owner, input.repo];
  const full = `${owner}/${name}`;
  const paths = input.files.map((f) => f.path);
  const audit = (a: { outcome: "landed" | "refused" | "upstream"; sha?: string; refusal?: string; status?: number }) =>
    deps.log(auditRow({ verb: "git_put", login: deps.login, repo: full, branch: input.branch, paths, ...a }));

  const refuse = (r: Refusal): GitPutResult => {
    audit({ outcome: "refused", refusal: r.refusal === "missing_permission" ? `missing_permission:${r.missing.join("+")}` : r.refusal });
    return { ok: false, error: r.refusal, detail: r };
  };

  if (owner !== deps.owner) return refuse({ refusal: "repo_not_granted", repo: full });
  if (!input.files.length) return { ok: false, error: "invalid", detail: { status: 400, step: "input", message: "files[] is empty" } };

  const grant = await deps.getGrant();
  const g = checkGrant("git_put", grant.permissions, name, grant.repositories);
  if (g) return refuse(g);

  // Default branch is only knowable with a token; the law still runs before any write.
  let token: string;
  try {
    token = await deps.mint(name, requiredPermissions("git_put"));
  } catch (err) {
    // GitHub refuses to mint for a repo outside the installation's selection.
    const status = (err as { status?: number } | null)?.status ?? 0;
    if (status === 404 || status === 422) return refuse({ refusal: "repo_not_granted", repo: full });
    throw err;
  }
  const gh = async (step: string, method: string, path: string, body?: unknown) => {
    const res = await deps.fetch(`${API}/repos/${full}${path}`, {
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

  try {
    const repoInfo = await gh("repo", "GET", "");
    const defaultBranch = String(repoInfo.default_branch);
    const m = checkMainAllowlist(input.branch, defaultBranch, paths);
    if (m) return refuse(m);

    let parent: string;
    let created = false;
    const head = await deps.fetch(`${API}/repos/${full}/git/ref/heads/${input.branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "git-repo-auth-mcp" },
    });
    if (head.status === 404) {
      const base = await gh("base-ref", "GET", `/git/ref/heads/${input.base ?? defaultBranch}`);
      parent = base.object.sha;
      created = true;
    } else if (head.ok) {
      parent = ((await head.json()) as any).object.sha;
    } else {
      throw new Upstream(head.status, "ref", head.statusText);
    }
    const parentCommit = await gh("parent-commit", "GET", `/git/commits/${parent}`);

    const blobs: { path: string; sha: string; url: string }[] = [];
    for (const f of input.files) {
      const b = await gh("blob", "POST", "/git/blobs", { content: f.content, encoding: "utf-8" });
      blobs.push({ path: f.path, sha: b.sha, url: `https://github.com/${full}/blob/${input.branch}/${f.path}` });
    }
    const tree = await gh("tree", "POST", "/git/trees", {
      base_tree: parentCommit.tree.sha,
      tree: input.files.map((f, i) => ({ path: f.path, mode: f.mode ?? "100644", type: "blob", sha: blobs[i].sha })),
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
    return { ok: true, sha: commit.sha, branch: input.branch, created_branch: created, blobs };
  } catch (err) {
    if (!(err instanceof Upstream)) throw err;
    audit({ outcome: "upstream", status: err.status, refusal: err.step });
    return { ok: false, error: "upstream", detail: { status: err.status, step: err.step, message: err.message } };
  }
}
