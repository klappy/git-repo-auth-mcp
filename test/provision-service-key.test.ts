import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ branch: 'HEAD', randomBytes: vi.fn() }));
vi.mock('node:child_process', () => ({ execSync: () => fixture.branch }));
vi.mock('node:crypto', () => ({ default: { randomBytes: fixture.randomBytes } }));
const stopped = new Error('synthetic process exit');
let fetchMock: ReturnType<typeof vi.fn>;

async function runProvision() {
  // Execute the actual helper with all authority and I/O replaced by fixtures.
  // @ts-expect-error JavaScript deploy helper has no TypeScript declaration
  return import('../scripts/provision-service-key.mjs');
}

beforeEach(() => {
  vi.resetModules();
  fixture.branch = 'HEAD';
  fixture.randomBytes.mockReset().mockReturnValue(Buffer.alloc(32, 7));
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'synthetic-token');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'synthetic-account');
  vi.stubEnv('WORKERS_CI_BRANCH', 'production');
  vi.stubEnv('GITHUB_REF_NAME', '');
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(process, 'exit').mockImplementation(() => { throw stopped; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('production deploy key rotation', () => {
  it('writes the same newly generated key to both existing production destinations', async () => {
    await runProvision();
    expect(fixture.randomBytes).toHaveBeenCalledExactlyOnceWith(32);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const expected = [['git-repo-auth-mcp', 'ARS_SERVICE_KEY'], ['ars', 'GIT_REPO_AUTH_TOKEN']];
    expected.forEach(([worker, secret], index) => {
      const [url, request] = fetchMock.mock.calls[index];
      expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/synthetic-account/workers/scripts/${worker}/secrets`);
      expect(request.method).toBe('PUT');
      expect(request.headers.authorization).toBe('Bearer synthetic-token');
      expect(JSON.parse(request.body)).toEqual({ name: secret, text: Buffer.alloc(32, 7).toString('base64url'), type: 'secret_text' });
    });
  });
  it.each(['main', 'feature/fix', 'HEAD', ''])('does not rotate on non-production branch %s', async branch => {
    vi.stubEnv('WORKERS_CI_BRANCH', branch);
    await expect(runProvision()).rejects.toBe(stopped);
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(fixture.randomBytes).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])('does not rotate without %s', async name => {
    vi.stubEnv(name, '');
    await expect(runProvision()).rejects.toBe(stopped);
    expect(fixture.randomBytes).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails the build if the first secret write fails, without attempting the second', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ success: false }) });
    await expect(runProvision()).rejects.toThrow('HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails the build if the second secret write fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false }) });
    await expect(runProvision()).rejects.toThrow('GIT_REPO_AUTH_TOKEN');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
