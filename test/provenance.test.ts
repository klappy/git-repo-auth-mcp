import { describe, expect, it } from "vitest";
import { provenanceResponse } from "../src/provenance";

describe("provenanceResponse", () => {
  it("returns 200 JSON with the chain-of-custody fields", async () => {
    const res = provenanceResponse();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.repository).toBe("https://github.com/klappy/git-repo-auth-mcp");
    expect(typeof body.commit).toBe("string");
    expect(["build", "placeholder"]).toContain(body.source);
    // The claim must state its own limits — build-asserted, not proof.
    expect(String(body.claim)).toContain("build-asserted");
  });

  it("omits commit_url when the commit is unknown, links it when known", async () => {
    const body = (await provenanceResponse().json()) as Record<string, unknown>;
    if (body.commit === "unknown") {
      expect(body.commit_url).toBeNull();
    } else {
      expect(String(body.commit_url)).toContain(`/commit/${body.commit}`);
    }
  });

  it("is uncacheable so verifiers always see the current deployment", () => {
    expect(provenanceResponse().headers.get("Cache-Control")).toBe("no-store");
  });
});
