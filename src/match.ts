/**
 * Stemmed query matching for the docs tool.
 *
 * 6B borrow evaluation (2026-06-11): stemmer + tokenizer ADOPTED from
 * klappy/oddkit `src/search/bm25.js` (Porter-lite + stop words) for fleet-
 * consistent stemming. oddkit's full BM25 was inspected and REJECTED for
 * this call site: the corpus is six documents, and oddkit's own gate design
 * records BM25's IDF pathology on small corpora — its prescription there,
 * stemmed set intersection, is what this module implements. npm search
 * libraries rejected per the repo's zero-ballast precedent (billing.ts).
 *
 * One extension beyond the borrow: prefix-tolerant stem equality (≥4 chars),
 * because the minimal stemmer maps "pricing"→"pric" but "price"→"price";
 * strict intersection would miss the obvious intent.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "of", "in", "to",
  "for", "with", "on", "at", "by", "from", "as", "into", "through",
  "and", "but", "or", "nor", "not", "no", "so", "if", "then", "than",
  "that", "this", "it", "its", "we", "you", "he", "she", "they",
]);

/** Minimal Porter-style stemmer (adopted from oddkit). */
export function stem(word: string): string {
  if (word.length < 4) return word;
  return word
    .replace(/ies$/, "y")
    .replace(/ied$/, "y")
    .replace(/([^aeiou])ed$/, "$1")
    .replace(/(ing|tion|ment|ness|able|ible)$/, "")
    .replace(/s$/, "");
}

/** Tokenize and stem text, removing stop words (adopted from oddkit). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s\-_/]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Prefix-tolerant stem equality: exact, or one is a ≥4-char prefix of the other. */
function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Rank catalog entries against a query by stemmed-intersection score:
 * the number of distinct query stems that match any stem of the entry's
 * name + about. Returns entries with score > 0, best first; ties keep
 * catalog order (stable).
 */
export function rankByQuery<T extends { name: string; about: string }>(
  query: string,
  catalog: T[]
): T[] {
  const qStems = [...new Set(tokenize(query))];
  if (qStems.length === 0) return [];
  const scored = catalog.map((entry, i) => {
    const docStems = [...new Set(tokenize(`${entry.name} ${entry.about}`))];
    const score = qStems.filter((q) => docStems.some((d) => stemsMatch(q, d))).length;
    return { entry, score, i };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.entry);
}
