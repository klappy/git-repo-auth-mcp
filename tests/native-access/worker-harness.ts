import { it, expect, vi } from 'vitest';
import { exportJWK } from 'jose';
import { accountWorker, AccountGrantObject, completeConnectorConsent, connectorSession, type AccountEnv } from '../../account/broker';
import { verifySession } from '../../account/session';
import { assertions, input, context, mockProvider, repositoryTransport } from './helpers';
import type { OAuthHelpers, AuthRequest } from '@cloudflare/workers-oauth-provider';

export async function harness() {
  const a = await assertions(), data = new Map<string,unknown>();
  const storage = {
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key,structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async transaction<T>(fn: (tx: unknown) => Promise<T>) { return fn(storage); },
  };
  const accountPublic = { ...await exportJWK(a.account.publicKey), kid:'synthetic-key' }, accountPrivate = { ...await exportJWK(a.account.privateKey),kid:'synthetic-key' };
  const servicePublic=await exportJWK(a.service.publicKey);
  const env: AccountEnv = { PRIVATE_ACTIVATION:'owner-verified', ACCOUNT_GRANTS:undefined as unknown as DurableObjectNamespace, ACCOUNT_ISSUER:a.policy.accountIssuer, SERVICE_ISSUER:a.policy.serviceIssuer, BROKER_AUDIENCE:a.policy.audience, RESOURCE:context.resource, SERVICE:context.service, ACCOUNT_JWKS:JSON.stringify({keys:[accountPublic]}),SERVICE_JWKS:JSON.stringify({keys:[servicePublic]}),ACCOUNT_SIGNING_JWK:JSON.stringify(accountPrivate),VAULT_KEY_HEX:'07'.repeat(32),GITHUB_CLIENT_ID:'synthetic-client',GITHUB_CLIENT_SECRET:'INERT_CLIENT_SECRET',GITHUB_CALLBACK:'https://account.example.test/oauth/callback' };
  const object=new AccountGrantObject({storage} as unknown as DurableObjectState,env);
  env.ACCOUNT_GRANTS={idFromName:(name:string)=>name,get:()=>object} as unknown as DurableObjectNamespace;
  const user=await a.user(),service=await a.machine();
  const request=(path:string,body?:unknown,extra:Record<string,string>={})=>new Request('https://account.example.test'+path,{method:'POST',headers:{Authorization:`Bearer ${user}`,'X-Service-Authorization':`Bearer ${service}`,Origin:'https://account.example.test',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const provider=mockProvider(),repo=repositoryTransport();
  const transport=(async(url:string|URL|Request,init?:RequestInit)=>String(url).includes('/repos/')?repo.fetcher(url,init):provider(url,init)) as typeof fetch;
  return {a,data,env,user,service,request,transport,repo};
}
