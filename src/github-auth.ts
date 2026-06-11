/**
 * Default handler: everything that isn't the gated /mcp API.
 *
 * Flow:
 *   /authorize  — MCP client arrives; parse the request, bounce to GitHub login.
 *   /callback   — GitHub returns; exchange code for a transient user token,
 *                 list installations of THIS app the user can access
 *                 (GitHub filters both by app and by user's own access),
 *                 then bind the grant: 0 installs → install page,
 *                 1 → complete immediately, many → picker.
 *   /select     — picker POST; completes authorization for the chosen installation.
 *
 * The user token is used for two GET requests and discarded. It is never
 * stored, logged, or returned.
 */

import { handlePage } from "./pages";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { encodeState, decodeState } from "./state";
import { handleStripeWebhook, paymentLinkFor } from "./billing";
import type { Env } from "./types";

const GH = "https://api.github.com";
const UA = "git-repo-auth-mcp";

interface Installation {
  id: number;
  account: { login: string; type: string };
}

interface Pending {
  oauthReqInfo: AuthRequest;
  login: string;
  installations: Installation[];
}

function html(body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Git Repo Auth MCP</title><style>body{font-family:ui-monospace,monospace;background:#FAFAF6;color:#16201B;max-width:560px;margin:64px auto;padding:0 20px;line-height:1.6}a{color:#0E5A4A}button{font:inherit;border:1.5px solid #16201B;background:#0E5A4A;color:#FAFAF6;padding:10px 18px;cursor:pointer}label{display:block;padding:10px;border:1.5px solid #D8D6CB;margin:8px 0;cursor:pointer}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function ghJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": UA,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function completeFor(
  env: Env,
  oauthReqInfo: AuthRequest,
  login: string,
  inst: Installation
): Promise<Response> {
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: login,
    metadata: { label: `${login} → ${inst.account.login}` },
    scope: ["github_token"],
    props: {
      login,
      installationId: inst.id,
      accountLabel: inst.account.login,
    },
  });
  return Response.redirect(redirectTo, 302);
}

