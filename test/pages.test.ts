import { describe, expect, it } from "vitest";
import { mdToHtml, PAGES } from "../src/pages";

describe("mdToHtml", () => {
  it("escapes HTML before transforming", () => {
    const html = mdToHtml("hello <script>alert(1)</script> & co");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; co");
  });

  it("renders headings, bold, code, hr", () => {
    const html = mdToHtml("# Title\n\n## Section\n\nBody **strong** and `code`.\n\n---");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<hr>");
  });

  it("allowlists link schemes", () => {
    const html = mdToHtml("[ok](https://example.com) [mail](mailto:a@b.c) [bad](javascript:alert(1))");
    expect(html).toContain('<a href="https://example.com">ok</a>');
    expect(html).toContain('<a href="mailto:a@b.c">mail</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("bad"); // text survives, link does not
  });

  it("autolinks bare http(s) URLs without double-linking markdown links", () => {
    const html = mdToHtml("- Issues: https://github.com/klappy/git-repo-auth-mcp/issues\n- [docs](https://example.com)");
    expect(html).toContain(
      '<li>Issues: <a href="https://github.com/klappy/git-repo-auth-mcp/issues">https://github.com/klappy/git-repo-auth-mcp/issues</a></li>'
    );
    expect(html).toContain('<li><a href="https://example.com">docs</a></li>');
  });

  it("renders tables with the separator row dropped", () => {
    const html = mdToHtml("| Data | Lifetime |\n|---|---|\n| Tokens | 1 hour |");
    expect(html).toContain("<th>Data</th>");
    expect(html).toContain("<td>1 hour</td>");
    expect(html).not.toContain("---");
  });

  it("renders unordered lists", () => {
    const html = mdToHtml("- one\n- two **bold**");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two <strong>bold</strong></li>");
  });
});

describe("PAGES", () => {
  it("maps the three policy routes to governance documents", () => {
    expect(PAGES["/privacy"].doc).toBe("privacy-policy.md");
    expect(PAGES["/terms"].doc).toBe("terms-of-service.md");
    expect(PAGES["/security"].doc).toBe("prompt-injection-stance.md");
  });
});
