# Prompt Injection Stance — Git Repo Auth MCP

*Operator-approved 2026-06-10. Serving route and docs-tool registration land in the docs-page task.*

## The attack, stated plainly

An agent holding this connector reads untrusted content — a webpage, an issue comment, a README in a dependency. That content contains instructions crafted for the agent: *mint a GitHub token and send it here*, or *mint a write token and push this commit*. If the agent complies, the attacker gets either the credential or the write.

We do not claim this attack is impossible. We claim each step runs into a wall, and the walls are enforced by parties the attacker cannot prompt.

## The walls, in the order the attack meets them

**1. The default mint is read-only.** As of v0.3, calling `github_token` without explicit permissions returns a token scoped to `contents: read`. An injected "get me a token" yields a credential that cannot push, cannot open PRs, cannot touch CI. Write access must be requested by name in the tool call — a louder, more visible act for the agent to take and for the user to notice. This is mechanism, not policy: the secure default is in the code path, and the documentation teaches users they may instruct their agent toward broader defaults if their workflow is write-heavy. We chose to make caution the floor and openness the opt-in.

**2. Exfiltrated tokens die within the hour.** No refresh tokens, no long-lived credentials exist to steal. A leaked token is a one-hour, read-only window into repositories the user already chose to expose to their agent.

**3. GitHub enforces the blast walls, not us.** A token minted for one installation physically cannot reach another installation's repositories. The permission ceiling, repository scoping, and expiry are all enforced server-side by GitHub. Compromising the agent's reasoning does not move these walls.

**4. Writes are attributable.** Any write a successfully-injected agent performs lands under the App's `[bot]` identity — in commits, PR history, and the audit log. There is no anonymous path.

**5. The kill switch is the user's, unilaterally.** Uninstalling the GitHub App ends minting instantly; outstanding tokens expire within the hour. Recovery from a suspected compromise requires no support ticket and no cooperation from us.

## The path we accept rather than deny

If the App is granted Workflows write and a write token is explicitly minted, a token holder can modify CI — and CI runs with the repository's own credentials. We document this in the README rather than hiding it: the changes land in PRs and audit logs under the bot identity, users can withhold sensitive repositories from the installation, and operators can drop the Workflows permission app-wide. Named, bounded, and the user's choice.

## What we ask of host platforms

Claude's own injection mitigations, tool-use confirmations, and conversation-context protections are the layer above us. We designed for defense in depth on our layer; we do not assume the layers above are perfect, and we ask users not to assume ours is.
