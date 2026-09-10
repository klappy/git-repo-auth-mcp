# Account callback recovery references

This change makes an unsuccessful sign-in diagnosable. It does not establish the
cause of the reported live recovery loop, nor prove a completed connection.

The first failure page displays a fixed support reference before recovery links.
Share that reference, not the address bar or credentials. References are not
stored in cookies, logs, or a diagnostic database and do not initiate retries.

| Reference | Boundary that could not be completed |
| --- | --- |
| account-request | Unclassified account request |
| callback-request | Callback method, activation, or configured destination |
| callback-cookies | Required browser or login cookie absent |
| callback-transaction | Pending single-use callback transaction or callback validation |
| provider-exchange | GitHub token request transport |
| provider-response | Maintained library validation of the token response |
| provider-identity | Exact scope or fresh numeric GitHub identity validation |
| session-activation | Establishing browser authority after provider verification |
| session-load | Verifying newly established browser authority |
| account-bootstrap | Signed internal account/grant bootstrap |

These are phase boundaries, not assertions of root cause. Existing denial status,
expiry, identity, state, PKCE, one-use transaction, and repository guards remain.
An existing repository-start ambiguity page still takes precedence.

The maintained OAuth library already requests JSON. GitHub's current OAuth
documentation supports `offline_access` with expiring and refresh tokens; identity
bootstrap itself does not require token expiry. Do not relax these policies based
on outdated assumptions about classic OAuth Apps.

Source: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

Validation includes fixed-reference failures with malicious exception content,
the real production login adapter with documented identity JSON, encrypted browser
session activation, signed bootstrap, replay denial, and the existing security suite.
