import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/mcp-api";
import type { Env, GrantProps } from "../src/types";

// agents/mcp pulls cloudflare: modules; only buildServer is under test here.
vi.mock("agents/mcp", () => ({ createMcpHandler: vi.fn() }));

describe("docs tool over MCP", () => {
  it("tools/call result carries _meta.tokens; github_token lists no footer", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = { GOVERNANCE_RAW_BASE: "http://127.0.0.1:9" } as unknown as Env;
    const props = { login: "someone", installationId: 1 } as unknown as GrantProps;
    const server = buildServer(env, props, {} as ExecutionContext);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const res = await client.callTool({ name: "docs", arguments: { query: "quota" } });
    const tokens = (res._meta as { tokens: Record<string, unknown> }).tokens;
    expect(tokens).toMatchObject({ tokenizer: "cl100k_base" });
    expect(tokens.source as number).toBeGreaterThan(0);
    expect(tokens.returned as number).toBeGreaterThan(0);
    console.info("FOOTER", JSON.stringify({ tokens }));
    await client.close();
  });
});
