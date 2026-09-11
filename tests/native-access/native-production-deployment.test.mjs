import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateNativeProduction} from '../../scripts/deploy-native-production.mjs';
const proposal=JSON.parse(readFileSync(new URL('../../account/wrangler.production.jsonc',import.meta.url),'utf8').replace(/^\/\/.*$/gm,''));
function fixture(){const c=structuredClone(proposal);const bytes=JSON.stringify(c);return {c,bytes,head:'b'.repeat(40),env:{WORKERS_CI_BRANCH:'production',WRANGLER_CI_OVERRIDE_NAME:'native-account-broker-production-v1',NATIVE_PRODUCTION_REVIEWED_SHA:'b'.repeat(40),NATIVE_PRODUCTION_CONFIG_SHA256:createHash('sha256').update(bytes).digest('hex')}};}
test('disabled bootstrap accepts a bound dedicated KV and exact reviewed bytes',()=>{const f=fixture();validateNativeProduction(f.c,f.env,f.head,f.bytes);});
test('missing/mismatched review pins and wrong branch or Worker deny',()=>{for(const patch of [{WORKERS_CI_BRANCH:'main'},{WORKERS_CI_BRANCH:''},{WRANGLER_CI_OVERRIDE_NAME:'git-repo-auth-mcp'},{NATIVE_PRODUCTION_REVIEWED_SHA:''},{NATIVE_PRODUCTION_REVIEWED_SHA:'c'.repeat(40)},{NATIVE_PRODUCTION_CONFIG_SHA256:'d'.repeat(64)}]){const f=fixture();assert.throws(()=>validateNativeProduction(f.c,{...f.env,...patch},f.head,f.bytes));}});
test('unbound or staging KV and sibling Worker DO binding deny',()=>{for(const mutate of [c=>c.kv_namespaces[0].id='UNBOUND',c=>c.kv_namespaces[0].id='f1175de951844fbd80942d82c8416903',c=>c.durable_objects.bindings[0].script_name='native-account-broker-staging-v15']){const f=fixture();mutate(f.c);assert.throws(()=>validateNativeProduction(f.c,f.env,f.head,f.bytes));}});
test('activation, logging, preview, callback drift and plain secrets deny',()=>{for(const mutate of [c=>c.vars.PRIVATE_ACTIVATION='owner-verified',c=>c.vars.PRODUCTION_CLIENT_REGISTRATION='enabled',c=>c.observability.enabled=true,c=>c.preview_urls=true,c=>c.vars.GITHUB_CALLBACK='https://account-staging.klappy.dev/oauth/callback',c=>c.vars.GITHUB_CLIENT_SECRET='synthetic']){const f=fixture();mutate(f.c);assert.throws(()=>validateNativeProduction(f.c,f.env,f.head,f.bytes));}});
