/**
 * Write verbs for /mcp — slice 1: git_put. The read path (github_token)
 * hands a raw token to the caller's sandbox; write verbs exist because that
 * sandbox often cannot reach api.github.com itself (proxy-walled). The Worker
 * mints the token and performs the GitHub REST calls itself, so the token
 * never leaves this process.
 *
 * Same metering as github_token: checkMint/refundMint from src/quota.ts,
 * one mint per call, scoped to exactly the repo named in the request — never
 * the whole installation. GitHub still enforces the installation grant as the
 * hard ceiling; a repo outside that grant is refused explicitly, never
 * silently dropped from the write.
 */

import { createAppAuth, type InstallationAccessTokenAuthentication } from "@octokit/auth-app";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizePrivateKey } from "./keys";
import { checkMint, recordLiveToken, refundMint, scopeKey } from "./quota";
import { emitMeterEvent } from "./billing";
import type { Env, GrantProps } from "./types";

type AppAuth = ReturnType<typeof createAppAuth>;

let appAuth: AppAuth | undefined;

function getAppAuth(env: Env): AppAuth {
  if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
    throw new Error("Missing GH_APP_ID / GH_APP_PRIVATE_KEY secrets.");
  }
  appAuth ??= createAppAuth({
    appId: env.GH_APP_ID,
    privateKey: normalizePrivateKey(env.GH_APP_PRIVATE_KEY),
  });
  return appAuth;
}

function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

function toolJsonError(payload: unknown) {
  return toolError(JSON.stringify(payload, null, 2));
}

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "git-repo-auth-mcp",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function refusal(res: Response, action: string) {
  let detail = "";
  try {
    detail = JSON.stringify(await res.json());
  } catch {
    /* body wasn't JSON or already consumed */
  }
  const hint =
    res.status === 403
      ? "The minted token lacks permission for this — check the repo is included in the installation grant with 'contents:write'."
      : res.status === 404
        ? "Not found — check the repo name, branch/base, or that this installation has access to that repository."
        : "GitHub rejected the request.";
  return toolJsonError({
    error: "github_request_failed",
    action,
    status: res.status,
    detail,
    hint,
  });
}

const filesShape = z
  .array(
    z.object({
      path: z.string().describe("Destination path in the repo, e.g. 'src/foo.ts'."),
      content: z
        .string()
        .optional()
        .describe("UTF-8 file content. Required in this slice (renames-without-content are git_move, not yet built)."),
      from_path: z
        .string()
        .optional()
        .describe("Original path this replaces (rename+edit); paired with 'content'."),
      mode: z
        .string()
        .optional()
        .describe('Git file mode, e.g. "100644" (default) or "100755" for executable.'),
    })
  )
  .min(1);

const gitPutInputShape = {
  repo: z.string().describe('"owner/name" — must be within this connection\'s installation grant.'),
  branch: z.string().describe("Branch to create (if absent) or update."),
  base: z
    .string()
    .optional()
    .describe("Base branch to create 'branch' from when it doesn't exist yet. Defaults to the repo's default branch."),
  message: z.string().describe("Commit message."),
  files: filesShape,
};

type GitPutInput = {
  repo: string;
  branch: string;
  base?: string;
  message: string;
  files: Array<{ path: string; content?: string; from_path?: string; mode?: string }>;
};

