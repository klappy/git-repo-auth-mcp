import { expect, it } from 'vitest';
import { AccountBroker } from '../../account/broker';
import { GitHubReads } from '../../account/upstream';
import { context, input, setup } from './helpers';

const sha = 'a'.repeat(40);
const zipPath = '/personal/same-name/legacy.zip/' + sha;
const request = { ...input, action: 'read_archive' as const, sha, path: undefined };
const oddkit = { ...context, service: 'oddkit' };
const fixture = Uint8Array.of(0x50, 0x4b, 3, 4, 0);
async function harness(path = zipPath, status = 200, bytes = fixture) {
  const x = await setup();
  const calls: { url: string; auth: string | null }[] = [];
  const transport = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
    if (String(url).includes('/zipball/')) return new Response(null, { status: 302, headers: { location: 'https://codeload.github.com' + path + '?synthetic=signed' } });
    if (String(url).includes('/tarball/')) return new Response(null, { status: 302, headers: { location: 'https://codeload.github.com/personal/same-name/legacy.tar.gz/' + sha } });
    if (String(url).startsWith('https://codeload.github.com/')) return new Response(bytes, { status });
    return x.fetcher(url, init);
  }) as typeof fetch;
  return { calls, broker: new AccountBroker(x.vault, x.oauth, new GitHubReads(transport), true), defaultBroker: new AccountBroker(x.vault, x.oauth, new GitHubReads(transport)) };
}

it('serves only pinned, proxied ZIP bytes to enabled Oddkit while preserving Cartographer wire format', async () => {
  const { calls, broker, defaultBroker } = await harness();
  await expect(defaultBroker.read(request, oddkit)).rejects.toThrow();
  const result = await broker.read(request, oddkit);
  expect(result).toMatchObject({ service: 'oddkit', snapshotSha: sha, intent: { sha }, data: { format: 'zip', encoding: 'base64', archive: btoa(String.fromCharCode(...fixture)) } });
  expect(JSON.stringify(result)).not.toContain('synthetic=signed');
  expect(calls.at(-1)?.auth).toBeNull();
  const cartographer = await broker.read(request, context);
  expect(cartographer.data).toEqual({ encoding: 'base64', archive: btoa(String.fromCharCode(...fixture)) });
  expect(calls.at(-1)?.url).toContain('legacy.tar.gz');
});

it('denies unpinned requests, wrong redirect pins, partial responses, and non-ZIP signatures', async () => {
  const { broker, calls } = await harness();
  await expect(broker.read({ ...request, sha: undefined }, oddkit)).rejects.toThrow();
  expect(calls.some(c => c.url.includes('zipball'))).toBe(false);
  for (const [path, status, fixture] of [
    [zipPath.replace(sha, 'b'.repeat(40)), 200, undefined],
    [zipPath, 206, undefined],
    [zipPath, 200, Uint8Array.of(0x1f, 0x8b, 8, 0)],
  ] as const) {
    const { broker } = await harness(path, status, fixture);
    await expect(broker.read(request, oddkit)).rejects.toThrow();
  }
});
