import{it,expect}from'vitest';
import{Miniflare}from'miniflare';
import{build}from'esbuild';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
it('actual durable transactions cap concurrent calls and retain admission across restart',async()=>{
 const built=await build({stdin:{contents:`import{registrationLedger}from'./account/staging-registration';export class LedgerFixture{constructor(state){this.state=state;}async fetch(request){try{return Response.json(await registrationLedger(this.state.storage,await request.json()));}catch{return new Response(null,{status:403});}}}export default{fetch(request,env){return env.LEDGER.get(env.LEDGER.idFromName('fixed-test-ledger')).fetch(request);}};`,resolveDir:process.cwd(),sourcefile:'ledger-fixture.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
 const dir=mkdtempSync(join(tmpdir(),'dcr-ledger-'));const create=()=>new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-06-01',durableObjects:{LEDGER:'LedgerFixture'},durableObjectsPersist:dir});let mf=create();
 const call=(value:any)=>mf.dispatchFetch('https://fixture.invalid/',{method:'POST',body:JSON.stringify(value)});
 try{const attempts=Array.from({length:20},()=>crypto.randomUUID());const responses=await Promise.all(attempts.map(attempt=>call({operation:'registration-admit',attempt})));const accepted:boolean[]=await Promise.all(responses.map(async r=>(await r.json() as any).admitted));expect(accepted.filter(Boolean)).toHaveLength(10);const admitted=attempts[accepted.findIndex(Boolean)];await mf.dispose();mf=create();expect(await(await call({operation:'registration-admit',attempt:crypto.randomUUID()})).json()).toEqual({admitted:false});expect((await call({operation:'registration-write-started',attempt:admitted,clientId:'SYNTHETIC_CLIENT_'})).status).toBe(200);await mf.dispose();mf=create();expect((await call({operation:'registration-write-started',attempt:admitted,clientId:'SYNTHETIC_CLIENT_'})).status).toBe(403);expect(await(await call({operation:'registration-admit',attempt:crypto.randomUUID()})).json()).toEqual({admitted:false});}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true});}
},30000);
