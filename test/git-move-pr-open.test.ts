import { describe, expect, it, vi } from "vitest";
import { gitMove } from "../src/git-move";
import { prOpen } from "../src/pr-open";
import type { GitPutDeps } from "../src/git-put";

const TOKEN = "ghs_SECRETSECRETSECRET";
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });

function mockFetch(opts: { branchExists?: boolean; defaultBranch?: string } = {}) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    if (url.endsWith("/repos/klappy/kitchen")) return j(200, { default_branch: opts.defaultBranch ?? "main" });
    if (url.includes("/git/ref/heads/")) {
      if (url.endsWith("/heads/feature") && opts.branchExists === false) return j(404, { message: "Not Found" });
      return j(200, { object: { sha: "parent1" } });
    }
    if (url.endsWith("/git/commits/parent1")) return j(200, { tree: { sha: "tree0" } });
    if (url.includes("/git/trees/tree0?recursive=1"))
      return j(200, {
        truncated: false,
        tree: [
          { path: "rail/a.md", mode: "100644", type: "blob", sha: "b1" },
          { path: "rail/d", mode: "040000", type: "tree", sha: "t1" },
          { path: "rail/d/x.md", mode: "100644", type: "blob", sha: "b2" },
          { path: "rail/d/y.sh", mode: "100755", type: "blob", sha: "b3" },
          { path: "src/k.ts", mode: "100644", type: "blob", sha: "b4" },
        ],
      });
    if (url.endsWith("/git/trees")) return j(201, { sha: "tree1" });
    if (url.endsWith("/git/commits")) return j(201, { sha: "commit1" });
    if (url.endsWith("/git/refs") || url.includes("/git/refs/heads/")) return j(200, { object: { sha: "commit1" } });
    if (url.endsWith("/pulls")) return j(201, { number: 7, html_url: "https://github.com/klappy/kitchen/pull/7", head: { sha: "h1" } });
    if (url.endsWith("/issues/7/assignees")) return j(201, { assignees: [{ login: "klappy" }] });
    return j(500, { message: "unexpected " + url });
  });
  return { f, calls };
}

function deps(over: Partial<GitPutDeps> = {}, f = mockFetch().f) {
  const logs: string[] = [];
  const mint = vi.fn(async () => TOKEN);
  const d: GitPutDeps = {
    owner: "klappy",
    login: "klappy",
    getGrant: async () => ({ permissions: { contents: "write", pull_requests: "write", metadata: "read" } }),
    mint,
    fetch: f as unknown as typeof fetch,
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, logs, mint };
}

const mv = { repo: "kitchen", branch: "feature", from: "rail/d", to: "rail/e", message: "move" };

