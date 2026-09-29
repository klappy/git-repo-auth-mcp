/**
 * Tool token footer (canon draft klappy://canon/constraints/tool-token-footer).
 *
 * Every content-producing tool response carries
 *   tokens: { source, returned, ratio, tokenizer }
 * computed here, at the tool's door, never by the LLM:
 *   source   = tokens of the full file(s) that would be in context if returned whole
 *   returned = tokens actually sent (the content blocks on the wire)
 *   ratio    = returned / source (null when source is 0), 4 decimals
 *   tokenizer = "cl100k_base" — the shared ruler across providers.
 *
 * The footer rides in the MCP envelope (`_meta.tokens` on the tools/call
 * result), never in the content text, matching the sibling providers
 * (cartographer#157). In GitAuth only the `docs` tool produces content;
 * `github_token` mints credentials and `admin_stats` returns operator
 * aggregates, so neither carries a footer.
 */

import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

export const TOKENIZER = "cl100k_base" as const;

export interface TokenFooter {
  source: number;
  returned: number;
  ratio: number | null;
  tokenizer: typeof TOKENIZER;
}

/** One encoder per isolate; built lazily on the first content call. */
let encoder: Tiktoken | undefined;

export function countTokens(text: string): number {
  encoder ??= new Tiktoken(cl100k_base);
  return encoder.encode(text).length;
}

export function tokenFooter(sourceTexts: string[], returnedTexts: string[]): TokenFooter {
  const source = sourceTexts.reduce((n, t) => n + countTokens(t), 0);
  const returned = returnedTexts.reduce((n, t) => n + countTokens(t), 0);
  const ratio = source === 0 ? null : Math.round((returned / source) * 10000) / 10000;
  return { source, returned, ratio, tokenizer: TOKENIZER };
}

/**
 * Telemetry count: one structured Workers Logs event per footer
 * (observability is enabled in wrangler.jsonc). Numbers and the tool name
 * only — never the query, the document text, or the caller's login.
 */
export function logTokenFooter(tool: string, footer: TokenFooter): void {
  console.log(
    JSON.stringify({
      event: "tool_tokens",
      tool,
      tokens_source: footer.source,
      tokens_returned: footer.returned,
      ratio: footer.ratio,
      tokenizer: footer.tokenizer,
    })
  );
}
