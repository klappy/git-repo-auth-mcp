import { it, expect, vi } from 'vitest';
import { exportJWK } from 'jose';
import { accountWorker, AccountGrantObject, completeConnectorConsent, connectorSession, type AccountEnv } from '../../account/broker';
import { verifySession } from '../../account/session';
import { assertions, input, context, mockProvider, repositoryTransport } from './helpers';
import type { OAuthHelpers, AuthRequest } from '@cloudflare/workers-oauth-provider';

import {harness} from './worker-harness';
it('actual Worker/DO assembly runs PKCE callback, custody, renewal, signed read and disconnect using synthetic adapters',async()=>{
  const h=await harness();vi.stubGlobal('fetch',h.transport);
  try {
    const start=await accountWorker.fetch(h.request('/oauth/start?purpose=repository'),h.env);expect(start.status).toBe(200);
    const auth=new URL((await start.json() as {authorizationUrl:string}).authorizationUrl);
    const callback=new URL(h.env.GITHUB_CALLBACK);callback.searchParams.set('state',auth.searchParams.get('state')!);callback.searchParams.set('code','synthetic-code');
    const connected=await accountWorker.fetch(new Request(callback,{headers:{Cookie:`__Host-account_assertion=${h.user}`}}),h.env);expect(connected.status).toBe(200);expect(await connected.json()).toEqual({connected:true,generation:1});
    expect(JSON.stringify(h.data.get('grant'))).not.toContain('INERT_');
    const renewed=await accountWorker.fetch(h.request('/session/renew'),h.env);expect(renewed.status).toBe(200);const renewal=await renewed.json() as {assertion:string};expect(await verifySession(renewal.assertion,h.service,h.a.policy)).toEqual(context);
    const response=await accountWorker.fetch(h.request('/read',input,{Authorization:`Bearer ${renewal.assertion}`}),h.env);expect(response.status).toBe(200);const result=await response.json();expect(result).toMatchObject({subject:'acct-A',repository:{id:2001},generation:1,intent:{path:'docs/cookbook.md'}});expect(JSON.stringify(result)).not.toContain('INERT_');
    expect((await accountWorker.fetch(h.request('/disconnect'),h.env)).status).toBe(204);
    const before=h.repo.calls.length;expect((await accountWorker.fetch(h.request('/read',input),h.env)).status).toBe(403);expect(h.repo.calls).toHaveLength(before);
    expect((await accountWorker.fetch(h.request('/session/renew'),h.env)).status).toBe(403);
  } finally {vi.unstubAllGlobals();}
});
it('connector consent requires explicit authenticated same-origin approval, exact resource and registered client; safe props renew a current assertion',async()=>{
  const h=await harness();vi.stubGlobal('fetch',h.transport);
  try {
    const start=await accountWorker.fetch(h.request('/oauth/start?purpose=repository'),h.env);const u=new URL((await start.json() as {authorizationUrl:string}).authorizationUrl);const callback=new URL(h.env.GITHUB_CALLBACK+'?code=synthetic');callback.searchParams.set('state',u.searchParams.get('state')!);await accountWorker.fetch(new Request(callback,{headers:{Authorization:`Bearer ${h.user}`}}),h.env);
    const auth={clientId:'synthetic-native-client',resource:context.resource,scope:['repository:read']} as AuthRequest;
    const complete=vi.fn(async()=>({redirectTo:'https://client.example.test/callback?code=synthetic-native-code'}));
    const helpers={parseAuthRequest:vi.fn(async()=>auth),lookupClient:vi.fn(async()=>({clientId:auth.clientId})),completeAuthorization:complete} as unknown as OAuthHelpers;
    const body={approved:true,authorizationUrl:'https://account.example.test/authorize?client_id=synthetic-native-client'};
    const response=await completeConnectorConsent(h.request('/authorize',body),h.env,helpers);expect(response.status).toBe(200);
    const props=(complete.mock.calls as unknown as [{props:unknown}][])[0][0].props;expect(JSON.stringify(props)).not.toContain('INERT_');
    const session=await connectorSession(h.request('/connector/session'),h.env,props);expect(session.status).toBe(200);expect(await verifySession((await session.json() as {assertion:string}).assertion,h.service,h.a.policy)).toEqual(context);
    for(const invalid of [{...body,approved:false},{...body,authorizationUrl:'https://evil.example.test/authorize'}])await expect(completeConnectorConsent(h.request('/authorize',invalid),h.env,helpers)).rejects.toThrow();
    await expect(completeConnectorConsent(h.request('/authorize',body,{Origin:'https://evil.example.test'}),h.env,helpers)).rejects.toThrow();
    auth.resource='https://navigator.example.test/other';await expect(completeConnectorConsent(h.request('/authorize',body),h.env,helpers)).rejects.toThrow();expect(complete).toHaveBeenCalledTimes(1);
  } finally {vi.unstubAllGlobals();}
});