export const GitHubAuthHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") return new Response("ok", { status: 200 });

    // ---- Policy pages: /privacy, /terms, /security (live -> bundled governance) ----
    const pageResponse = await handlePage(url.pathname, env);
    if (pageResponse) return pageResponse;

    // ---- Buy flow entry: identify the buyer, then hand off to Stripe ----
    // /buy/{tier} runs the same GitHub login as connecting, then redirects to
    // the tier's payment link with client_reference_id={login} so the webhook
    // can bind the purchase to an account automatically.
    if (url.pathname.startsWith("/buy/")) {
      const tier = url.pathname.slice("/buy/".length).toLowerCase();
      if (!paymentLinkFor(env, tier)) {
        return html(`<h2>Unknown tier.</h2><p>See <a href="/#pricing">pricing</a>.</p>`, 404);
      }
      const gh = new URL("https://github.com/login/oauth/authorize");
      gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      gh.searchParams.set("redirect_uri", `${url.origin}/callback`);
      gh.searchParams.set("state", encodeState({ kind: "buy", tier }));
      return Response.redirect(gh.toString(), 302);
    }

    // ---- Stripe billing webhook (signature-verified, idempotent) ----
    if (url.pathname === "/webhooks/stripe" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    // ---- MCP client begins authorization ----
    if (url.pathname === "/authorize") {
      let oauthReqInfo: AuthRequest;
      try {
        oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      } catch (err) {
        return html(
          `<h2>Invalid authorization request</h2><p>${err instanceof Error ? err.message : "Malformed request."}</p><p>MCP clients should register via <code>/register</code> and retry.</p>`,
          400
        );
      }
      if (!(await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId))) {
        return html(`<h2>Unknown client</h2><p>Register via <code>/register</code> first.</p>`, 400);
      }
      const gh = new URL("https://github.com/login/oauth/authorize");
      gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      gh.searchParams.set("redirect_uri", `${url.origin}/callback`);
      gh.searchParams.set("state", encodeState(oauthReqInfo));
      return Response.redirect(gh.toString(), 302);
    }

    // ---- GitHub returns with identity ----
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return html(`<h2>Missing code or state.</h2>`, 400);
      const decoded = decodeState<Record<string, unknown>>(state);
      const buyTier = decoded?.kind === "buy" ? String(decoded.tier ?? "") : null;
      const oauthReqInfo = decoded as unknown as AuthRequest;

      // Exchange for a transient user token (used twice, then discarded).
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/callback`,
        }),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenJson.access_token) {
        return html(`<h2>GitHub login failed.</h2><p>${tokenJson.error ?? "no token returned"}</p>`, 400);
      }
      const userToken = tokenJson.access_token;

      const user = await ghJson<{ login: string }>(`${GH}/user`, userToken);

      // Buy flow: identity established — hand off to Stripe, bound to the login.
      if (buyTier !== null) {
        const link = paymentLinkFor(env, buyTier);
        if (!link) return html(`<h2>Unknown tier.</h2><p>See <a href="/#pricing">pricing</a>.</p>`, 404);
        const dest = new URL(link);
        dest.searchParams.set("client_reference_id", user.login);
        return Response.redirect(dest.toString(), 302);
      }

      const inst = await ghJson<{ total_count: number; installations: Installation[] }>(
        `${GH}/user/installations?per_page=100`,
        userToken
      );
      const installations = inst.installations.map((i) => ({
        id: i.id,
        account: { login: i.account.login, type: i.account.type },
      }));

      if (installations.length === 0) {
        const install = `https://github.com/apps/${env.GH_APP_SLUG}/installations/new`;
        return html(
          `<h2>One step first</h2>
           <p>Hi <b>${user.login}</b> — the app isn't installed on any account you control yet.</p>
           <p><a href="${install}">Install it on your repos →</a></p>
           <p>Then reconnect from your MCP client. The app's permission grant is its ceiling; you choose which repositories it covers.</p>`
        );
      }

      if (installations.length === 1) {
        return completeFor(env, oauthReqInfo, user.login, installations[0]);
      }

      // Multiple installations: short-lived pending record + picker.
      const pid = crypto.randomUUID();
      const pending: Pending = { oauthReqInfo, login: user.login, installations };
      await env.OAUTH_KV.put(`pending:${pid}`, JSON.stringify(pending), { expirationTtl: 600 });
      const options = installations
        .map(
          (i) =>
            `<label><input type="radio" name="installation_id" value="${i.id}" required> ${i.account.login} <small>(${i.account.type})</small></label>`
        )
        .join("");
      return html(
        `<h2>Choose an account</h2>
         <p>Signed in as <b>${user.login}</b>. Which installation should this MCP connection mint tokens for?</p>
         <form method="POST" action="/select">
           <input type="hidden" name="pid" value="${pid}">
           ${options}
           <button type="submit">Bind connection</button>
         </form>`
      );
    }

    // ---- Installation chosen ----
    if (url.pathname === "/select" && request.method === "POST") {
      const form = await request.formData();
      const pid = String(form.get("pid") ?? "");
      const chosen = Number(form.get("installation_id"));
      const raw = pid ? await env.OAUTH_KV.get(`pending:${pid}`) : null;
      if (!raw) return html(`<h2>Selection expired.</h2><p>Reconnect from your MCP client.</p>`, 400);
      await env.OAUTH_KV.delete(`pending:${pid}`);
      const pending = JSON.parse(raw) as Pending;
      const inst = pending.installations.find((i) => i.id === chosen);
      if (!inst) return html(`<h2>Invalid selection.</h2>`, 400);
      return completeFor(env, pending.oauthReqInfo, pending.login, inst);
    }

    return new Response("Not found", { status: 404 });
  },
};
