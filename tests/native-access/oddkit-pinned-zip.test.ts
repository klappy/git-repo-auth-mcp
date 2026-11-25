import { expect, it } from 'vitest';
import { AccountBroker } from '../../account/broker';
import { oddkitFixturePairs } from '../../account/oddkit-fixtures';
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
  return { calls, broker: new AccountBroker(x.vault, x.oauth, new GitHubReads(transport), true, oddkitFixturePairs('[[1001,2001],[1002,2002]]')), defaultBroker: new AccountBroker(x.vault, x.oauth, new GitHubReads(transport)) };
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

it('rejects missing, incomplete, nonnumeric, unsafe, or ambiguous fixture configuration', () => {
  for (const raw of [undefined, '', 'null', '[]', '[[1]]', '[[1,"2"]]', '[[1,9007199254740992]]', '[[0,2]]', '[[1,2],[1,3]]', '[[1,2],[3,2]]']) {
    expect(oddkitFixturePairs(raw)).toBeUndefined();
  }
  expect(oddkitFixturePairs('[[1001,2001],[1002,2002]]')?.get(1002)).toBe(2002);
});

it('bounds both repo resolution and archive reads to the verified fixture pair', async () => {
  const { broker, calls } = await harness();
  const resolve = { ...request, action: 'resolve_repository' as const, sha: undefined, repository: { ...request.repository, id: undefined } };
  await expect(broker.read(resolve, { ...oddkit, githubId: 9000 })).rejects.toThrow();
  await expect(broker.read({ ...request, repository: { ...request.repository, id: 9000 } }, oddkit)).rejects.toThrow();
  await expect(broker.read({ ...request, action: 'read_tree' }, oddkit)).rejects.toThrow();
  expect(calls).toHaveLength(0);
  await expect(broker.read(resolve, oddkit)).resolves.toMatchObject({ repository: { id: 2001 } });
  expect(calls.some(c => c.url.includes('/zipball/'))).toBe(false);
});

it('checks canonical provider identity for a named repo even when the request does not supply an ID', async () => {
  const x = await setup();
  const calls: string[] = [];
  const transport = (async (url: Parameters<typeof fetch>[0]) => {
    calls.push(String(url));
    return Response.json({ id: 9999, full_name: 'personal/same-name', default_branch: 'main', private: true });
  }) as typeof fetch;
  const broker = new AccountBroker(x.vault, x.oauth, new GitHubReads(transport), true, oddkitFixturePairs('[[1001,2001]]'));
  await expect(broker.read({ ...request, action: 'resolve_repository', repository: { ...request.repository, id: undefined } }, oddkit)).rejects.toThrow();
  expect(calls).toEqual(['https://api.github.com/repos/personal/same-name']);
});
