// Deployment-owned data, never an OAuth client setting or a request override.
// One dedicated identity and one dedicated private repo per fixture.
export function oddkitFixturePairs(raw: string | undefined): ReadonlyMap<number, number> | undefined {
  if (!raw || raw.length > 1024) return undefined;
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10) return undefined;
    const pairs = new Map<number, number>(), repos = new Set<number>();
    const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
    for (const pair of entries) {
      if (!Array.isArray(pair) || pair.length !== 2 || !id(pair[0]) || !id(pair[1]) || pairs.has(pair[0]) || repos.has(pair[1])) return undefined;
      pairs.set(pair[0], pair[1]);
      repos.add(pair[1]);
    }
    return pairs;
  } catch {
    return undefined;
  }
}

export interface OddkitFixtureEnv {
  SERVICE?: string;
  ODDKIT_PINNED_ZIP?: string;
  ODDKIT_STAGING_FIXTURE_PAIRS?: string;
}

export function configuredOddkitFixtures(env: OddkitFixtureEnv) {
  return env.SERVICE === 'oddkit' && env.ODDKIT_PINNED_ZIP === 'owner-verified'
    ? oddkitFixturePairs(env.ODDKIT_STAGING_FIXTURE_PAIRS) : undefined;
}
