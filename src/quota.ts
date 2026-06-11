/**
 * Quota: governance-driven metering. Vodka rule — this file knows HOW to
 * enforce; governance/external/tiers.md says WHAT. Tier numbers appear
 * nowhere in code.
 *
 * Policy resolution (canon: core-governance-baseline): live doc from the
 * repo's main branch (KV-cached) → bundled build-time snapshot → fail loud.
 * Every quota decision declares which tier served it (`governance_source`).
 *
 * Accounting (KV):
 *   quota:bucket:{login}        free-bucket remaining (lazy-init from policy)
 *   quota:tier:{login}          "solo" | "pro" | "team" | "fleet" (set by billing)
 *   quota:mint:{login}:{ts}:{r} append-only mint log, TTL 8 days
 *   quota:tok:{login}:{scope}   live-token record → same-scope re-mints are
 *                               cache hits and never count (doc promise)
 *
 * Caveat (documented in governance/internal/billing-architecture.md): KV is
 * eventually consistent; a racing burst can briefly exceed a window. The
 * weekly backstop and the GitHub-account boundary carry the abuse load.
 */

import bundledTiersDoc from "../governance/external/tiers.md";
import type { Env } from "./types";

export type GovernanceSource = "live" | "bundled";
export type TierId = "free" | "solo" | "pro" | "team" | "fleet";

export interface TierPolicy {
  freeBucket: number;
  /** per-window / weekly limits for paid tiers */
  paid: Record<string, { window: number; weekly: number }>;
  windowMs: number;
  weeklyMs: number;
  source: GovernanceSource;
}

const WINDOW_HOURS = 5;
const HOUR = 3_600_000;
const POLICY_CACHE_KEY = "quota:policy:cache";
const POLICY_CACHE_TTL = 300; // seconds; a doc edit on main reaches prod within this

/** Parse tier numbers out of the human-readable tiers.md — the same table
 *  the user reads is the one the server enforces. Throws on shape drift. */
export function parseTiersDoc(md: string, source: GovernanceSource): TierPolicy {
  const bucketMatch = md.match(/bucket of \*\*(\d+) mints? total\*\*/i);
  if (!bucketMatch) throw new Error("tiers.md: free bucket size not found");

  const paid: TierPolicy["paid"] = {};
  for (const row of md.matchAll(
    /^\|\s*(Solo|Pro|Team|Fleet)\s*\|\s*\*\*([\d,]+)\*\*\s*\|\s*([\d,]+)\s*\|/gim
  )) {
    const id = row[1].toLowerCase();
    paid[id] = {
      window: Number(row[2].replace(/,/g, "")),
      weekly: Number(row[3].replace(/,/g, "")),
    };
  }
  for (const t of ["solo", "pro", "team", "fleet"]) {
    if (!paid[t]) throw new Error(`tiers.md: tier row missing: ${t}`);
  }
  return {
    freeBucket: Number(bucketMatch[1]),
    paid,
    windowMs: WINDOW_HOURS * HOUR,
    weeklyMs: 7 * 24 * HOUR,
    source,
  };
}

/** live → bundled, with a short KV cache on the live fetch. */
export async function loadPolicy(env: Env): Promise<TierPolicy> {
  const base =
    env.GOVERNANCE_RAW_BASE ??
    "https://raw.githubusercontent.com/klappy/git-repo-auth-mcp/main";
  try {
    const cached = await env.OAUTH_KV.get(POLICY_CACHE_KEY);
    if (cached) return parseTiersDoc(cached, "live");
    const res = await fetch(`${base}/governance/external/tiers.md`, {
      headers: { "user-agent": "git-repo-auth-mcp" },
    });
    if (res.ok) {
      const text = await res.text();
      const policy = parseTiersDoc(text, "live"); // validate before caching
      await env.OAUTH_KV.put(POLICY_CACHE_KEY, text, { expirationTtl: POLICY_CACHE_TTL });
      return policy;
    }
  } catch {
    /* fall through to bundled */
  }
  return parseTiersDoc(bundledTiersDoc, "bundled");
}

