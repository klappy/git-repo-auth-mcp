import { describe, expect, it } from "vitest";
import {
  auditRow,
  checkGrant,
  checkMainAllowlist,
  isRailPath,
  redact,
  requiredPermissions,
} from "../src/write";

describe("requiredPermissions — mint-scope equals write-scope", () => {
  it("git_put / git_move need exactly contents:write", () => {
    expect(requiredPermissions("git_put")).toEqual({ contents: "write" });
    expect(requiredPermissions("git_move")).toEqual({ contents: "write" });
  });
  it("pr_open needs pull_requests:write plus contents:read to resolve head", () => {
    expect(requiredPermissions("pr_open")).toEqual({ contents: "read", pull_requests: "write" });
  });
});

describe("checkGrant — refuse before minting, name the gap", () => {
  const grant = { contents: "write", metadata: "read", pull_requests: "write" };

  it("passes when the grant covers the verb", () => {
    expect(checkGrant("git_put", grant, "kitchen")).toBeNull();
    expect(checkGrant("pr_open", grant, "kitchen")).toBeNull();
  });
  it("names every missing permission as name:level", () => {
    expect(checkGrant("git_put", { contents: "read" }, "kitchen")).toEqual({
      refusal: "missing_permission",
      missing: ["contents:write"],
    });
    expect(checkGrant("pr_open", { contents: "read" }, "kitchen")).toEqual({
      refusal: "missing_permission",
      missing: ["pull_requests:write"],
    });
    expect(checkGrant("pr_open", {}, "kitchen")).toEqual({
      refusal: "missing_permission",
      missing: ["contents:read", "pull_requests:write"],
    });
  });
  it("admin satisfies write; write satisfies read", () => {
    expect(checkGrant("git_put", { contents: "admin" }, "kitchen")).toBeNull();
    expect(checkGrant("pr_open", { contents: "write", pull_requests: "write" }, "kitchen")).toBeNull();
  });
  it("refuses a repo outside the installation's selection, before permissions", () => {
    expect(checkGrant("git_put", { contents: "read" }, "other", ["kitchen"])).toEqual({
      refusal: "repo_not_granted",
      repo: "other",
    });
    expect(checkGrant("git_put", grant, "kitchen", undefined)).toBeNull();
  });
});

describe("main-direct allowlist — rail/** and journal/** only", () => {
  it("recognises rail paths and rejects the rest", () => {
    expect(isRailPath("rail/2-cooking/x/RESULTS.md")).toBe(true);
    expect(isRailPath("journal/2026-09-27/cook.tsv")).toBe(true);
    expect(isRailPath("./journal/2026-09-27/cook.tsv")).toBe(true);
    expect(isRailPath("src/index.ts")).toBe(false);
    expect(isRailPath("railroad/x.md")).toBe(false);
    expect(isRailPath("rail/")).toBe(false);
    expect(isRailPath("rail/../src/index.ts")).toBe(false);
  });
  it("only bites on the default branch", () => {
    expect(checkMainAllowlist("dish/x", "main", ["src/index.ts"])).toBeNull();
    expect(checkMainAllowlist("main", "main", ["journal/a.tsv", "rail/x/CLAIM.md"])).toBeNull();
    expect(checkMainAllowlist("main", "main", ["journal/a.tsv", "src/index.ts", "README.md"])).toEqual({
      refusal: "main_protected",
      paths: ["src/index.ts", "README.md"],
    });
  });
});

describe("audit row — who, repo, branch, paths, outcome; never a token", () => {
  it("formats a landed row", () => {
    expect(
      auditRow({
        verb: "git_put",
        login: "klappy",
        repo: "klappy/kitchen",
        branch: "main",
        paths: ["journal/2026-09-27/cook.tsv"],
        outcome: "landed",
        sha: "abc123",
      })
    ).toBe(
      "audit verb=git_put login=klappy repo=klappy/kitchen branch=main paths=1:journal/2026-09-27/cook.tsv outcome=landed sha=abc123"
    );
  });
  it("formats a refused row and an upstream row", () => {
    expect(
      auditRow({ verb: "git_move", login: "klappy", repo: "klappy/kitchen", branch: "main", paths: ["rail/1-ordered/x>rail/2-cooking/x"], outcome: "refused", refusal: "missing_permission" })
    ).toMatch(/^audit verb=git_move .* outcome=refused refusal=missing_permission$/);
    expect(
      auditRow({ verb: "pr_open", login: "klappy", repo: "klappy/klappy.dev", branch: "main", paths: ["dish/x"], outcome: "upstream", status: 403 })
    ).toMatch(/outcome=upstream status=403$/);
  });
  it("redacts anything token-shaped that leaks into a free-text field", () => {
    const row = auditRow({
      verb: "git_put",
      login: "klappy",
      repo: "klappy/kitchen",
      branch: "ghs_ABCdef123_shouldnotappear",
      paths: ["Bearer ghp_zzz"],
      outcome: "refused",
      refusal: "main_protected",
    });
    expect(row).not.toMatch(/ghs_|ghp_|Bearer/);
    expect(redact("x ghs_1234abcd y")).toBe("x [redacted] y");
  });
});

describe("docs tool answers \"write verbs\" with the contract", () => {
  it("ranks write-verbs.md first for the ticket's query", async () => {
    const { rankByQuery } = await import("../src/match");
    const catalog = [
      { name: "tiers.md", about: "tier limits, free bucket, windows, pricing" },
      { name: "identity-and-attribution.md", about: "commit attribution, PR authorship, co-authors, assign/review/mention, putting the operator on the work" },
      { name: "write-verbs.md", about: "write verbs, git_put, git_move, pr_open, landing work, scope law, refusal cases, audit row, main allowlist" },
    ];
    expect(rankByQuery("write verbs", catalog)[0]?.name).toBe("write-verbs.md");
    expect(rankByQuery("git_put refusal", catalog)[0]?.name).toBe("write-verbs.md");
  });
});
