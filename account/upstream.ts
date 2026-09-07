import { AccessDenied } from './session';
import type { BrokerReadRequest } from './broker';
const SHA = /^[a-f0-9]{40}$/;
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
export function validateRead(input: BrokerReadRequest): void {
  if (!input || typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) || !['resolve_repository','resolve_ref','read_tree','read_archive','read_blob'].includes(input.action)) throw new AccessDenied();
  if (Object.keys(input).some(k => !['requestId','resource','action','repository','ref','sha','path'].includes(k))) throw new AccessDenied();
  const r = input.repository;
  if (r && Object.keys(r).some(k => !['owner','name','id'].includes(k))) throw new AccessDenied();
  if (!r || (r.id === undefined ? input.action !== 'resolve_repository' : !Number.isSafeInteger(r.id) || r.id <= 0) || !SEGMENT.test(r.owner) || !SEGMENT.test(r.name) || [r.owner,r.name].some(s => s === '.' || s === '..')) throw new AccessDenied();
  if (input.sha !== undefined && !SHA.test(input.sha)) throw new AccessDenied();
  if (input.ref !== undefined && (typeof input.ref !== 'string' || !input.ref || input.ref.length > 256 || /[\x00-\x20?#\\]/.test(input.ref) || input.ref.split('/').some(p => p === '..' || p === '.'))) throw new AccessDenied();
  if (input.path !== undefined && (typeof input.path !== 'string' || !input.path || input.path.length > 1024 || /[\x00-\x1f\\]/.test(input.path) || input.path.split('/').some(p => p === '..' || p === '.' || !p))) throw new AccessDenied();
  if (input.action === 'read_blob' && !input.path) throw new AccessDenied();
}
export class GitHubReads {
  constructor(private transport: typeof fetch, private maxBytes = 8 * 1024 * 1024) {}
  private async request(url: string, token?: string, binary = false, archivePath?: string): Promise<unknown> {
    const target = new URL(url);
    if (target.origin !== 'https://api.github.com' && !(binary && target.origin === 'https://codeload.github.com')) throw new AccessDenied();
    const headers: Record<string,string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'native-account-broker', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token && target.origin === 'https://api.github.com') headers.Authorization = `Bearer ${token}`;
    const response = await this.transport(url, { method: 'GET', headers, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      if (!binary || target.origin !== 'https://api.github.com') throw new AccessDenied();
      const redirect = new URL(response.headers.get('location') ?? '', url);
      // Codeload signed location is accepted only from this request; credentials never cross origins.
      if (redirect.origin !== 'https://codeload.github.com' || redirect.username || redirect.password || redirect.hash || !archivePath || redirect.pathname !== archivePath) throw new AccessDenied();
      return this.request(redirect.toString(), undefined, true, archivePath);
    }
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > this.maxBytes) throw new AccessDenied();
    const reader = response.body?.getReader(); if (!reader) throw new AccessDenied();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > this.maxBytes) { await reader.cancel(); throw new AccessDenied(); } chunks.push(value); }
    const body = new Uint8Array(size); let offset = 0; for (const c of chunks) { body.set(c, offset); offset += c.length; }
    if (binary) { let text = ''; for (const byte of body) text += String.fromCharCode(byte); return { encoding: 'base64', archive: btoa(text) }; }
    return JSON.parse(new TextDecoder().decode(body));
  }
  async read(input: BrokerReadRequest, token: string) {
    validateRead(input);
    const base = `https://api.github.com/repos/${encodeURIComponent(input.repository.owner)}/${encodeURIComponent(input.repository.name)}`;
    // Every request starts with a current provider authorization+canonical identity check. No decision cache.
    const repo = await this.request(base, token) as { id: number; full_name: string; default_branch: string; private: boolean };
    if (!Number.isSafeInteger(repo.id) || repo.id <= 0 || (input.repository.id !== undefined && repo.id !== input.repository.id) || repo.full_name?.toLowerCase() !== `${input.repository.owner}/${input.repository.name}`.toLowerCase()) throw new AccessDenied();
    const checkedAt = new Date().toISOString();
    const commit = await this.request(`${base}/commits/${encodeURIComponent(input.sha ?? input.ref ?? repo.default_branch)}`, token) as { sha: string; commit?: { tree?: { sha?: string } } };
    if (!SHA.test(commit.sha) || (input.sha && commit.sha !== input.sha)) throw new AccessDenied();
    let data: unknown;
    switch (input.action) {
      case 'resolve_repository': data = { id: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private }; break;
      case 'resolve_ref': data = { sha: commit.sha }; break;
      case 'read_tree': {
        if (!SHA.test(commit.commit?.tree?.sha ?? '')) throw new AccessDenied();
        data = await this.request(`${base}/git/trees/${commit.commit!.tree!.sha}?recursive=1`, token);
        const tree = data as { truncated?: boolean; tree?: { path?: string }[] };
        if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.some(e => typeof e.path !== 'string' || e.path.split('/').some(p => p === '..' || p === '.' || !p))) throw new AccessDenied();
        break;
      }
      case 'read_blob': {
        const blob = await this.request(`${base}/contents/${input.path!.split('/').map(encodeURIComponent).join('/')}?ref=${commit.sha}`, token) as { type?: string; path?: string; sha?: string; content?: string; encoding?: string };
        if (blob.type !== 'file' || blob.path !== input.path || !SHA.test(blob.sha ?? '') || blob.encoding !== 'base64' || typeof blob.content !== 'string' || atob(blob.content).includes(token)) throw new AccessDenied();
        data = { path: blob.path, sha: blob.sha, encoding: blob.encoding, content: blob.content }; break;
      }
      case 'read_archive': data = await this.request(`${base}/tarball/${commit.sha}`, token, true, `/${repo.full_name}/legacy.tar.gz/${commit.sha}`); break;
    }
    // A provider malfunction must not make even a sentinel bearer an outbound data value.
    if (JSON.stringify(data).includes(token)) throw new AccessDenied();
    return { checkedAt, repositoryId: repo.id, snapshotSha: commit.sha, data };
  }
}
