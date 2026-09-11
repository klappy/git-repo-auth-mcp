import { defineConfig, type Plugin } from "vitest/config";
import { readFileSync } from "node:fs";

/** Mirror wrangler's Text rule: .md imports resolve to their string content. */
const markdownAsText: Plugin = {
  name: "markdown-as-text",
  transform(_code, id) {
    if (id.endsWith(".md")) {
      return { code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`, map: null };
    }
  },
};

export default defineConfig({
  assetsInclude: [],
  test: { server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } }, include: ["test/**/*.test.ts", "tests/native-access/**/*.test.ts"] },
  plugins: [markdownAsText],
});
