# Reviewer Test Account — Setup & Step-by-Step Instructions (v2)

Design principle: **the reviewer walks the same path every new user walks.** No out-of-band setup beyond a test identity and sample content. The connect flow handles App installation itself (a zero-installation user is routed to install; reconnecting then binds the new installation automatically), and the free tier — 50 mints, no card — is the designed first-run experience, with ample headroom for a full review. The review thereby validates the real onboarding, not a pre-arranged state.

---

## Operator setup (do once — deliberately minimal)

1. Create a dedicated GitHub account (e.g. `gitauth-review`). Record credentials for the form.
2. As that account, create a scratch repository (e.g. `review-sandbox`) and **populate it**: a few source files, a second branch, one open PR. (Sample content is operator-side because "test account has no sample data" is a named rejection cause — but the App is NOT pre-installed; that's the reviewer's first step, in-band.)
3. Dry-run the walkthrough below once yourself end to end, then uninstall the App again so the reviewer starts from zero installations. Separately, run every tool via MCP Inspector. The form asks you to confirm both.
4. Recovery lever (document, don't pre-arm): if repeated review rounds ever exhaust the one-time free bucket, reset `quota:bucket:gitauth-review` in KV. A normal review uses a fraction of 50.

---

## Reviewer walkthrough (include with credentials)

**What this connector does:** mints short-lived (≤1 hour), scoped GitHub tokens for repositories where you install our GitHub App. Read-only by default; write requested explicitly per call. You start exactly as a new user does — including installing the App, which the connect flow walks you through.

### 1. Connect — and install, in-band

Add the connector with server URL `https://gitauth.klappy.dev/mcp`. Sign in with the provided GitHub test credentials. Because this account has no App installations yet, the flow shows a one-step install page: follow the link to GitHub, choose the test account, and select the `review-sandbox` repository. Then reconnect from your client — with the installation now in place, the flow binds it automatically and you land back connected. (This zero-installation routing is the product's designed onboarding, not a workaround.)

### 2. Mint a default (read-only) token

Ask the assistant: *"Call github_token with no arguments and show me the response."*

Expect: a `token`, `expires_at` within one hour, `permissions` of exactly `{"contents":"read","metadata":"read"}`, and a `quota` block — `tier: "free"` with `remaining` counting down from the 50-mint bucket. The quota transparency fields are a product feature; you're seeing the same accounting every user sees.

### 3. Use the read token

Ask: *"Use that token to clone review-sandbox and list its files."* (Format: `git clone https://x-access-token:<token>@github.com/gitauth-review/review-sandbox.git`.) The clone succeeds; a push with this token is refused by GitHub — the read-only default doing its job.

### 4. Mint a write token, explicitly

Ask: *"Call github_token with permissions {"contents":"write","pull_requests":"write"}."*

Same shape, write permissions echoed back. Optionally: *"Commit a small change on a branch and push it with this token."* The commit appears under the App's bot identity — attribution is part of the security model.

### 5. Read the docs tool

Ask: *"Use the docs tool to explain the tiers."* Expect verbatim governance text — pricing, the free bucket you're currently drawing from, and the prorated-upgrade policy. The same documents render at https://gitauth.klappy.dev/privacy, /terms, and /security.

### 6. Verify the kill switch (optional)

In the test account's GitHub settings, uninstall the App. Further mints fail immediately; the previously minted token dies within the hour. Reinstalling re-enters the same flow as step 1 — there is no privileged path back.

**Support during review:** support@klappy.dev · https://github.com/klappy/git-repo-auth-mcp/issues
