// Deploy-time key rotation — the crew-reachable provisioning path for the
// machine credential (captain ruling 2026-07-14, ars-gitauth-mint-credential
// option 1). Runs as the tail of `npm run deploy` inside Workers Builds,
// where Cloudflare injects CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID for
// wrangler; we spend the same token on the secrets API.
//
// On every MAIN deploy:
//   1. Generates a fresh 256-bit key (never printed, never stored on disk).
//   2. PUTs it as secret ARS_SERVICE_KEY on this worker (git-repo-auth-mcp).
//   3. PUTs it as secret GIT_REPO_AUTH_TOKEN on the `ars` worker.
// Rotation IS the deploy: no human ever knows the key; both sides converge
// within one build. Storage location: Cloudflare Worker secrets on both
// workers — nowhere else.
//
// Fail-loud: a failed PUT fails the build visibly. Skips cleanly (exit 0)
// when run locally (no CLOUDFLARE_API_TOKEN) or on non-main branches.
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
let localBranch;
try {
  localBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
} catch {
  localBranch = null;
}
const branch =
  process.env.WORKERS_CI_BRANCH || process.env.GITHUB_REF_NAME || localBranch || "unknown";

if (!token || !account) {
  console.log("provision: no Cloudflare API credentials in env — skipping (local run).");
  process.exit(0);
}
if (branch !== "main") {
  console.log(`provision: branch '${branch}' is not main — skipping rotation.`);
  process.exit(0);
}

const key = crypto.randomBytes(32).toString("base64url");

async function putSecret(script, name) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}/secrets`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name, text: key, type: "secret_text" }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(
      `provision: PUT secret ${name} on ${script} failed: HTTP ${res.status} ` +
        JSON.stringify(body.errors ?? [])
    );
  }
  console.log(`provision: rotated secret ${name} on worker '${script}'.`);
}

await putSecret("git-repo-auth-mcp", "ARS_SERVICE_KEY");
await putSecret("ars", "GIT_REPO_AUTH_TOKEN");
console.log("provision: machine-credential rotation complete.");
