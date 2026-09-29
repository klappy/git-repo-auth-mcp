# GitHub App Registration — Captain's Handoff Guide

**For:** klappy, at github.com, in a browser (or Claude in Chrome with you watching).
**App:** `git-repo-auth` — https://github.com/settings/apps/git-repo-auth
**Why:** On 2026-09-01 the public registration showed 100+ permissions at *write*, including
Administration. The registration is the ceiling for every token this service mints. This guide
narrows it to three permissions and turns on the two switches the user-token design (shape 🅰)
needs. Target: `app-manifest.json` beside this file.
**Time:** ~15 minutes. Every step is reversible. Nothing here changes code.

---

## 0. Before you click

1. Open `app-manifest.json` (this folder). That is the target. Three permissions, one event, one optional feature.
2. Have a second tab ready on https://api.github.com/apps/git-repo-auth — that page is public and shows what GitHub currently believes. You will refresh it at the end. Right now it says `administration: write`.
3. Do not paste any secret into chat, a ticket, or a journal. The one secret this guide creates (webhook secret) goes into a Cloudflare Worker secret only.

## 1. Permissions — the hundreds of boxes, three answers

Go to **Settings → Developer settings → GitHub Apps → git-repo-auth → Permissions & events**.
Every row is a dropdown. The rule: **set three, leave every other row at "No access."** Reading
top to bottom:

### Repository permissions
| Row | Set to |
|---|---|
| **Contents** | Read and write |
| **Pull requests** | Read and write |
| **Metadata** | Read-only (GitHub forces this; you cannot clear it) |
| Administration | No access ← the one that mattered |
| Actions, Workflows, Secrets, Environments, Deployments, Issues, Discussions, Checks, Statuses, Pages, Packages, Projects, Webhooks, Code scanning, Dependabot, Custom properties, Variables, everything else | No access |

### Organization permissions
Every row → **No access.** (Administration, Members, Secrets, Personal access tokens, Projects, Custom roles, Copilot, Codespaces, Runners, all of them.)

### Account permissions
Every row → **No access.** (Email addresses, Followers, GPG/SSH keys, Gists, Profile, Starring, Watching, Blocking, Codespaces user secrets, all of them.) Login only needs the basic public profile, which a user token always carries without a permission.

**How to move fast:** the page is long; each section has ~30–60 rows. Use the browser's find (⌘F / Ctrl-F) for "Read and write" and "Read-only" and walk the hits — every hit that is not Contents, Pull requests, or Metadata gets set to No access. When find returns only those three, the section is done.

## 2. Subscribe to events (same page, bottom)
Tick **GitHub App authorization** only. Untick anything else that is ticked. This event fires when a user revokes the App from their account; the v1 code will use it to purge that user's stored refresh token. Until then it is harmless.

## 3. Save
Scroll to the bottom → **Save changes.** A note on approvals: *removing* permissions applies to existing installations without anyone re-approving; only *adding* permissions asks installers to approve. So the seven existing installs shrink immediately. (Step 7 proves this either way.)

## 4. General → Webhook
Go to the **General** tab.
- **Active**: checked.
- **Webhook URL**: `https://gitauth.klappy.dev/webhook` (the route does not exist yet — GitHub will show a delivery failure until the code dish lands; that is expected and harmless).
- **Webhook secret**: click generate or make a long random string. Store it as the Worker secret `GH_WEBHOOK_SECRET` on `git-repo-auth-mcp` via the Cloudflare dashboard or the CF Extras connector — never at a seat, never in chat. If you cannot store it now, leave the field empty and come back; do not park it anywhere.
- Save.

## 5. General → Optional features
- **User-to-server token expiration** → **Opt in.** This is the switch that makes user access tokens expire in 8 hours and come with a 6-month refresh token. Without it the whole v1 design cannot work.
- Leave every other optional feature as is.

## 6. Shrink the klappy installation
Go to **Settings → Applications → Installed GitHub Apps → git-repo-auth → Configure**.
- **Repository access**: change *All repositories* (currently 103) → **Only select repositories.**
- Pick only the repos an agent actually mints against. Starting list, from the dishes on the rail today: `kitchen`, `git-repo-auth-mcp`, `cartographer`, `bee-ai-auth-mcp`, `3d-review-cookbook`, `bt-servant-v3-cookbook`, `romance-coffee-tata-oro-journal`, `cafe-tataoro-com`. Add later as a dish needs it — adding is one click.
- Save.

## 7. Prove it (the drift check, by hand)
Refresh https://api.github.com/apps/git-repo-auth. It should now read:
```
"permissions": { "contents": "write", "metadata": "read", "pull_requests": "write" }
"events": [ "github_app_authorization" ]
```
Anything else in `permissions` is a row you missed — go back to step 1. Then tell the seat "done" and the seat re-reads the same URL and records the result as a journal row. (Optional-feature state is not visible on that URL; it is proven by the first successful `ghu_` mint in the code dish.)

## 8. Two connectors to revoke until v1.0.0 ships
In the Claude client (Settings → Connectors): **disconnect Git-Elsy and Git Covenynt.** They bind your login to other accounts' installations — the escalation the parent ticket found. Reconnect after v1.0.0, when the intersection makes them safe by construction. (Git Repo Auth on your own account stays.)

## 9. What this does NOT fix
- The `/callback` binding bug is still in the code. A collaborator who connects and picks your installation still gets a token for your selected repos — now capped at Contents + Pull requests, no longer Administration. Only the v1 code dish removes the picker.
- Nothing here changes the website or policies; that is the spec dish this guide sits inside.

## Rollback
Every dropdown can be set back. Adding a permission back triggers a re-approval prompt on each installation — that is GitHub working as designed.

## Record
When done, one journal row per step is enough; the seat writes them from your "done" plus step 7's output. Nothing in this guide needs a `VERDICT.md` — it is reversible and it is your own account.
