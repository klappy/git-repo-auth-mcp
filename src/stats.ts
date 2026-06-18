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
 * Operator-owned grants (the operator login plus any configured test logins)
 * are netted out of the headline counts: they are real KV records but they are
 * not adoption, and counting them produces a recurring false "+1 outside user"
 * read. Raw counts and the netting amount are reported alongside, never instead,
 * so the test grant stays observable while never inflating the headline.
 *
 * KV `list` is paginated and eventually consistent; fine at current scale
 * (revisit alongside the Durable Object counter swap, per the governance doc).
 * Stripe is the source of truth for subscriptions: the paid count is
 * cross-checked against live active subscriptions, and disagreement is
 * surfaced in the response — never silently reconciled. The cross-check uses
 * the RAW paid count, because the operator's own dogfooding subscription is a
 * real Stripe subscription; comparing net paid (which excludes the operator)
 * against Stripe would manufacture a permanent false discrepancy.
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

/** The operator-owned exclusion set: OPERATOR_LOGIN plus any TEST_LOGINS.
 *  Configured, never hardcoded. */
function operatorOwnedLogins(env: Env): Set<string> {
  const set = new Set<string>();
  if (env.OPERATOR_LOGIN) set.add(env.OPERATOR_LOGIN);
  if (env.TEST_LOGINS) {
    for (const login of env.TEST_LOGINS.split(",").map((s) => s.trim()).filter(Boolean)) {
      set.add(login);
    }
  }
  return set;
}

/** Count of `logins` after removing the excluded (operator-owned) set. */
function netSize(logins: Set<string>, excluded: Set<string>): number {
  let n = 0;
  for (const login of logins) if (!excluded.has(login)) n++;
  return n;
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
  /** Net of operator-owned grants — this is the external-adoption number. */
  connected_users: number;
  /** Including operator-owned grants. */
  connected_users_raw: number;
  /** Net of operator-owned grants. */
  active_users_8d: number;
  active_users_8d_raw: number;
  /** Net of operator-owned grants. */
  paid_users: number;
  paid_users_raw: number;
  /** How many operator-owned grants were netted out of the connected count. */
  operator_owned_grants: number;
  /** net paid ÷ net connected. */
  crude_conversion_ratio: number | null;
  stripe_active_subscriptions?: number;
  /** Present only when the RAW paid count and Stripe's disagree. */
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

  const excluded = operatorOwnedLogins(env);
  const connectedNet = netSize(connected, excluded);
  const activeNet = netSize(active, excluded);
  const paidNet = netSize(paidTiers, excluded);

  const stats: OperatorStats = {
    connected_users: connectedNet,
    connected_users_raw: connected.size,
    active_users_8d: activeNet,
    active_users_8d_raw: active.size,
    paid_users: paidNet,
    paid_users_raw: paidTiers.size,
    operator_owned_grants: connected.size - connectedNet,
    crude_conversion_ratio:
      connectedNet > 0 ? Math.round((paidNet / connectedNet) * 1000) / 1000 : null,
    definitions: "governance/internal/operator-observability.md",
  };
  if (stripeActive !== undefined) {
    stats.stripe_active_subscriptions = stripeActive;
    // Cross-check against RAW: the operator's own subscription is a real Stripe sub.
    if (stripeActive !== paidTiers.size) {
      stats.discrepancy =
        `KV reports ${paidTiers.size} paid login(s) (raw, incl. operator-owned); Stripe reports ` +
        `${stripeActive} active subscription(s). Stripe is the source of truth — investigate the webhook path.`;
    }
  }
  return stats;
}

/** The stats surface exists only for the configured operator. */
export function isOperator(env: Env, login: string): boolean {
  return Boolean(env.OPERATOR_LOGIN) && login === env.OPERATOR_LOGIN;
}
