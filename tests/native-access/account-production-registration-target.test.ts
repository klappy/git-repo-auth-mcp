vi.mock('cloudflare:workers',()=>({WorkerEntrypoint:class{}}));
import {it,expect,vi} from 'vitest';
import {AccountBrowserSessions} from '../../account/browser-session';
import {selectedRegistrationTarget,registrationTarget,productionRegistrationTarget,stagingRegistration} from '../../account/staging-registration';
it('selects only exact independently enabled tuples; cross origins never touch custody',async()=>{
 const production={ACCOUNT_ISSUER:productionRegistrationTarget.issuer,RESOURCE:productionRegistrationTarget.resource,PRODUCTION_CLIENT_REGISTRATION:'enabled'};
 expect(selectedRegistrationTarget(production)).toBe(productionRegistrationTarget);
 expect(selectedRegistrationTarget({...production,PRODUCTION_CLIENT_REGISTRATION:undefined,STAGING_CLIENT_REGISTRATION:'enabled'})).toBeUndefined();
 expect(selectedRegistrationTarget({...production,RESOURCE:registrationTarget.resource,STAGING_CLIENT_REGISTRATION:'enabled'})).toBeUndefined();
 expect(selectedRegistrationTarget({...production,ACCOUNT_ISSUER:registrationTarget.issuer,STAGING_CLIENT_REGISTRATION:'enabled'})).toBeUndefined();
 const response=await stagingRegistration(new Request(registrationTarget.issuer+'/register',{method:'POST'}),{...production,STAGING_CLIENT_REGISTRATION:'enabled',ACCOUNT_CONNECTOR_KV:{get(){throw Error('custody');}}} as any,{} as any);
 expect(response!.status).toBe(404);
});
it('production ledger operations reject the staging object identity before storage',async()=>{
 let reads=0;
 const state={id:{equals:(other:unknown)=>other===registrationTarget.objectName},storage:{transaction(){reads++;throw Error('storage');}}};
 const env={ACCOUNT_ISSUER:productionRegistrationTarget.issuer,RESOURCE:productionRegistrationTarget.resource,PRODUCTION_CLIENT_REGISTRATION:'enabled',STAGING_CLIENT_REGISTRATION:'enabled',BROWSER_SESSION_KEY_HEX:'11'.repeat(32),VAULT_KEY_HEX:'22'.repeat(32),ACCOUNT_BROWSER_SESSIONS:{idFromName:(name:string)=>name}};
 const object=new AccountBrowserSessions(state as any,env as any);
 const r=await object.fetch(new Request('https://internal.invalid/',{method:'POST',body:JSON.stringify({operation:'registration-admit',attempt:crypto.randomUUID()})}));
 expect(r.status).toBe(403);expect(reads).toBe(0);
});
