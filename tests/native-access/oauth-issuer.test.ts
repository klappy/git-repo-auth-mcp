import { describe, expect, it } from 'vitest';
import { context, MemoryStore, mockProvider, provider } from './helpers';

// GitHub's discovery metadata identifies the OAuth server, not its website origin:
// https://docs.github.com/en/apps/github-authentication-discovery-endpoints
const githubIssuer = 'https://github.com/login/oauth';

describe('GitHub authorization response issuer', () => {
  for (const purpose of ['identity', 'repository'] as const) {
    async function attempt(issuer?: string) {
      const transport = mockProvider(
        purpose === 'identity' ? { scope: 'read:user' } : {},
        1001,
        purpose === 'identity' ? 'read:user' : 'repo',
      );
      const oauth = provider(transport);
      const store = new MemoryStore();
      const identity = purpose === 'identity' ? await oauth.startIdentity() : undefined;
      const authorize = new URL(identity?.url ?? await oauth.start(context, 'repository', store));
      const callback = new URL('https://account.example.test/oauth/callback');
      callback.searchParams.set('state', authorize.searchParams.get('state')!);
      callback.searchParams.set('code', 'synthetic-code');
      if (issuer !== undefined) callback.searchParams.set('iss', issuer);
      return {
        callback,
        transport,
        complete: () => identity
          ? oauth.completeIdentity(callback, identity.transaction)
          : oauth.callback(callback, context, store),
      };
    }

    it(`${purpose}: accepts GitHub's documented issuer through the maintained library`, async () => {
      const test = await attempt(githubIssuer);
      await expect(test.complete()).resolves.toBeDefined();
      expect(test.transport).toHaveBeenCalledTimes(2);
    });

    it(`${purpose}: preserves compatibility with callbacks without iss`, async () => {
      const test = await attempt();
      await expect(test.complete()).resolves.toBeDefined();
      expect(test.transport).toHaveBeenCalledTimes(2);
    });

    it.each(['https://github.com', 'https://attacker.example', `${githubIssuer}/`])(
      `${purpose}: rejects incorrect issuer %s before exchanging a code`, async issuer => {
        const test = await attempt(issuer);
        await expect(test.complete()).rejects.toThrow();
        expect(test.transport).not.toHaveBeenCalled();
      },
    );

    it.each(['duplicate issuer', 'wrong state', 'duplicate state'])(
      `${purpose}: rejects %s before exchanging a code`, async invalid => {
        const test = await attempt(githubIssuer);
        if (invalid === 'duplicate issuer') test.callback.searchParams.append('iss', githubIssuer);
        if (invalid === 'wrong state') test.callback.searchParams.set('state', 'wrong-state');
        if (invalid === 'duplicate state') test.callback.searchParams.append('state', test.callback.searchParams.get('state')!);
        await expect(test.complete()).rejects.toThrow();
        expect(test.transport).not.toHaveBeenCalled();
      },
    );
  }
});
