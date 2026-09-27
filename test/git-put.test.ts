import { describe, expect, it, vi } from "vitest";
import { gitPut, type GitPutDeps } from "../src/git-put";

const TOKEN = "ghs_SECRETSECRETSECRET";

function mockFetch(opts: { branchExists?: boolean; defaultBranch?: string } = {}) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
    if (url.endsWith("/repos/klappy/kitchen")) return j(200, { default_branch: opts.defaultBranch ?? "main" });
    if (url.includes("/git/ref/heads/")) {
      if (url.endsWith("/heads/feature") && !opts.branchExists) return j(404, { message: "Not Found" });
      return j(200, { object: { sha: "parent1" } });
    }
    if (url.endsWith("/git/commits/parent1")) return j(200, { tree: { sha: "tree0" } });
    if (url.endsWith("/git/blobs")) return j(201, { sha: `blob${calls.filter((c) => c.url.endsWith("/git/blobs")).length}` });
    if (url.endsWith("/git/trees")) return j(201, { sha: "tree1" });
    if (url.endsWith("/git/commits")) return j(201, { sha: "commit1" });
    if (url.endsWith("/git/refs") || url.includes("/git/refs/heads/")) return j(200, { object: { sha: "commit1" } });
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
    getGrant: async () => ({ permissions: { contents: "write", metadata: "read" } }),
    mint,
    fetch: f as unknown as typeof fetch,
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, logs, mint };
}

const input = {
  repo: "kitchen",
  branch: "feature",
  files: [{ path: "a.md", content: "A" }, { path: "b/c.md", content: "C" }],
  message: "put",
};

describe("git_put", () => {
  it("creates the branch from base, one commit, returns sha + blob urls", async () => {
    const { f, calls } = mockFetch();
    const { d, logs, mint } = deps({}, f);
    const r = await gitPut(input, d);
    expect(r).toMatchObject({ ok: true, sha: "commit1", created_branch: true });
    if (r.ok) expect(r.blobs.map((b) => b.url)).toEqual([
      "https://github.com/klappy/kitchen/blob/feature/a.md",
      "https://github.com/klappy/kitchen/blob/feature/b/c.md",
    ]);
    expect(mint).toHaveBeenCalledWith("kitchen", { contents: "write" });
    expect(calls.filter((c) => c.url.endsWith("/git/commits") && c.method === "POST")).toHaveLength(1);
    const create = calls.find((c) => c.url.endsWith("/git/refs"));
    expect(create?.body).toEqual({ ref: "refs/heads/feature", sha: "commit1" });
    const tree = calls.find((c) => c.url.endsWith("/git/trees"));
    expect(tree?.body.base_tree).toBe("tree0");
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("outcome=landed");
    expect(logs[0]).toContain("sha=commit1");
    expect(logs.join()).not.toContain(TOKEN);
  });

  it("updates an existing branch without force", async () => {
    const { f, calls } = mockFetch({ branchExists: true });
    const r = await gitPut(input, deps({}, f).d);
    expect(r).toMatchObject({ ok: true, created_branch: false });
    const upd = calls.find((c) => c.method === "PATCH");
    expect(upd?.body).toEqual({ sha: "commit1", force: false });
  });

  it("refuses before minting when the grant lacks contents:write, naming it", async () => {
    const { f } = mockFetch();
    const { d, logs, mint } = deps({ getGrant: async () => ({ permissions: { contents: "read" } }) }, f);
    const r = await gitPut(input, d);
    expect(r).toEqual({ ok: false, error: "missing_permission", detail: { refusal: "missing_permission", missing: ["contents:write"] } });
    expect(mint).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
    expect(logs[0]).toContain("outcome=refused");
  });

  it("refuses a foreign owner and a repo outside the selection before minting", async () => {
    const a = deps();
    expect(await gitPut({ ...input, repo: "other/kitchen" }, a.d)).toMatchObject({ ok: false, error: "repo_not_granted" });
    const b = deps({ getGrant: async () => ({ permissions: { contents: "write" }, repositories: ["x"] }) });
    expect(await gitPut(input, b.d)).toMatchObject({ ok: false, error: "repo_not_granted" });
    expect(a.mint).not.toHaveBeenCalled();
    expect(b.mint).not.toHaveBeenCalled();
  });

  it("refuses non-rail paths on the default branch with no writes", async () => {
    const { f, calls } = mockFetch();
    const r = await gitPut({ ...input, branch: "main", files: [{ path: "journal/x.tsv", content: "" }, { path: "src/x.ts", content: "" }] }, deps({}, f).d);
    expect(r).toMatchObject({ ok: false, error: "main_protected", detail: { paths: ["src/x.ts"] } });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("allows rail paths direct to the default branch", async () => {
    const { f } = mockFetch({ branchExists: true });
    const r = await gitPut({ ...input, branch: "main", files: [{ path: "journal/x.tsv", content: "row" }] }, deps({}, f).d);
    expect(r).toMatchObject({ ok: true, sha: "commit1" });
  });

  it("reports upstream failure with the step, never 'landed'", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("/repos/klappy/kitchen") ? new Response(JSON.stringify({ default_branch: "main" })) : new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })
    );
    const { d, logs } = deps({}, f as any);
    const r = await gitPut(input, d);
    expect(r).toMatchObject({ ok: false, error: "upstream", detail: { status: 403, step: "ref" } });
    expect(logs[0]).toContain("outcome=upstream");
    expect(logs[0]).not.toContain(TOKEN);
  });

  it("maps a mint refusal (repo not in installation) to repo_not_granted", async () => {
    const r = await gitPut(input, deps({ mint: async () => { throw Object.assign(new Error("x"), { status: 422 }); } }).d);
    expect(r).toMatchObject({ ok: false, error: "repo_not_granted" });
  });
});
