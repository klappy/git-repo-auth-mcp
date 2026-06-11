/**
 * Deployment provenance: /.well-known/provenance (issue #8, phase 1).
 *
 * Returns the commit SHA this deployment was built from, as a
 * machine-readable chain-of-custody record. The SHA is captured at build
 * time by scripts/build-info.mjs (from WORKERS_CI_COMMIT_SHA in Cloudflare
 * Workers Builds, GITHUB_SHA in Actions, or local git) and bundled in.
 *
 * Honesty contract — stated in the payload itself: this is BUILD-ASSERTED.
 * A worker controls its own answers, so this endpoint cannot
 * cryptographically prove the live bytes match the named commit; it
 * documents what the build pipeline recorded. Phases 2–3 of issue #8
 * (reproducible builds + Sigstore attestation cross-checks) narrow the
 * remaining trust to "Cloudflare deploys what the build produced."
 */

import buildInfo from "./build-info.json";

const REPO_URL = "https://github.com/klappy/git-repo-auth-mcp";

export function provenanceResponse(): Response {
  const commit = buildInfo.commit ?? "unknown";
  const known = commit !== "unknown";
  return new Response(
    JSON.stringify(
      {
        repository: REPO_URL,
        commit,
        branch: buildInfo.branch ?? "unknown",
        source: buildInfo.source ?? "placeholder",
        commit_url: known ? `${REPO_URL}/commit/${commit}` : null,
        claim:
          "build-asserted chain of custody: the build pipeline recorded this " +
          "commit. Not cryptographic proof that the live bytes match it. " +
          "See " + REPO_URL + "/issues/8 for the verifiable-builds roadmap.",
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
