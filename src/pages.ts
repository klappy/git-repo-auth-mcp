/**
 * Policy pages: /privacy, /terms, /security — server-rendered from the same
 * governance documents the docs tool serves (live → bundled, one source of
 * truth; P0004 docs-proxy convention extended to the browser).
 *
 * The markdown converter is deliberately scoped to the constructs these
 * documents actually use (h1–h3, paragraphs, lists, tables, hr, bold,
 * italics, inline code, http(s)/mailto links, bare http(s) URLs). It is not
 * a general renderer
 * and should not grow into one — if a document needs more, question the
 * document first. All text is HTML-escaped before any transform; links are
 * scheme-allowlisted.
 */

import { fetchDoc } from "./docs";
import type { Env } from "./types";

export const PAGES: Record<string, { doc: string; title: string }> = {
  "/privacy": { doc: "privacy-policy.md", title: "Privacy Policy" },
  "/terms": { doc: "terms-of-service.md", title: "Terms of Service" },
  "/security": { doc: "prompt-injection-stance.md", title: "Security — Prompt Injection Stance" },
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) =>
      /^(https?:|mailto:)/.test(href) ? `<a href="${href}">${text}</a>` : text
    )
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
}

export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let list: string[] | null = null;
  let table: string[][] | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`), (para = []);
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`), (list = null);
  };
  const flushTable = () => {
    if (table && table.length) {
      const [head, ...rows] = table;
      out.push(
        "<table><thead><tr>" +
          head.map((c) => `<th>${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table>"
      );
    }
    table = null;
  };
  const flushAll = () => (flushPara(), flushList(), flushTable());

  for (const raw of lines) {
    const line = esc(raw.trimEnd());
    const t = line.trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) {
      flushAll();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (/^---+$/.test(t)) {
      flushAll();
      out.push("<hr>");
    } else if (t.startsWith("|")) {
      flushPara();
      flushList();
      const cells = t.slice(1, t.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // separator row
      (table ??= []).push(cells);
    } else if (/^[-*]\s+/.test(t)) {
      flushPara();
      flushTable();
      (list ??= []).push(t.replace(/^[-*]\s+/, ""));
    } else if (t === "") {
      flushAll();
    } else {
      flushList();
      flushTable();
      para.push(t);
    }
  }
  flushAll();
  return out.join("\n");
}

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Git Repo Auth MCP</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{--paper:#FAFAF6;--paper-deep:#F1F0E8;--ink:#16201B;--ink-soft:#4A554E;--viridian:#0E5A4A;--viridian-deep:#0A4036;--amber:#D9A441;--line:#D8D6CB;--mono:'IBM Plex Mono',ui-monospace,monospace;--disp:'Archivo',system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--disp)}
main{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 5rem;border-left:1px solid var(--line);border-right:1px solid var(--line);background:var(--paper);min-height:100vh}
.cert{font:11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:.75rem;margin-bottom:2.5rem}
.cert a{color:var(--viridian);text-decoration:none}
h1{font-size:1.9rem;line-height:1.2;letter-spacing:-.01em;margin:.2rem 0 1rem}
h2{font-size:1.15rem;color:var(--viridian-deep);border-bottom:1px solid var(--line);padding-bottom:.3rem;margin-top:2.2rem}
h3{font-size:1rem;margin-top:1.6rem}
a{color:var(--viridian)}code{font:.85em var(--mono);background:var(--paper-deep);padding:.1em .35em;border-radius:2px}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
table{border-collapse:collapse;width:100%;font-size:.92rem;margin:1rem 0}
th{font:11px var(--mono);letter-spacing:.1em;text-transform:uppercase;text-align:left;color:var(--ink-soft)}
th,td{border-bottom:1px solid var(--line);padding:.5rem .6rem .5rem 0;vertical-align:top}
li{margin:.35rem 0}
@media (prefers-reduced-motion:no-preference){main{animation:settle .25s ease-out}@keyframes settle{from{opacity:.0}to{opacity:1}}}
</style></head><body><main>
<div class="cert"><span>Git Repo Auth — Governance Document</span><a href="/">gitauth.klappy.dev</a></div>
${bodyHtml}
</main></body></html>`;
}

export async function handlePage(pathname: string, env: Env): Promise<Response | null> {
  const entry = PAGES[pathname];
  if (!entry) return null;
  const { text, source } = await fetchDoc(env, entry.doc);
  return new Response(page(entry.title, mdToHtml(text)), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-governance-source": source,
    },
  });
}
