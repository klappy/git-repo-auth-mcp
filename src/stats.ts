/**
 * Operator observability. Vodka rule — this file knows HOW to count;
 * governance/internal/operator-observability.md says WHAT the counts mean.
 * The definitions there are the contract; change the document first.
 *
 * Aggregates only: counts are computed at request time from records the
 * privacy policy already enumerates, and no per-user data leaves the worker.
 * That is what keeps this surface inside the existing policy (no amendment).
 *
 * Counting (KV, by prefix):
 *   grant:{login}:{grantId}      provider grant records → connected users
 *   quota:mint:{login}:{ts}:{r}  8-day mint log         → active users
 *   quota:tier:{login}           set by billing          → paid users
 *
 * KV `list` is paginated and eventually consistent; fine at current scale
 * (revisit alongside the Durable Object counter swap, per the governance doc).
 * Stripe is the source of truth for subscriptions: the paid count is
 * cross-checked against live active subscriptions, and disagreement is
 * surfaced in the response — never silently reconciled.
 */

import type { Env } from "./types";

/** Distinct logins for a KV key prefix, where the login is the segment
 *  immediately after the prefix. Walks the full (paginated) listing. */
async function distinctLogins(kv: KVNamespace, prefix: string): Promise<Set<string>> {
  const logins = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) {
      const rest = key.name.slice(prefix.length);
      const login = rest.includes(":") ? rest.slice(0, rest.indexOf(":")) : rest;
      if (login) logins.add(login);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return logins;
}

/** Count Stripe subscriptions with status=active. Undefined when billing is
 *  not configured or Stripe is unreachable — absence is reported, not faked. */
async function stripeActiveSubscriptions(env: Env): Promise<number | undefined> {
  if (!env.STRIPE_SECRET_KEY) return undefined;
  let count = 0;
  let startingAfter: string | undefined;
  try {
    do {
      const params = new URLSearchParams({ status: "active", limit: "100" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
        headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as {
        data: Array<{ id: string }>;
        has_more: boolean;
      };
      count += body.data.length;
      startingAfter = body.has_more ? body.data[body.data.length - 1]?.id : undefined;
    } while (startingAfter);
    return count;
  } catch {
    return undefined;
  }
}

export interface OperatorStats {
  connected_users: number;
  active_users_8d: number;
  paid_users: number;
  crude_conversion_ratio: number | null;
  stripe_active_subscriptions?: number;
  /** Present only when KV's paid count and Stripe's disagree. */
  discrepancy?: string;
  definitions: string;
}

/** Compute the aggregate counts defined in operator-observability.md. */
export async function computeStats(env: Env): Promise<OperatorStats> {
  const [connected, active, paidTiers, stripeActive] = await Promise.all([
    distinctLogins(env.OAUTH_KV, "grant:"),
    distinctLogins(env.OAUTH_KV, "quota:mint:"),
    distinctLogins(env.OAUTH_KV, "quota:tier:"),
    stripeActiveSubscriptions(env),
  ]);

  const stats: OperatorStats = {
    connected_users: connected.size,
    active_users_8d: active.size,
    paid_users: paidTiers.size,
    crude_conversion_ratio:
      connected.size > 0 ? Math.round((paidTiers.size / connected.size) * 1000) / 1000 : null,
    definitions: "governance/internal/operator-observability.md",
  };
  if (stripeActive !== undefined) {
    stats.stripe_active_subscriptions = stripeActive;
    if (stripeActive !== paidTiers.size) {
      stats.discrepancy =
        `KV reports ${paidTiers.size} paid login(s); Stripe reports ${stripeActive} active ` +
        `subscription(s). Stripe is the source of truth — investigate the webhook path.`;
    }
  }
  return stats;
}

/** The stats surface exists only for the configured operator. */
export function isOperator(env: Env, login: string): boolean {
  return Boolean(env.OPERATOR_LOGIN) && login === env.OPERATOR_LOGIN;
}
