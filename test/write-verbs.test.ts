import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: () => async (opts: { repositoryNames?: string[] }) => {
    if (opts.repositoryNames?.includes("no-grant")) {
      const err = new Error("Not Found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return { token: "s3cr3t-token", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  },
}));

vi.mock("./billing", () => ({ emitMeterEvent: async () => {} }));

import { __testables } from "../src/write-verbs";
import type { Env, GrantProps } from "../src/types";

const { gitPut } = __testables;

function stubEnv(): Env {
  const store = new Map<string, string>();
  return {
    GH_APP_ID: "1",
    GH_APP_PRIVATE_KEY: "unused-because-createAppAuth-is-mocked",
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
  if (url === "https://api.github.com/repos/octocat/hello" && method === "GET") {
    return Response.json({ default_branch: "main" });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/ref/heads/main" && method === "GET") {
    return Response.json({ object: { sha: "base-sha" } });
  }
  if (url === "https://api.github.com/repos/octocat/hello/git/ref/heads/feature" && method === "GET") {
    return new Response("not found", { status: 404 });
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
  return undefined;
}

describe("git_put", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
});
