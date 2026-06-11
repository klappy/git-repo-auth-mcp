/**
 * The docs tool surface (P0004 docs-proxy convention): serve
 * governance/external/ verbatim so the user's model can read the same
 * documents the server enforces. Live → bundled, same resolution as quota
 * policy; the response says which tier served it.
 */

import bundledTiers from "../governance/external/tiers.md";
import bundledTransparency from "../governance/external/quota-transparency.md";
import bundledGettingStarted from "../governance/external/getting-started.md";
import bundledPrivacy from "../governance/external/privacy-policy.md";
import bundledTerms from "../governance/external/terms-of-service.md";
import bundledStance from "../governance/external/prompt-injection-stance.md";
import type { Env } from "./types";

const DOCS: Record<string, { bundled: string; about: string }> = {
  "tiers.md": { bundled: bundledTiers, about: "tier limits, free bucket, windows, pricing" },
  "quota-transparency.md": {
    bundled: bundledTransparency,
    about: "response fields, remaining, window_reset_at, cached, agent guidance",
  },
  "getting-started.md": {
    bundled: bundledGettingStarted,
    about: "onboarding, first run, connect, create a sandbox repo, demo",
  },
  "privacy-policy.md": {
    bundled: bundledPrivacy,
    about: "privacy, data collection, storage, retention, third parties, deletion",
  },
  "terms-of-service.md": {
    bundled: bundledTerms,
    about: "terms, billing, refunds, prorated upgrades, liability, governing law",
  },
  "prompt-injection-stance.md": {
    bundled: bundledStance,
    about: "security, prompt injection, threat model, read-only default, kill switch",
  },
};

/** Resolve one document by exact name: live from main, bundled fallback. */
export async function fetchDoc(
  env: Env,
  name: string
): Promise<{ text: string; source: "live" | "bundled" }> {
  const base =
    env.GOVERNANCE_RAW_BASE ??
    "https://raw.githubusercontent.com/klappy/git-repo-auth-mcp/main";
  try {
    const res = await fetch(`${base}/governance/external/${name}`, {
      headers: { "user-agent": "git-repo-auth-mcp" },
    });
    if (res.ok) return { text: await res.text(), source: "live" };
  } catch {
    /* bundled below */
  }
  return { text: DOCS[name].bundled, source: "bundled" };
}

export function listDocs(): Array<{ name: string; about: string }> {
  return Object.entries(DOCS).map(([name, d]) => ({ name, about: d.about }));
}

export async function getDocs(
  env: Env,
  query: string
): Promise<Array<{ name: string; source: "live" | "bundled"; text: string }>> {
  const q = query.toLowerCase();
  const names = Object.keys(DOCS).filter(
    (name) => name.includes(q) || DOCS[name].about.includes(q) || q.includes(name.replace(".md", ""))
  );
  const chosen = (names.length > 0 ? names : Object.keys(DOCS)).slice(0, 2);
  const base =
    env.GOVERNANCE_RAW_BASE ??
    "https://raw.githubusercontent.com/klappy/git-repo-auth-mcp/main";
  return Promise.all(
    chosen.map(async (name) => {
      try {
        const res = await fetch(`${base}/governance/external/${name}`, {
          headers: { "user-agent": "git-repo-auth-mcp" },
        });
        if (res.ok) return { name, source: "live" as const, text: await res.text() };
      } catch {
        /* bundled below */
      }
      return { name, source: "bundled" as const, text: DOCS[name].bundled };
    })
  );
}
