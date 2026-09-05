import { describe, it, expect, vi, beforeEach } from "vitest";

const authCalls: Array<{
  type: string;
  installationId: number;
  repositoryNames?: string[];
  permissions?: Record<string, string>;
}> = [];

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: () => async (opts: { repositoryNames?: string[] }) => {
    authCalls.push(opts as (typeof authCalls)[number]);
    if (opts.repositoryNames?.includes("no-grant")) {
      const err = new Error("Not Found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    if (opts.repositoryNames?.includes("mint-boom")) {
      throw new Error("GitHub App installation temporarily unavailable");
    }
    return { token: "s3cr3t-token", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  },
}));

vi.mock("./billing", () => ({ emitMeterEvent: async () => {} }));

import { __testables } from "../src/write-verbs";
import type { Env, GrantProps } from "../src/types";

const { gitPut, gitMove, prOpen } = __testables;

function stubEnv(opts?: { operatorLogin?: string }): Env {
  const store = new Map<string, string>();
  return {
    GH_APP_ID: "1",
    GH_APP_PRIVATE_KEY: "unused-because-createAppAuth-is-mocked",
    OPERATOR_LOGIN: opts?.operatorLogin,
    OAUTH_KV: {
      async get(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
      async list({ prefix }: { prefix: string; cursor?: string }) {
        const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
        return { keys, list_complete: true, cursor: undefined };
      },
    },
  } as unknown as Env;
}

const props: GrantProps = { login: "octocat", installationId: 42, accountLabel: "octocat" };
const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

function githubRoute(url: string, init?: RequestInit): Response | undefined {
  const method = init?.method ?? "GET";
  if (url === "https://api.github.com/users/octocat" && method === "GET") {
    return Response.json({ id: 583231 });
  }
  if (url === "https://api.github.com/repos/octocat/hello" && method === "GET") {
    return Response.json({ default_branch: "main" });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/ref/heads/main" && method === "GET") {
    return Response.json({ object: { sha: "base-sha" } });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/ref/heads/feature" && method === "GET") {
    return new Response("not found", { status: 404 });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/ref/heads/topic-branch" && method === "GET") {
    return Response.json({ object: { sha: "base-sha" } });
  }
  if (
    url === "https://api.github.com/repos/octocat/hello/git/refs/heads/topic-branch" &&
    method === "PATCH"
  ) {
    return Response.json({ ref: "refs/heads/topic-branch" });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/refs" && method === "POST") {
    return Response.json({ ref: "refs/heads/feature" }, { status: 201 });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/commits/base-sha" && method === "GET") {
    return Response.json({ tree: { sha: "base-tree-sha" } });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/blobs" && method === "POST") {
    const body = JSON.parse(String(init?.body));
    return Response.json({ sha: `blob-${body.content.length}`, url: `https://api.github.com/blob/${body.content.length}` }, { status: 201 });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/trees" && method === "POST") {
    return Response.json({ sha: "new-tree-sha" }, { status: 201 });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/commits" && method === "POST") {
    return Response.json({ sha: "new-commit-sha" }, { status: 201 });
  }
  if (
    url === "https://api.github.com/repos/octocat/hello/git/refs/heads/feature" &&
    method === "PATCH"
  ) {
    return Response.json({ ref: "refs/heads/feature" });
  }
  if (
    url === "https://api.github.com/repos/octocat/hello/git/refs/heads/main" &&
    method === "PATCH"
  ) {
    return Response.json({ ref: "refs/heads/main" });
  }
  if (
    url === "https://api.github.com/repos/octocat/hello/git/trees/base-tree-sha?recursive=1" &&
    method === "GET"
  ) {
    return Response.json({
      tree: [
        { path: "old/file.txt", mode: "100644", type: "blob", sha: "file-blob-sha" },
        { path: "other.txt", mode: "100644", type: "blob", sha: "other-sha" },
        { path: "rail/1-ordered/x", mode: "100644", type: "blob", sha: "rail-blob-sha" },
      ],
    });
  }
  if (url === "https://api.github.com/repos/octocat/hello/pulls" && method === "POST") {
    return Response.json(
      { number: 7, html_url: "https://github.com/octocat/hello/pull/7", draft: false },
      { status: 201 }
    );
  }
  if (
    url === "https://api.github.com/repos/octocat/hello/issues/7/assignees" &&
    method === "POST"
  ) {
    return Response.json({}, { status: 201 });
  }
  return undefined;
}

describe("git_put", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    authCalls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const res = githubRoute(url, init);
        if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
        return res;
      })
    );
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSpy.mockClear();
  });

  it("happy path: two files land in one commit and returns the sha", async () => {
    const env = stubEnv();
    const result = await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "feature",
      message: "add two files",
      files: [
        { path: "a.txt", content: "hello" },
        { path: "b.txt", content: "world!" },
      ],
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.sha).toBe("new-commit-sha");
    expect(payload.branch).toBe("feature");
    expect(payload.blob_urls).toHaveLength(2);

    // token must never appear in the returned payload
    expect(result.content[0].text).not.toContain("s3cr3t-token");
  });

  it("is refused, naming the repo, when the installation grant doesn't include it", async () => {
    const env = stubEnv();
    const result = await gitPut(env, props, ctx, {
      repo: "octocat/no-grant",
      branch: "feature",
      message: "should not land",
      files: [{ path: "a.txt", content: "hello" }],
    });

    expect("isError" in result ? result.isError : undefined).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("no-grant");
    expect(text).not.toContain("s3cr3t-token");
  });

  it("never logs the token, even on the audit row", async () => {
    const env = stubEnv();
    await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "feature",
      message: "add two files",
      files: [{ path: "a.txt", content: "hello" }],
    });

    const logged = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged.some((l: string) => l.includes("git_put"))).toBe(true);
    expect(logged.some((l: string) => l.includes("s3cr3t-token"))).toBe(false);
  });

  it("mints exactly {contents: write} scoped to just the named repo", async () => {
    const env = stubEnv();
    await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "feature",
      message: "add two files",
      files: [{ path: "a.txt", content: "hello" }],
    });

    expect(authCalls).toHaveLength(1);
    expect(authCalls[0]).toEqual({
      type: "installation",
      installationId: 42,
      repositoryNames: ["hello"],
      permissions: { contents: "write" },
    });
  });

  it("emits an audit row with outcome 'refused' and a reason when the repo isn't granted", async () => {
    const env = stubEnv();
    await gitPut(env, props, ctx, {
      repo: "octocat/no-grant",
      branch: "feature",
      message: "should not land",
      files: [{ path: "a.txt", content: "hello" }],
    });

    const logged = logSpy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
    const row = logged.find((l: { verb: string }) => l.verb === "git_put");
    expect(row).toBeDefined();
    expect(row.outcome).toBe("refused");
    expect(row.reason).toBe("repo_not_granted");
    expect(JSON.stringify(row)).not.toContain("s3cr3t-token");
  });

  it("stamps author and committer from the resolved GitHub user, not the App bot", async () => {
    const env = stubEnv();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const res = githubRoute(url, init);
      if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);

    await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "feature",
      message: "add a file",
      files: [{ path: "a.txt", content: "hello" }],
    });

    const commitCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === "https://api.github.com/repos/octocat/hello/git/commits" && (c[1] as RequestInit)?.method === "POST"
    );
    expect(commitCall).toBeDefined();
    const body = JSON.parse(String((commitCall![1] as RequestInit).body));
    expect(body.author).toEqual({ name: "octocat", email: "583231+octocat@users.noreply.github.com" });
    expect(body.committer).toEqual({ name: "octocat", email: "583231+octocat@users.noreply.github.com" });
  });

  it("refuses a non-rail path pushed directly to main, before any mint or GitHub call", async () => {
    const env = stubEnv();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const res = githubRoute(url, init);
      if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "main",
      message: "should not land",
      files: [{ path: "docs/x.md", content: "hello" }],
    });

    expect("isError" in result ? result.isError : undefined).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("docs/x.md");
    expect(text).toContain("main");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(authCalls).toHaveLength(0);
  });

  it("allows a rail-path write directly on main", async () => {
    const env = stubEnv();
    const result = await gitPut(env, props, ctx, {
      repo: "octocat/hello",
      branch: "main",
      message: "log journal entry",
      files: [{ path: "journal/2026-09-05-x.tsv", content: "hello" }],
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.branch).toBe("main");
  });

  it("emits an audit row with outcome 'refused' and reason 'mint_error' before rethrowing a non-404/422 mint failure", async () => {
    const env = stubEnv();
    await expect(
      gitPut(env, props, ctx, {
        repo: "octocat/mint-boom",
        branch: "feature",
        message: "should blow up",
        files: [{ path: "a.txt", content: "hello" }],
      })
    ).rejects.toThrow();

    const logged = logSpy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
    const row = logged.find((l: { verb: string }) => l.verb === "git_put");
    expect(row).toBeDefined();
    expect(row.outcome).toBe("refused");
    expect(row.reason).toBe("mint_error");
    expect(JSON.stringify(row)).not.toContain("s3cr3t-token");
  });
});