async function gitPut(env: Env, props: GrantProps, ctx: ExecutionContext, input: GitPutInput) {
  const parts = input.repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return toolError(`'repo' must be "owner/name", got '${input.repo}'.`);
  }
  const [owner, name] = parts;

  const scope = await scopeKey(props.installationId, [name], { contents: "write" });
  const decision = await checkMint(env, props.login, scope);
  if (!decision.ok) {
    return toolJsonError({
      error: "quota_exceeded",
      limit_hit: decision.limit_hit,
      tier: decision.tier,
      ...(decision.window_reset_at ? { window_reset_at: decision.window_reset_at } : {}),
      ...(decision.upgrade_url ? { upgrade_url: decision.upgrade_url } : {}),
      governance_source: decision.governance_source,
    });
  }

  const auth = getAppAuth(env);
  let minted: InstallationAccessTokenAuthentication;
  try {
    minted = (await auth({
      type: "installation",
      installationId: props.installationId,
      repositoryNames: [name],
      permissions: { contents: "write" },
    })) as InstallationAccessTokenAuthentication;
  } catch (err) {
    if (decision.charge) {
      ctx.waitUntil(refundMint(env, props.login, decision.charge));
    }
    const status = (err as { status?: number } | null)?.status;
    if (status === 404 || status === 422) {
      return toolJsonError({
        error: "repo_not_granted",
        detail:
          `This connection's installation grant does not include '${input.repo}', or the App lacks ` +
          `'contents:write' on it. Your grant, not wider — request access to that repo (or the ` +
          `permission) in the GitHub App installation settings.`,
      });
    }
    throw err;
  }

  if (!decision.cached) {
    ctx.waitUntil(recordLiveToken(env, props.login, scope, minted.expiresAt));
    ctx.waitUntil(emitMeterEvent(env, props.login));
  }

  const token = minted.token;

  let base = input.base;
  if (!base) {
    const repoRes = await gh(token, `/repos/${owner}/${name}`);
    if (!repoRes.ok) return refusal(repoRes, "read repository metadata");
    const repoJson = (await repoRes.json()) as { default_branch: string };
    base = repoJson.default_branch;
  }

  const baseRefRes = await gh(token, `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(base)}`);
  if (!baseRefRes.ok) return refusal(baseRefRes, `resolve base branch '${base}'`);
  const baseRef = (await baseRefRes.json()) as { object: { sha: string } };
  const baseSha = baseRef.object.sha;

  let parentSha: string;
  const branchRefRes = await gh(
    token,
    `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(input.branch)}`
  );
  if (branchRefRes.status === 404) {
    const createRes = await gh(token, `/repos/${owner}/${name}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: baseSha }),
    });
    if (!createRes.ok) return refusal(createRes, `create branch '${input.branch}'`);
    parentSha = baseSha;
  } else if (branchRefRes.ok) {
    const branchRef = (await branchRefRes.json()) as { object: { sha: string } };
    parentSha = branchRef.object.sha;
  } else {
    return refusal(branchRefRes, `check branch '${input.branch}'`);
  }

  const parentCommitRes = await gh(token, `/repos/${owner}/${name}/git/commits/${parentSha}`);
  if (!parentCommitRes.ok) return refusal(parentCommitRes, "read parent commit");
  const parentCommit = (await parentCommitRes.json()) as { tree: { sha: string } };

  type TreeEntry = { path: string; mode: string; type: "blob"; sha: string | null };
  const treeEntries: TreeEntry[] = [];
  const blobUrls: string[] = [];

  for (const file of input.files) {
    if (file.from_path && file.from_path !== file.path) {
      treeEntries.push({ path: file.from_path, mode: "100644", type: "blob", sha: null });
    }
    if (file.content === undefined) {
      return toolError(
        `File '${file.path}' has no 'content'. git_put writes content directly; a rename without ` +
          `content edits is git_move (not built in this slice).`
      );
    }
    const blobRes = await gh(token, `/repos/${owner}/${name}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) return refusal(blobRes, `create blob for '${file.path}'`);
    const blob = (await blobRes.json()) as { sha: string; url: string };
    treeEntries.push({ path: file.path, mode: file.mode ?? "100644", type: "blob", sha: blob.sha });
    blobUrls.push(blob.url);
  }

  const treeRes = await gh(token, `/repos/${owner}/${name}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries }),
  });
  if (!treeRes.ok) return refusal(treeRes, "create tree");
  const tree = (await treeRes.json()) as { sha: string };

  const commitRes = await gh(token, `/repos/${owner}/${name}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [parentSha] }),
  });
  if (!commitRes.ok) return refusal(commitRes, "create commit");
  const commit = (await commitRes.json()) as { sha: string };

  const updateRes = await gh(
    token,
    `/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(input.branch)}`,
    { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) }
  );
  if (!updateRes.ok) return refusal(updateRes, `update branch '${input.branch}'`);

  console.log(
    JSON.stringify({
      verb: "git_put",
      login: props.login,
      repo: input.repo,
      branch: input.branch,
      paths: input.files.map((f) => f.path),
      sha: commit.sha,
    })
  );

  const payload = { sha: commit.sha, branch: input.branch, blob_urls: blobUrls };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function registerWriteVerbs(
  server: McpServer,
  env: Env,
  props: GrantProps,
  ctx: ExecutionContext
): void {
  server.registerTool(
    "git_put",
    {
      title: "Write a commit",
      annotations: {
        title: "Write a commit",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      description:
        `Write one commit to a branch in a repo — the Worker mints a 'contents:write' token ` +
        `server-side and calls the GitHub REST API itself, so this works even when the calling ` +
        `sandbox cannot reach api.github.com directly. Creates 'branch' from 'base' (default: the ` +
        `repo's default branch) if it doesn't exist yet, then commits all 'files' in one commit and ` +
        `fast-forwards the branch to it. Your grant, not wider: the repo must be inside this ` +
        `connection's installation grant, or the call is refused by name — never silently dropped. ` +
        `The token itself never appears in the response.`,
      inputSchema: gitPutInputShape,
    },
    async (input) => gitPut(env, props, ctx, input)
  );
}

export const __testables = { gitPut };
