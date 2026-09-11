import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { generateRandomCodeVerifier, calculatePKCECodeChallenge } from 'oauth4webapi';
export const resource = 'https://navigator.example.test/mcp';
const issuer = 'https://account.example.test', audience = 'https://broker.example.test/read';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function port() { const s = createServer(); await new Promise<void>(r => s.listen(0, '127.0.0.1', r)); const p = (s.address() as { port: number }).port; await new Promise<void>(r => s.close(() => r())); return p; }
export class AccountHost {
  dir = ''; base = ''; process?: ChildProcess; logs = ''; receipts: unknown[] = []; private sensitive: string[] = [];
  account!: Awaited<ReturnType<typeof generateKeyPair>>; service!: Awaited<ReturnType<typeof generateKeyPair>>;
  async prepare() {
    this.dir = await mkdtemp(join(tmpdir(), 'account-host-'));
    this.account = await generateKeyPair('ES256', { extractable: true }); this.service = await generateKeyPair('ES256', { extractable: true });
    const account = { ...await exportJWK(this.account.publicKey), kid: 'fixture-account' }, signing = { ...await exportJWK(this.account.privateKey), kid: 'fixture-account' }, service = { ...await exportJWK(this.service.publicKey), kid: 'fixture-service' };
    const template = JSON.parse(await readFile(resolve('tests/native-access/fixtures/account-host.wrangler.jsonc'), 'utf8'));
    const config = { ...template, main: resolve('tests/native-access/fixtures/account-host-worker.ts'), vars: { PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: issuer, SERVICE_ISSUER: 'https://service.example.test', BROKER_AUDIENCE: audience, RESOURCE: resource, SERVICE: 'navigator', ACCOUNT_JWKS: JSON.stringify({ keys: [account] }), SERVICE_JWKS: JSON.stringify({ keys: [service] }), ACCOUNT_SIGNING_JWK: JSON.stringify(signing), VAULT_KEY_HEX: randomBytes(32).toString('hex'), GITHUB_CLIENT_ID: 'synthetic-client', GITHUB_CLIENT_SECRET: 'INERT_CLIENT_SECRET', GITHUB_CALLBACK: issuer + '/oauth/callback' } };
    this.sensitive = [config.vars.VAULT_KEY_HEX, signing.d!, 'INERT_ACCESS_', 'INERT_REFRESH_', 'INERT_CLIENT_SECRET'];
    await writeFile(join(this.dir, 'wrangler.json'), JSON.stringify(config), { mode: 0o600 });
    await mkdir(join(this.dir, 'state')); return this;
  }
  async start() {
    const p = await port(), inspector = await port(); this.base = `http://127.0.0.1:${p}`; this.logs = '';
    const child = spawn(resolve('node_modules/.bin/wrangler'), ['dev', '--config', join(this.dir, 'wrangler.json'), '--local', '--ip', '127.0.0.1', '--port', String(p), '--inspector-ip', '127.0.0.1', '--inspector-port', String(inspector), '--persist-to', join(this.dir, 'state'), '--log-level', 'error', '--no-show-interactive-dev-session'], { cwd: process.cwd(), detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_EMAIL: '', CLOUDFLARE_ACCOUNT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = child;
    child.stdout!.on('data', b => this.logs += String(b)); child.stderr!.on('data', b => this.logs += String(b));
    for (let i = 0; i < 150; i++) { if (child.exitCode !== null) throw new Error('local host exited: ' + this.safeLogs()); try { if ((await fetch(this.base + '/health')).ok) { this.receipts.push({ event: 'start', pid: child.pid, directory: createHash('sha256').update(this.dir).digest('hex').slice(0, 12), at: new Date().toISOString() }); return; } } catch {} await delay(200); }
    throw new Error('local host startup timed out: ' + this.safeLogs());
  }
  safeLogs() { return 'local process diagnostics withheld; inspect fixture runner privately'; }
  async stop(crash = false) {
    const child = this.process; if (!child?.pid) return;
    const exit = new Promise<void>(r => child.once('exit', () => r()));
    try { process.kill(-child.pid, crash ? 'SIGKILL' : 'SIGTERM'); } catch {}
    await Promise.race([exit, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await Promise.race([exit, delay(1000)]); }
    if (child.exitCode === null && child.signalCode === null) throw new Error('local process did not stop');
    if (this.sensitive.some(value => this.logs.includes(value))) throw new Error('fixture log credential disclosure');
    this.receipts.push({ event: crash ? 'kill' : 'stop', pid: child.pid, signal: child.signalCode, exited: child.exitCode !== null || child.signalCode !== null, at: new Date().toISOString() }); this.process = undefined;
  }
  async close() { await this.stop(); if (this.dir) await rm(this.dir, { recursive: true, force: true }); }
  async user(id = 1001, generation = 1) { return new SignJWT({ github_id: id, service: 'navigator', resource, grant_generation: generation }).setProtectedHeader({ alg: 'ES256', kid: 'fixture-account' }).setSubject(id === 1001 ? 'acct-A' : 'acct-B').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(this.account.privateKey); }
  async machine() { return new SignJWT({ resource }).setProtectedHeader({ alg: 'ES256', kid: 'fixture-service' }).setSubject('navigator').setIssuer('https://service.example.test').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(this.service.privateKey); }
  async call(path: string, token?: string, body?: unknown, service = true, method = 'POST') {
    const headers: Record<string, string> = { Origin: issuer }; if (token) headers.Authorization = `Bearer ${token}`; if (service) headers['X-Service-Authorization'] = `Bearer ${await this.machine()}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async connect(id = 1001, generation = 1, mode = 'normal') {
    const token = await this.user(id, generation), start = await this.call('/oauth/start?purpose=repository', token);
    if (start.status !== 200) return start;
    const auth = new URL((await start.json() as { authorizationUrl: string }).authorizationUrl);
    return this.call('/oauth/callback?' + new URLSearchParams({ code: `${id}_${mode}`, state: auth.searchParams.get('state')! }), token, undefined, false, 'GET');
  }
  async opaque(token: string) {
    await this.call('/__fixture/seed-client', undefined, undefined, false);
    const verifier = generateRandomCodeVerifier(), url = new URL(issuer + '/authorize');
    url.search = new URLSearchParams({ client_id: 'synthetic-native-client', redirect_uri: 'https://client.example.test/callback', response_type: 'code', state: 'host-test-state', scope: 'repository:read', code_challenge: await calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', resource }).toString();
    const consent = await this.call('/authorize', token, { approved: true, authorizationUrl: url.toString() });
    if (consent.status !== 200) throw new Error('connector consent status ' + consent.status);
    const code = new URL((await consent.json() as { redirectTo: string }).redirectTo).searchParams.get('code')!;
    const response = await fetch(this.base + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'synthetic-native-client', redirect_uri: 'https://client.example.test/callback', code, code_verifier: verifier, resource }) });
    if (response.status !== 200) throw new Error('connector exchange status ' + response.status);
    return (await response.json() as { access_token: string }).access_token;
  }
  async stats() { return (await fetch(this.base + '/__fixture/stats')).json() as Promise<{ refresh: number; identity: number; unexpected: number }> }
  async read(token: string) { return this.call('/read', token, { requestId: 'host-fixture-read', resource, action: 'resolve_repository', repository: { id: 2001, owner: 'personal', name: 'same-name' } }); }
  async plaintextAbsent() {
    const scan = async (dir: string): Promise<boolean> => { for (const entry of await readdir(dir, { withFileTypes: true })) { const p = join(dir, entry.name); if (entry.isDirectory()) { if (!await scan(p)) return false; } else { const bytes = await readFile(p); if (bytes.includes(Buffer.from('INERT_ACCESS_')) || bytes.includes(Buffer.from('INERT_REFRESH_'))) return false; } } return true; };
    return scan(join(this.dir, 'state'));
  }
}
