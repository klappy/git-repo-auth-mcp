#!/usr/bin/env node
/**
 * Captures the deploying commit into src/build-info.json before bundling
 * (issue #8, phase 1). Run as the Workers Builds build command, or via
 * `npm run deploy`. The committed file is a placeholder ("unknown") so the
 * bundle never breaks; this script overwrites it in the build environment
 * and the overwrite is never committed back.
 *
 * Deterministic on purpose: commit + branch only, no timestamps — phase 2
 * (reproducible builds) needs byte-identical output for identical commits.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function git(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const commit =
  process.env.WORKERS_CI_COMMIT_SHA || // Cloudflare Workers Builds
  process.env.GITHUB_SHA ||            // GitHub Actions
  git("git rev-parse HEAD") ||
  "unknown";

const branch =
  process.env.WORKERS_CI_BRANCH ||
  process.env.GITHUB_REF_NAME ||
  git("git rev-parse --abbrev-ref HEAD") ||
  "unknown";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "build-info.json");
writeFileSync(out, JSON.stringify({ commit, branch, source: "build" }, null, 2) + "\n");
console.log(`build-info: ${commit} (${branch}) -> src/build-info.json`);
