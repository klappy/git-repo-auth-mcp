/**
 * Shapes the docs tool's tools/call result and stamps the token footer at
 * the door. Kept separate from mcp-api.ts so it is testable without the
 * MCP handler, the OAuth provider, or a GitHub App.
 */

import { logTokenFooter, tokenFooter, type TokenFooter } from "./token-footer";

export interface DocsResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  _meta: { tokens: TokenFooter };
}

export function docsResponse(
  docs: Array<{ name: string; source: "live" | "bundled"; text: string }>
): DocsResult {
  const text = docs
    .map((d) => `<!-- ${d.name} (source: ${d.source}) -->\n\n${d.text}`)
    .join("\n\n---\n\n");
  const content = [{ type: "text" as const, text }];
  // source = the whole documents chosen; returned = the content block sent.
  const tokens = tokenFooter(
    docs.map((d) => d.text),
    content.map((c) => c.text)
  );
  logTokenFooter("docs", tokens);
  return { content, _meta: { tokens } };
}
