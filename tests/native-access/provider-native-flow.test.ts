import {it,expect,vi} from 'vitest';
vi.mock('cloudflare:workers',()=>({WorkerEntrypoint:class{}}));
import worker,{accountWorker} from '../../account/broker';
import {generateRandomCodeVerifier,calculatePKCECodeChallenge} from 'oauth4webapi';
import {harness} from './worker-harness';
import {context,input} from './helpers';
import {verifySession} from '../../account/session';
it('actual Workers OAuth provider consent→PKCE token→opaque protected session→JWT→read and wrong resource denial',async()=>{
  const h=await harness(),kv=new Map<string,string>();
  h.env.ACCOUNT_CONNECTOR_KV={async get(key:string,options?:unknown){const value=kv.get(key);return value===undefined?null:(options==='json'||(options as {type?:string})?.type==='json')?JSON.parse(value):value;},async put(key:string,value:string){kv.set(key,value);},async delete(key:string){kv.delete(key);},async list(options?:{prefix?:string}){return {keys:[...kv.keys()].filter(k=>k.startsWith(options?.prefix??'')).map(name=>({name})),list_complete:true,cursor:''};}} as unknown as KVNamespace;
  kv.set('client:synthetic-native-client',JSON.stringify({clientId:'synthetic-native-client',redirectUris:['https://client.example.test/callback'],clientName:'Synthetic client',tokenEndpointAuthMethod:'none',grantTypes:['authorization_code','refresh_token'],responseTypes:['code']}));
  const ctx={waitUntil:()=>{},passThroughOnException:()=>{},props:{}} as unknown as ExecutionContext;
  vi.stubGlobal('fetch',h.transport);
  try {
    const start=await accountWorker.fetch(h.request('/oauth/start?purpose=repository'),h.env);const u=new URL((await start.json() as {authorizationUrl:string}).authorizationUrl);const callback=new URL(h.env.GITHUB_CALLBACK+'?code=synthetic');callback.searchParams.set('state',u.searchParams.get('state')!);expect((await accountWorker.fetch(new Request(callback,{headers:{Authorization:`Bearer ${h.user}`}}),h.env)).status).toBe(200);
    const verifier=generateRandomCodeVerifier(),auth=new URL('https://account.example.test/authorize');auth.search=new URLSearchParams({client_id:'synthetic-native-client',redirect_uri:'https://client.example.test/callback',response_type:'code',state:'synthetic-native-state',scope:'repository:read',code_challenge:await calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',resource:context.resource}).toString();
    const consent=await worker.fetch(h.request('/authorize',{approved:true,authorizationUrl:auth.toString()}),h.env,ctx);expect(consent.status).toBe(200);const redirect=new URL((await consent.json() as {redirectTo:string}).redirectTo);let code=redirect.searchParams.get('code')!;
    const exchange=(resource:string)=>new Request('https://account.example.test/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:'synthetic-native-client',redirect_uri:'https://client.example.test/callback',code,code_verifier:verifier,resource})});
    const wrong=await worker.fetch(exchange('https://navigator.example.test/other'),h.env,ctx);expect(wrong.status).toBe(400);
    const retryConsent=await worker.fetch(h.request('/authorize',{approved:true,authorizationUrl:auth.toString()}),h.env,ctx);code=new URL((await retryConsent.json() as {redirectTo:string}).redirectTo).searchParams.get('code')!;
    const tokenResponse=await worker.fetch(exchange(context.resource),h.env,ctx);expect(tokenResponse.status).toBe(200);const token=await tokenResponse.json() as {access_token:string};
    const session=await worker.fetch(h.request('/connector/session',undefined,{Authorization:`Bearer ${token.access_token}`}),h.env,ctx);expect(session.status).toBe(200);const value=await session.json() as {assertion:string};expect(await verifySession(value.assertion,h.service,h.a.policy)).toEqual(context);
    const read=await worker.fetch(h.request('/read',input,{Authorization:`Bearer ${value.assertion}`}),h.env,ctx);expect(read.status).toBe(200);expect(JSON.stringify(await read.json())).not.toContain('INERT_');
    expect((await worker.fetch(h.request('/connector/session',undefined,{Authorization:'Bearer wrong'}),h.env,ctx)).status).toBe(401);
    const disconnected=await accountWorker.fetch(h.request('/disconnect'),h.env);expect(disconnected.status).toBe(200);expect(await disconnected.json()).toEqual({generation:2});
    const reauthenticated=await h.a.user({grant_generation:2});
    const reconnectStart=await accountWorker.fetch(h.request('/oauth/start?purpose=repository',undefined,{Authorization:`Bearer ${reauthenticated}`}),h.env);
    const reconnectAuth=new URL((await reconnectStart.json() as {authorizationUrl:string}).authorizationUrl);
    const reconnectCallback=new URL(h.env.GITHUB_CALLBACK+'?code=synthetic-reconnect');reconnectCallback.searchParams.set('state',reconnectAuth.searchParams.get('state')!);
    expect((await accountWorker.fetch(new Request(reconnectCallback,{headers:{Authorization:`Bearer ${reauthenticated}`}}),h.env)).status).toBe(200);
    expect((await worker.fetch(h.request('/connector/session',undefined,{Authorization:`Bearer ${token.access_token}`}),h.env,ctx)).status).toBe(403);

  } finally {vi.unstubAllGlobals();}
});