/** Stable key for "same scope": same installation + repos + permissions. */
export async function scopeKey(
  installationId: number,
  repositories?: string[],
  permissions?: Record<string, string>
): Promise<string> {
  const canon = JSON.stringify({
    i: installationId,
    r: [...(repositories ?? [])].sort(),
    p: Object.entries(permissions ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MintRecord {
  ts: number;
}

async function listMints(env: Env, login: string, sinceMs: number): Promise<MintRecord[]> {
  const prefix = `quota:mint:${login}:`;
  const out: MintRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_KV.list({ prefix, cursor });
    for (const k of page.keys) {
      const ts = Number(k.name.slice(prefix.length).split(":")[0]);
      if (ts >= sinceMs) out.push({ ts });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => a.ts - b.ts);
}

/** What a counted check charged, so a failed mint can be refunded exactly. */
export interface MintCharge {
  mintKey: string;
  bucketCharged: boolean;
}

export interface QuotaOk {
  ok: true;
  cached: boolean;
  tier: TierId;
  remaining: number;
  window_reset_at?: string;
  weekly_remaining?: number;
  governance_source: GovernanceSource;
  /** Present on counted (non-cached) mints; hand back to refundMint on failure. */
  charge?: MintCharge;
}
export interface QuotaDenied {
  ok: false;
  tier: TierId;
  limit_hit: "bucket_empty" | "window" | "weekly";
  window_reset_at?: string;
  upgrade_url?: string;
  governance_source: GovernanceSource;
}
export type QuotaDecision = QuotaOk | QuotaDenied;

export async function getTier(env: Env, login: string): Promise<TierId> {
  const t = await env.OAUTH_KV.get(`quota:tier:${login}`);
  return t === "solo" || t === "pro" || t === "team" || t === "fleet" ? t : "free";
}

/**
 * The whole gate. Decides cached-vs-counted, enforces (when QUOTA_ENFORCE
 * is "true" — otherwise observes and always allows), and charges up front —
 * so concurrent checks see each other's spend instead of all passing against
 * the same stale counts. If GitHub then fails the mint, refundMint releases
 * the exact charge taken here — failed mints are free, by doc promise
 * (tiers.md).
 */
export async function checkMint(
  env: Env,
  login: string,
  scope: string,
  now = Date.now()
): Promise<QuotaDecision> {
  const policy = await loadPolicy(env);
  const tier = await getTier(env, login);
  const enforce = env.QUOTA_ENFORCE === "true";
  // Binding to a login happens in the /buy flow; the wall just points at pricing.
  const upgrade_url = env.STRIPE_UPGRADE_URL;

  // Same-scope re-request while a token is alive: free, by doc promise.
  const live = await env.OAUTH_KV.get(`quota:tok:${login}:${scope}`);
  if (live && Number(live) > now + 120_000) {
    const snapshot = await usageSnapshot(env, policy, tier, login, now);
    return { ok: true, cached: true, governance_source: policy.source, ...snapshot };
  }

  if (tier === "free") {
    const raw = await env.OAUTH_KV.get(`quota:bucket:${login}`);
    const remaining = raw === null ? policy.freeBucket : Number(raw);
    if (remaining <= 0 && enforce) {
      return { ok: false, tier, limit_hit: "bucket_empty", upgrade_url, governance_source: policy.source };
    }
    const next = Math.max(0, remaining - 1);
    await env.OAUTH_KV.put(`quota:bucket:${login}`, String(next));
    const mintKey = await recordMint(env, login, now);
    return {
      ok: true,
      cached: false,
      tier,
      remaining: next,
      governance_source: policy.source,
      charge: { mintKey, bucketCharged: true },
    };
  }

  const limits = policy.paid[tier];
  const mints = await listMints(env, login, now - policy.weeklyMs);
  const inWindow = mints.filter((m) => m.ts >= now - policy.windowMs);
  if (enforce && inWindow.length >= limits.window) {
    return {
      ok: false,
      tier,
      limit_hit: "window",
      window_reset_at: new Date(inWindow[0].ts + policy.windowMs).toISOString(),
      upgrade_url,
      governance_source: policy.source,
    };
  }
  if (enforce && mints.length >= limits.weekly) {
    return {
      ok: false,
      tier,
      limit_hit: "weekly",
      window_reset_at: new Date(mints[0].ts + policy.weeklyMs).toISOString(),
      upgrade_url,
      governance_source: policy.source,
    };
  }
  const mintKey = await recordMint(env, login, now);
  return {
    ok: true,
    cached: false,
    tier,
    remaining: Math.max(0, limits.window - inWindow.length - 1),
    window_reset_at: new Date((inWindow[0]?.ts ?? now) + policy.windowMs).toISOString(),
    weekly_remaining: Math.max(0, limits.weekly - mints.length - 1),
    governance_source: policy.source,
    charge: { mintKey, bucketCharged: false },
  };
}

/**
 * Release the charge a check took, because GitHub refused the mint (dead
 * installation, permission mismatch, outage). Uses the recorded charge —
 * not a re-read of tier, which billing webhooks may have changed in flight —
 * so exactly what was charged is what gets refunded.
 */
export async function refundMint(env: Env, login: string, charge: MintCharge): Promise<void> {
  await env.OAUTH_KV.delete(charge.mintKey);
  if (charge.bucketCharged) {
    const raw = await env.OAUTH_KV.get(`quota:bucket:${login}`);
    if (raw !== null) {
      // Cap at the bucket size: a retried or duplicated refund must never
      // inflate the bucket past what the doc grants.
      const policy = await loadPolicy(env);
      await env.OAUTH_KV.put(
        `quota:bucket:${login}`,
        String(Math.min(policy.freeBucket, Number(raw) + 1))
      );
    }
  }
}

async function usageSnapshot(
  env: Env,
  policy: TierPolicy,
  tier: TierId,
  login: string,
  now: number
): Promise<{ tier: TierId; remaining: number; window_reset_at?: string; weekly_remaining?: number }> {
  if (tier === "free") {
    const raw = await env.OAUTH_KV.get(`quota:bucket:${login}`);
    return { tier, remaining: raw === null ? policy.freeBucket : Number(raw) };
  }
  const limits = policy.paid[tier];
  const mints = await listMints(env, login, now - policy.weeklyMs);
  const inWindow = mints.filter((m) => m.ts >= now - policy.windowMs);
  return {
    tier,
    remaining: Math.max(0, limits.window - inWindow.length),
    window_reset_at: inWindow[0]
      ? new Date(inWindow[0].ts + policy.windowMs).toISOString()
      : undefined,
    weekly_remaining: Math.max(0, limits.weekly - mints.length),
  };
}

async function recordMint(env: Env, login: string, now: number): Promise<string> {
  const key = `quota:mint:${login}:${String(now).padStart(14, "0")}:${crypto.randomUUID().slice(0, 8)}`;
  await env.OAUTH_KV.put(key, "1", { expirationTtl: 8 * 24 * 3600 });
  return key;
}

/** Called after a successful mint so same-scope re-requests become cache hits. */
export async function recordLiveToken(
  env: Env,
  login: string,
  scope: string,
  expiresAtIso: string
): Promise<void> {
  const expMs = Date.parse(expiresAtIso);
  const ttl = Math.max(60, Math.floor((expMs - Date.now()) / 1000));
  await env.OAUTH_KV.put(`quota:tok:${login}:${scope}`, String(expMs), { expirationTtl: ttl });
}