describe("git_move", () => {
  beforeEach(() => {
    authCalls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const res = githubRoute(url, init);
        if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
        return res;
      })
    );
  });

  it("happy path: renames a file in one commit and returns the sha", async () => {
    const env = stubEnv();
    const result = await gitMove(env, props, ctx, {
      repo: "octocat/hello",
      branch: "topic-branch",
      from: "old/file.txt",
      to: "new/file.txt",
      message: "move file",
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.sha).toBe("new-commit-sha");
    expect(payload.branch).toBe("topic-branch");
    expect(payload.from).toBe("old/file.txt");
    expect(payload.to).toBe("new/file.txt");
    expect(result.content[0].text).not.toContain("s3cr3t-token");
  });

  it("refuses explicitly when 'from' doesn't exist in the branch", async () => {
    const env = stubEnv();
    const result = await gitMove(env, props, ctx, {
      repo: "octocat/hello",
      branch: "topic-branch",
      from: "ghost.txt",
      to: "new/ghost.txt",
      message: "should not land",
    });

    expect("isError" in result ? result.isError : undefined).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("ghost.txt");
    expect(text).not.toContain("s3cr3t-token");
  });

  it("mints exactly {contents: write} scoped to just the named repo", async () => {
    const env = stubEnv();
    await gitMove(env, props, ctx, {
      repo: "octocat/hello",
      branch: "topic-branch",
      from: "old/file.txt",
      to: "new/file.txt",
      message: "move file",
    });

    expect(authCalls).toHaveLength(1);
    expect(authCalls[0]).toEqual({
      type: "installation",
      installationId: 42,
      repositoryNames: ["hello"],
      permissions: { contents: "write" },
    });
  });

  it("refuses a non-rail path pushed directly to main, before any mint", async () => {
    const env = stubEnv();
    const result = await gitMove(env, props, ctx, {
      repo: "octocat/hello",
      branch: "main",
      from: "old/file.txt",
      to: "new/file.txt",
      message: "should not land",
    });

    expect("isError" in result ? result.isError : undefined).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("old/file.txt");
    expect(text).toContain("main");
    expect(authCalls).toHaveLength(0);
  });

  it("allows a rail-path move directly on main", async () => {
    const env = stubEnv();
    const result = await gitMove(env, props, ctx, {
      repo: "octocat/hello",
      branch: "main",
      from: "rail/1-ordered/x",
      to: "rail/2-cooking/x",
      message: "advance rail item",
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.branch).toBe("main");
  });
});

