/**
 * Billing: Stripe in isolation, zero SDK. Webhook signature verification and
 * meter events are a few fetch/WebCrypto calls; borrowing the full SDK for
 * that would be ballast in a worker (borrow-evaluation: the substrate here
 * is Stripe's HTTP API itself).
 *
 * Stripe is the source of truth. This module only mirrors entitlements into
 * KV (quota:tier:{login}) and emits usage. Webhooks are treated as
 * at-least-once; handlers are idempotent (same event → same KV end-state).
 *
 * Checkout links carry ?client_reference_id={login} (quota.ts appends it),
 * which is how a completed checkout maps back to a GitHub login.
 */

import type { Env } from "./types";

const enc = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a `stripe-signature` header (t=...,v1=...) against the raw body. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  nowMs = Date.now()
): Promise<boolean> {
  if (!header) return false;
  const parts = new Map(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1)] as const;
    })
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, v1);
}

type TierId = "solo" | "pro" | "team" | "fleet";

function tierFromEvent(obj: Record<string, unknown>, env: Env): TierId | undefined {
  const meta = obj["metadata"] as Record<string, string> | undefined;
  const fromMeta = meta?.tier;
  if (fromMeta === "solo" || fromMeta === "pro" || fromMeta === "team" || fromMeta === "fleet") return fromMeta;
  if (!env.STRIPE_PRICE_MAP) return undefined;
  try {
    const map = JSON.parse(env.STRIPE_PRICE_MAP) as Record<string, TierId>;
    const items =
      ((obj["items"] as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? []);
    for (const it of items) {
      const t = it.price?.id ? map[it.price.id] : undefined;
      if (t) return t;
    }
  } catch {
    /* malformed map: fall through */
  }
  return undefined;
}

/** POST /webhooks/stripe — wire into the default handler's router. */
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("billing not configured", { status: 501 });
  const payload = await request.text();
  const ok = await verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!ok) return new Response("bad signature", { status: 400 });

  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;

  if (event.type === "checkout.session.completed") {
    const login = obj["client_reference_id"] as string | null;
    const customer = obj["customer"] as string | null;
    const tier = tierFromEvent(obj, env) ?? "solo";
    if (login) {
      await env.OAUTH_KV.put(`quota:tier:${login}`, tier);
      if (customer) {
        await env.OAUTH_KV.put(`quota:cust:${login}`, customer);
        await env.OAUTH_KV.put(`quota:custmap:${customer}`, login);
      }
    }
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const customer = obj["customer"] as string | null;
    const login = customer ? await env.OAUTH_KV.get(`quota:custmap:${customer}`) : null;
    if (login) {
      const status = obj["status"] as string | undefined;
      const ended = event.type === "customer.subscription.deleted" ||
        status === "canceled" || status === "unpaid";
      if (ended) {
        // Paid users never regain a free bucket; tier removal leaves an empty bucket.
        await env.OAUTH_KV.delete(`quota:tier:${login}`);
        await env.OAUTH_KV.put(`quota:bucket:${login}`, "0");
      } else {
        const tier = tierFromEvent(obj, env);
        if (tier) await env.OAUTH_KV.put(`quota:tier:${login}`, tier);
      }
    }
  }
  // Unhandled event types are acknowledged — Stripe retries on non-2xx only.
  return new Response("ok", { status: 200 });
}

/** Fire-and-forget usage event; never blocks or fails a mint. */
export async function emitMeterEvent(env: Env, login: string, nowMs = Date.now()): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return;
  const customer = await env.OAUTH_KV.get(`quota:cust:${login}`);
  if (!customer) return; // free user: accounted locally, nothing to meter
  const body = new URLSearchParams({
    event_name: env.STRIPE_METER_EVENT ?? "git_token_mint",
    timestamp: String(Math.floor(nowMs / 1000)),
    "payload[stripe_customer_id]": customer,
    "payload[value]": "1",
  });
  try {
    await fetch("https://api.stripe.com/v1/billing/meter_events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    /* metering is analytics, never availability */
  }
}
