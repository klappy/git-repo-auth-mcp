/**
 * pr_open — opens a DRAFT pull request, assigns the operator, and never
 * requests review. Order: validate → checkGrant (contents:read +
 * pull_requests:write) → mint → POST pulls (draft) → POST assignees → audit
 * row. Refusals happen before the mint; the token never leaves this call.
 */
import { auditRow, checkGrant, requiredPermissions, type Refusal } from "./write";
import type { GitPutDeps } from "./git-put";
import { ghCaller, Upstream } from "./git-move";

export interface PrOpenInput {
  repo: string;
  head: string;
  base?: string;
  title: string;
  body?: string;
}

export type PrOpenResult =
  | { ok: true; number: number; url: string; draft: true; assignees: string[] }
  | { ok: false; error: string; detail: Refusal | { status: number; step: string; message: string } };

export async function prOpen(input: PrOpenInput, deps: GitPutDeps): Promise<PrOpenResult> {
  const [owner, name] = input.repo.includes("/") ? input.repo.split("/", 2) : [deps.owner, input.repo];
  const full = `${owner}/${name}`;
  const audit = (a: { outcome: "landed" | "refused" | "upstream"; sha?: string; refusal?: string; status?: number }) =>
    deps.log(auditRow({ verb: "pr_open", login: deps.login, repo: full, branch: input.base ?? "(default)", paths: [input.head], ...a }));
  const refuse = (r: Refusal): PrOpenResult => {
    audit({ outcome: "refused", refusal: r.refusal === "missing_permission" ? `missing_permission:${r.missing.join("+")}` : r.refusal });
    return { ok: false, error: r.refusal, detail: r };
  };

  if (owner !== deps.owner) return refuse({ refusal: "repo_not_granted", repo: full });
  if (!input.head || !input.title) return { ok: false, error: "invalid", detail: { status: 400, step: "input", message: "head and title are required" } };

  const grant = await deps.getGrant();
  const g = checkGrant("pr_open", grant.permissions, name, grant.repositories);
  if (g) return refuse(g);

  let token: string;
  try {
    token = await deps.mint(name, requiredPermissions("pr_open"));
  } catch (err) {
    const status = (err as { status?: number } | null)?.status ?? 0;
    if (status === 404 || status === 422) return refuse({ refusal: "repo_not_granted", repo: full });
    throw err;
  }
  const gh = ghCaller(deps.fetch, full, token);

  try {
    const base = input.base ?? String((await gh("repo", "GET", "")).default_branch);
    const pr = await gh("pull", "POST", "/pulls", { title: input.title, head: input.head, base, body: input.body ?? "", draft: true });
    const a = await gh("assign", "POST", `/issues/${pr.number}/assignees`, { assignees: [deps.login] });
    const assignees = ((a.assignees ?? []) as { login: string }[]).map((x) => x.login);
    audit({ outcome: "landed", sha: String(pr.head?.sha ?? pr.number) });
    return { ok: true, number: pr.number, url: pr.html_url, draft: true, assignees };
  } catch (err) {
    if (!(err instanceof Upstream)) throw err;
    audit({ outcome: "upstream", status: err.status, refusal: err.step });
    return { ok: false, error: "upstream", detail: { status: err.status, step: err.step, message: err.message } };
  }
}