describe("pr_open", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authCalls.length = 0;
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const res = githubRoute(url, init);
      if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("happy path: opens the PR and assigns the operator, never requests review", async () => {
    const env = stubEnv({ operatorLogin: "klappy" });
    const result = await prOpen(env, props, ctx, {
      repo: "octocat/hello",
      head: "feature",
      base: "main",
      title: "Add thing",
      body: "Does the thing.",
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.number).toBe(7);
    expect(payload.html_url).toBe("https://github.com/octocat/hello/pull/7");
    expect(result.content[0].text).not.toContain("s3cr3t-token");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://api.github.com/repos/octocat/hello/issues/7/assignees");
    expect(urls.some((u) => u.includes("requested_reviewers"))).toBe(false);
  });

  it("is refused, naming the repo, when the installation grant lacks pull_requests", async () => {
    const env = stubEnv({ operatorLogin: "klappy" });
    const result = await prOpen(env, props, ctx, {
      repo: "octocat/no-grant",
      head: "feature",
      base: "main",
      title: "Add thing",
      body: "should not land",
    });

    expect("isError" in result ? result.isError : undefined).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("no-grant");
    expect(text).not.toContain("s3cr3t-token");
  });

  it("mints exactly {contents: read, pull_requests: write} scoped to just the named repo", async () => {
    const env = stubEnv({ operatorLogin: "klappy" });
    await prOpen(env, props, ctx, {
      repo: "octocat/hello",
      head: "feature",
      base: "main",
      title: "Add thing",
      body: "Does the thing.",
    });

    expect(authCalls).toHaveLength(1);
    expect(authCalls[0]).toEqual({
      type: "installation",
      installationId: 42,
      repositoryNames: ["hello"],
      permissions: { contents: "read", pull_requests: "write" },
    });
  });

  it("still reports the PR as landed, with an assignee_warning, when assigning the operator fails", async () => {
    const env = stubEnv({ operatorLogin: "klappy" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSpy.mockClear();
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://api.github.com/repos/octocat/hello/issues/7/assignees" && init?.method === "POST") {
        return new Response("forbidden", { status: 403 });
      }
      const res = githubRoute(url, init);
      if (!res) throw new Error(`unstubbed fetch: ${init?.method ?? "GET"} ${url}`);
      return res;
    });

    const result = await prOpen(env, props, ctx, {
      repo: "octocat/hello",
      head: "feature",
      base: "main",
      title: "Add thing",
      body: "Does the thing.",
    });

    expect("isError" in result ? result.isError : undefined).toBeUndefined();
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.number).toBe(7);
    expect(payload.html_url).toBe("https://github.com/octocat/hello/pull/7");
    expect(payload.assignee_warning).toBeDefined();

    const logged = logSpy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
    const row = logged.find((l: { verb: string }) => l.verb === "pr_open");
    expect(row.outcome).toBe("landed");
    expect(row.assignee_warning).toBeDefined();
    logSpy.mockRestore();
  });
});
