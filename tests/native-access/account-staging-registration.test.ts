vi.mock('cloudflare:workers',()=>({WorkerEntrypoint:class{}}));
import {describe,it,expect,vi} from 'vitest';
import worker from '../../account/broker';
import {AccountBrowserSessions} from '../../account/browser-session';
import {registrationTarget} from '../../account/staging-registration';
const env={ACCOUNT_ISSUER:registrationTarget.issuer,RESOURCE:registrationTarget.resource,PRIVATE_ACTIVATION:'disabled',STAGING_METADATA_DISCOVERY:'enabled',STAGING_CLIENT_REGISTRATION:'enabled',BROWSER_SESSION_KEY_HEX:'11'.repeat(32),VAULT_KEY_HEX:'22'.repeat(32)};
describe('staging registration integration',()=>{
 it('advertises registration only with exact enabled staging tuple while private remains off',async()=>{
  for(const [override,advertised] of [[{},true],[{STAGING_CLIENT_REGISTRATION:undefined},false],[{RESOURCE:'https://cartographer.klappy.dev/mcp'},false]] as const){
   const response=await worker.fetch(new Request(env.ACCOUNT_ISSUER+'/.well-known/oauth-authorization-server'),{...env,...override} as any,{} as any);
   const metadata=await response.json() as any;expect(metadata.registration_endpoint).toBe(advertised?env.ACCOUNT_ISSUER+'/register':undefined);
   expect(metadata.token_endpoint_auth_methods_supported).toEqual(['client_secret_basic','client_secret_post','none']);
  }
 });
 it('denies registration operations on other browser object IDs before storage',async()=>{
  let reads=0;const state={id:{equals:()=>false},storage:{transaction:()=>{reads++;throw Error('unexpected');}}};
  const object=new AccountBrowserSessions(state as any,{...env,ACCOUNT_BROWSER_SESSIONS:{idFromName:(name:string)=>{expect(name).toBe(registrationTarget.objectName);return {};}}} as any);
  const response=await object.fetch(new Request('https://internal.invalid',{method:'POST',body:JSON.stringify({operation:'registration-admit',attempt:crypto.randomUUID()})}));
  expect(response.status).toBe(403);expect(reads).toBe(0);
 });
 it('retains key and POST guards on the fixed object',async()=>{
  let reads=0;const state={id:{equals:()=>true},storage:{transaction:()=>{reads++;throw Error('unexpected');}}};
  for(const bad of [{BROWSER_SESSION_KEY_HEX:''},{VAULT_KEY_HEX:env.BROWSER_SESSION_KEY_HEX}]){
   const object=new AccountBrowserSessions(state as any,{...env,...bad,ACCOUNT_BROWSER_SESSIONS:{idFromName:()=>({})}} as any);
   expect((await object.fetch(new Request('https://internal.invalid',{method:'POST',body:JSON.stringify({operation:'registration-admit',attempt:crypto.randomUUID()})}))).status).toBe(403);
  }expect(reads).toBe(0);
 });
});