describe("git_move", () => {
  it("one tree commit: drops every from entry, adds each at to, same blob+mode", async () => {
    const { f, calls } = mockFetch();
    const { d, logs, mint } = deps({}, f);
    const r = await gitMove(mv, d);
    expect(r).toMatchObject({ ok: true, sha: "commit1", created_branch: false });
    expect(mint).toHaveBeenCalledWith("kitchen", { contents: "write" });
    const trees = calls.filter((c) => c.method === "POST" && c.url.endsWith("/git/trees"));
    expect(trees).toHaveLength(1);
    expect(trees[0].body).toEqual({
      base_tree: "tree0",
      tree: [
        { path: "rail/d/x.md", mode: "100644", type: "blob", sha: null },
        { path: "rail/d/y.sh", mode: "100755", type: "blob", sha: null },
        { path: "rail/e/x.md", mode: "100644", type: "blob", sha: "b2" },
        { path: "rail/e/y.sh", mode: "100755", type: "blob", sha: "b3" },
      ],
    });
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/git/commits"))).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("/git/blobs"))).toBe(false);
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ sha: "commit1", force: false });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("verb=git_move");
    expect(logs[0]).toContain("paths=1:rail/d>rail/e");
    expect(logs.join()).not.toContain(TOKEN);
  });

  it("moves a single file and creates the branch from base when absent", async () => {
    const { f, calls } = mockFetch({ branchExists: false });
    const r = await gitMove({ ...mv, from: "rail/a.md", to: "journal/a.md" }, deps({}, f).d);
    expect(r).toMatchObject({ ok: true, created_branch: true, moved: [{ from: "rail/a.md", to: "journal/a.md" }] });
    expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/git/refs"))!.body.ref).toBe("refs/heads/feature");
  });

  it("refuses before mint when grant lacks contents:write", async () => {
    const { f } = mockFetch();
    const { d, mint, logs } = deps({ getGrant: async () => ({ permissions: { contents: "read" } }) }, f);
    const r = await gitMove(mv, d);
    expect(r).toMatchObject({ ok: false, error: "missing_permission", detail: { missing: ["contents:write"] } });
    expect(mint).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
    expect(logs[0]).toContain("outcome=refused");
  });

  it("refuses repo outside grant and foreign owner before mint", async () => {
    const a = deps({ getGrant: async () => ({ permissions: { contents: "write" }, repositories: ["other"] }) });
    expect(await gitMove(mv, a.d)).toMatchObject({ ok: false, error: "repo_not_granted" });
    expect(a.mint).not.toHaveBeenCalled();
    const b = deps();
    expect(await gitMove({ ...mv, repo: "someone/kitchen" }, b.d)).toMatchObject({ ok: false, error: "repo_not_granted" });
    expect(b.mint).not.toHaveBeenCalled();
  });

  it("refuses default-branch move when either path is off-rail, before any write", async () => {
    const { f, calls } = mockFetch();
    const r = await gitMove({ ...mv, branch: "main", from: "rail/a.md", to: "src/a.md" }, deps({}, f).d);
    expect(r).toMatchObject({ ok: false, error: "main_protected", detail: { paths: ["src/a.md"] } });
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("allows default-branch move when both paths are rail/journal", async () => {
    const r = await gitMove({ ...mv, branch: "main", from: "rail/a.md", to: "journal/a.md" }, deps().d);
    expect(r.ok).toBe(true);
  });

  it("rejects missing from without writing; rejects to inside from", async () => {
    const { f, calls } = mockFetch();
    expect(await gitMove({ ...mv, from: "rail/nope" }, deps({}, f).d)).toMatchObject({ ok: false, error: "invalid" });
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    const x = deps();
    expect(await gitMove({ ...mv, to: "rail/d/sub" }, x.d)).toMatchObject({ ok: false, error: "invalid" });
    expect(x.mint).not.toHaveBeenCalled();
  });
});

const pr = { repo: "kitchen", head: "feature", title: "T", body: "B" };

describe("pr_open", () => {
  it("opens a draft, assigns the operator, never requests review", async () => {
    const { f, calls } = mockFetch();
    const { d, logs, mint } = deps({}, f);
    const r = await prOpen(pr, d);
    expect(r).toEqual({ ok: true, number: 7, url: "https://github.com/klappy/kitchen/pull/7", draft: true, assignees: ["klappy"] });
    expect(mint).toHaveBeenCalledWith("kitchen", { contents: "read", pull_requests: "write" });
    expect(calls.find((c) => c.url.endsWith("/pulls"))!.body).toEqual({ title: "T", head: "feature", base: "main", body: "B", draft: true });
    expect(calls.find((c) => c.url.endsWith("/assignees"))!.body).toEqual({ assignees: ["klappy"] });
    expect(calls.some((c) => c.url.includes("requested_reviewers"))).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("verb=pr_open");
    expect(logs[0]).toContain("outcome=landed");
    expect(logs.join()).not.toContain(TOKEN);
  });

  it("uses explicit base without reading the repo", async () => {
    const { f, calls } = mockFetch();
    await prOpen({ ...pr, base: "dish/S2" }, deps({}, f).d);
    expect(calls.some((c) => c.url.endsWith("/repos/klappy/kitchen"))).toBe(false);
    expect(calls.find((c) => c.url.endsWith("/pulls"))!.body.base).toBe("dish/S2");
  });

  it("refuses before mint when grant lacks pull_requests:write", async () => {
    const { f } = mockFetch();
    const { d, mint, logs } = deps({ getGrant: async () => ({ permissions: { contents: "write" } }) }, f);
    expect(await prOpen(pr, d)).toMatchObject({ ok: false, error: "missing_permission", detail: { missing: ["pull_requests:write"] } });
    expect(mint).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
    expect(logs[0]).toContain("refusal=missing_permission:pull_requests:write");
  });

  it("reports upstream failure with audit row and no token", async () => {
    const f = vi.fn(async () => j(422, { message: "No commits between main and feature" }));
    const { d, logs } = deps({}, f as any);
    const r = await prOpen({ ...pr, base: "main" }, d);
    expect(r).toMatchObject({ ok: false, error: "upstream", detail: { status: 422, step: "pull" } });
    expect(logs[0]).toContain("outcome=upstream");
    expect(logs.join()).not.toContain(TOKEN);
  });
});
