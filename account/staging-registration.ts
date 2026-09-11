export const registrationTarget=Object.freeze({issuer:'https://account-staging.klappy.dev',resource:'https://cartographer-staging.klappy.dev/mcp',objectName:'staging-client-registration-v1',limit:10});
export type RegistrationEnv={ACCOUNT_ISSUER:string;RESOURCE:string;STAGING_CLIENT_REGISTRATION?:string;PRODUCTION_CLIENT_REGISTRATION?:string;ACCOUNT_CONNECTOR_KV?:KVNamespace;ACCOUNT_BROWSER_SESSIONS?:DurableObjectNamespace};
export const productionRegistrationTarget=Object.freeze({issuer:'https://account.klappy.dev',resource:'https://cartographer.klappy.dev/mcp',objectName:'production-client-registration-v1',limit:10});
export function selectedRegistrationTarget(env:RegistrationEnv){
 if(env.STAGING_CLIENT_REGISTRATION==='enabled'&&env.ACCOUNT_ISSUER===registrationTarget.issuer&&env.RESOURCE===registrationTarget.resource)return registrationTarget;
 if(env.PRODUCTION_CLIENT_REGISTRATION==='enabled'&&env.ACCOUNT_ISSUER===productionRegistrationTarget.issuer&&env.RESOURCE===productionRegistrationTarget.resource)return productionRegistrationTarget;
 return undefined;
}
export function registrationEnabled(env:RegistrationEnv){return selectedRegistrationTarget(env)!==undefined;}
const headers={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','Pragma':'no-cache','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const failure=(status:number,error:string)=>Response.json({error},{status,headers});
export async function boundedMetadata(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))throw Error('invalid_client_metadata');
 const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>8192))throw Error('invalid_client_metadata');
 if(!request.body)throw Error('invalid_client_metadata');const reader=request.body.getReader();let size=0,expired=false;const chunks:Uint8Array[]=[];const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},5000);
 try {while(true){const {value,done}=await reader.read();if(expired)throw Error('invalid_client_metadata');if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw Error('invalid_client_metadata');}chunks.push(value);}const bytes=new Uint8Array(size);let pos=0;for(const v of chunks){bytes.set(v,pos);pos+=v.byteLength;}const v=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));if(!v||typeof v!=='object'||Array.isArray(v))throw Error('invalid_client_metadata');
  if(!Array.isArray(v.redirect_uris)||v.redirect_uris.length!==1||typeof v.redirect_uris[0]!=='string')throw Error('invalid_client_metadata');
  const redirect=v.redirect_uris[0];if(!/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/.test(redirect))throw Error('invalid_client_metadata');
  const method=v.token_endpoint_auth_method??'client_secret_basic';if(!['none','client_secret_basic','client_secret_post'].includes(method))throw Error('invalid_client_metadata');
  const grants=v.grant_types??['authorization_code','refresh_token'];if(!Array.isArray(grants)||!grants.includes('authorization_code')||grants.length<1||grants.length>2||new Set(grants).size!==grants.length||grants.some(x=>!['authorization_code','refresh_token'].includes(x)))throw Error('invalid_client_metadata');
  const responses=v.response_types??['code'];if(JSON.stringify(responses)!==JSON.stringify(['code']))throw Error('invalid_client_metadata');
  if(v.scope!==undefined&&v.scope!=='repository:read')throw Error('invalid_client_metadata');
  if(v.client_name!==undefined&&(typeof v.client_name!=='string'||v.client_name.length>100))throw Error('invalid_client_metadata');
  // RFC registration extensions are ignored, never forwarded into rendered metadata.
  return {redirect_uris:[redirect],token_endpoint_auth_method:method,grant_types:grants,response_types:['code'],client_name:v.client_name||'Cartographer connection'};
 }finally{clearTimeout(timer);reader.releaseLock();}
}
type Entry={attempt:string;state:'admitted'|'write-started'|'written';clientId?:string};
export async function registrationLedger(storage:DurableObjectStorage,value:{operation:string;attempt:string;clientId?:string}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 const client=/^[A-Za-z0-9_-]{16,128}$/;
 if(!value||typeof value.attempt!=='string'||!uuid.test(value.attempt)||!['registration-admit','registration-write-started','registration-written'].includes(value.operation))throw Error('registration_denied');
 if(Object.keys(value).sort().join(',')!==(value.operation==='registration-admit'?'attempt,operation':'attempt,clientId,operation'))throw Error('registration_denied');
 return storage.transaction(async tx=>{const raw=await tx.get<Entry[]>('registration-ledger:v1');const entries=raw===undefined?[]:raw;
  if(!Array.isArray(entries)||entries.length>10)throw Error('registration_denied');const attempts=new Set<string>(),ids=new Set<string>();
  for(const e of entries){if(!e||typeof e!=='object'||typeof e.attempt!=='string'||!uuid.test(e.attempt)||attempts.has(e.attempt)||!['admitted','write-started','written'].includes(e.state)||Object.keys(e).sort().join(',')!==(e.state==='admitted'?'attempt,state':'attempt,clientId,state'))throw Error('registration_denied');attempts.add(e.attempt);if(e.state!=='admitted'){if(typeof e.clientId!=='string'||!client.test(e.clientId)||ids.has(e.clientId))throw Error('registration_denied');ids.add(e.clientId);}}
  if(value.operation==='registration-admit'){if(entries.length>=10||attempts.has(value.attempt))return {admitted:false};entries.push({attempt:value.attempt,state:'admitted'});await tx.put('registration-ledger:v1',entries);return {admitted:true};}
  const entry=entries.find(e=>e.attempt===value.attempt);if(!entry||typeof value.clientId!=='string'||!client.test(value.clientId))throw Error('registration_denied');
  if(value.operation==='registration-write-started'&&entry.state==='admitted'&&!ids.has(value.clientId)){entry.state='write-started';entry.clientId=value.clientId;}
  else if(value.operation==='registration-written'&&entry.state==='write-started'&&entry.clientId===value.clientId)entry.state='written';else throw Error('registration_denied');
  await tx.put('registration-ledger:v1',entries);return {recorded:true};
 });
}
export async function stagingRegistration(request:Request,env:RegistrationEnv,ctx:ExecutionContext):Promise<Response|null>{
 const url=new URL(request.url);if(url.pathname!=='/register')return null;
 const target=selectedRegistrationTarget(env);
 if(!target||url.origin!==target.issuer||url.search||url.hash)return failure(404,'not_found');
 if(request.method!=='POST')return failure(405,'invalid_request');
 let metadata;try{metadata=await boundedMetadata(request);}catch{return failure(400,'invalid_client_metadata');}
 if(!env.ACCOUNT_CONNECTOR_KV||!env.ACCOUNT_BROWSER_SESSIONS)return failure(503,'temporarily_unavailable');
 const attempt=crypto.randomUUID(),stub=env.ACCOUNT_BROWSER_SESSIONS.get(env.ACCOUNT_BROWSER_SESSIONS.idFromName(target.objectName));
 const record=async(operation:string,clientId?:string)=>{const r=await stub.fetch('https://internal.invalid/',{method:'POST',body:JSON.stringify({operation,attempt,...(clientId?{clientId}:{})})});if(!r.ok)throw Error('registration_denied');return r.json() as Promise<{admitted?:boolean;recorded?:boolean}>;};
 try{
  if(!(await record('registration-admit')).admitted)return failure(429,'temporarily_unavailable');
  let puts=0;const kv={async put(key:string,value:string,options?:KVNamespacePutOptions){if(++puts!==1||!/^client:[A-Za-z0-9_-]{16,128}$/.test(key)||options&&Object.keys(options).length)throw Error('registration_denied');const id=key.slice(7);if(!(await record('registration-write-started',id)).recorded)throw Error('registration_denied');await env.ACCOUNT_CONNECTOR_KV!.put(key,value);if(!(await record('registration-written',id)).recorded)throw Error('registration_denied');}} as unknown as KVNamespace;
  const {default:OAuthProvider}=await import('@cloudflare/workers-oauth-provider');
  const deny={fetch:async()=>failure(403,'access_denied')};const provider=new OAuthProvider({apiRoute:target.resource,apiHandler:deny,defaultHandler:deny,authorizeEndpoint:target.issuer+'/authorize',tokenEndpoint:target.issuer+'/token',clientRegistrationEndpoint:target.issuer+'/register',clientRegistrationTTL:undefined,clientIdMetadataDocumentEnabled:false,allowPlainPKCE:false,resourceMatchOriginOnly:false,scopesSupported:['repository:read']});
  const response=await provider.fetch(new Request(target.issuer+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)}),{OAUTH_KV:kv},ctx);
  for(const[k,v]of Object.entries(headers))response.headers.set(k,v);return response;
 }catch{return failure(503,'temporarily_unavailable');}
}

