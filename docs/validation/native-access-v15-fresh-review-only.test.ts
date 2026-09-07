import { it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { BrowserSessions, AccountBrowserSessions } from '../../account/browser-session';
class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T; }
  async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') this.data.set(key, structuredClone(value)); else for (const [k,v] of Object.entries(key)) this.data.set(k, structuredClone(v)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({prefix,limit}: {prefix:string;limit:number}) { return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).slice(0,limit)) as Map<string,T>; }
  async transaction<T>(fn: (tx: DurableObjectTransaction)=>Promise<T>) { return fn(this as unknown as DurableObjectTransaction); }
}
it.each(['revoke-all','rotation'])('reviewer: %s invalidates captured final repository AND connector proof without grant dispatch', async mode => {
  const raw = new Storage(), storage = raw as unknown as DurableObjectStorage;
  const sessions = new BrowserSessions(storage, new Uint8Array(32).fill(0xab));
  async function issue(browser:string, activeHandle?:string) {
    const p=await sessions.begin(browser,activeHandle);
    const transaction={kind:'identity-bootstrap' as const,state:crypto.randomUUID(),verifier:'SYNTHETIC_REVIEW_ONLY',callback:'https://fixture.invalid/account/callback',expiresAt:Date.now()+300000};
    await sessions.start(browser,p.nonce,transaction);
    return sessions.activate(1001,(await sessions.consume(browser,p.nonce,transaction.state)).proof);
  }
  const first=await issue('1'.repeat(64)), second=await issue('2'.repeat(64));
  const captured=await sessions.load(first.handle);
  const proof={handle:first.handle,generation:captured.generation,accountEpoch:captured.accountEpoch,subject:captured.identity.subject,githubId:1001};
  const grantDispatch=vi.fn(async()=>Response.json({generation:2}));
  const object=new AccountBrowserSessions({storage,blockConcurrencyWhile:async(fn:()=>Promise<Response>)=>fn()} as unknown as DurableObjectState,{BROWSER_SESSION_KEY_HEX:'ab'.repeat(32),PRIVATE_ACTIVATION:'owner-verified',ACCOUNT_GRANTS:{idFromName:(s:string)=>s,get:()=>({fetch:grantDispatch})}} as never);
  if(mode==='revoke-all') await sessions.signout(second.handle,second.csrf,true);
  else await issue('1'.repeat(64),first.handle);
  for(const operation of ['commit-repository','commit-connector']) {
    const r=await object.fetch(new Request('https://internal.invalid/',{method:'POST',body:JSON.stringify({operation,handle:first.handle,proof,candidateId:crypto.randomUUID(),assertion:'SYNTHETIC_REVIEW_ONLY',authorizationUrl:'https://fixture.invalid/authorize'})}));
    expect(r.status).toBe(403);
  }
  expect(grantDispatch).not.toHaveBeenCalled();
});
