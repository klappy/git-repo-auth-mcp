import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function validateNativeProduction(config, env, head, bytes) {
 assert.equal(env.WORKERS_CI_BRANCH, 'production');
 assert.equal(env.WRANGLER_CI_OVERRIDE_NAME, 'native-account-broker-production-v1');
 assert.match(env.NATIVE_PRODUCTION_REVIEWED_SHA ?? '', /^[a-f0-9]{40}$/);
 assert.equal(head, env.NATIVE_PRODUCTION_REVIEWED_SHA);
 assert.match(env.NATIVE_PRODUCTION_CONFIG_SHA256 ?? '', /^[a-f0-9]{64}$/);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),env.NATIVE_PRODUCTION_CONFIG_SHA256);
 assert.equal(config.name,'native-account-broker-production-v1'); assert.equal(config.main,'broker.ts');
 assert.equal(config.workers_dev,false); assert.equal(config.preview_urls,false);
 assert.deepEqual(config.observability,{enabled:false,logs:{enabled:false,invocation_logs:false},traces:{enabled:false}});
 assert.deepEqual(config.routes,[{pattern:'account.klappy.dev',custom_domain:true,zone_id:'d3fb39dede08497b44146266cc7c6d4e'}]);
 const v=config.vars;
 for(const key of ['PRIVATE_ACTIVATION','STAGING_CLIENT_REGISTRATION','PRODUCTION_CLIENT_REGISTRATION','STAGING_METADATA_DISCOVERY'])assert.equal(v[key],'disabled');
 assert.equal(v.ACCOUNT_ISSUER,'https://account.klappy.dev'); assert.equal(v.SERVICE_ISSUER,'https://cartographer.klappy.dev');
 assert.equal(v.BROKER_AUDIENCE,'https://account.klappy.dev/read'); assert.equal(v.RESOURCE,'https://cartographer.klappy.dev/mcp'); assert.equal(v.SERVICE,'cartographer');
 assert.equal(v.GITHUB_CALLBACK,'https://account.klappy.dev/oauth/callback'); assert.equal(v.ACCOUNT_LOGIN_CALLBACK,'https://account.klappy.dev/account/callback');
 assert.equal(config.kv_namespaces.length,1); const kv=config.kv_namespaces[0];
 assert.equal(kv.binding,'ACCOUNT_CONNECTOR_KV'); assert.equal(kv.remote,false); assert.match(kv.id,/^[a-f0-9]{32}$/);
 assert.equal(kv.id,'2e6b07e0a24c44418565aab36255139f');
 assert.deepEqual(config.durable_objects,{bindings:[{name:'ACCOUNT_GRANTS',class_name:'AccountGrantObject'},{name:'ACCOUNT_BROWSER_SESSIONS',class_name:'AccountBrowserSessions'},{name:'ACCOUNT_IDENTITY_REGISTRY',class_name:'AccountIdentityRegistry'}]});
 assert.deepEqual(config.migrations,[{tag:'account-v1',new_sqlite_classes:['AccountGrantObject']},{tag:'account-browser-v1',new_sqlite_classes:['AccountBrowserSessions','AccountIdentityRegistry']}]);
 for(const key of ['ACCOUNT_SIGNING_JWK','VAULT_KEY_HEX','BROWSER_SESSION_KEY_HEX','BROWSER_SESSION_PREVIOUS_KEYS_JSON','GITHUB_CLIENT_SECRET'])assert.ok(!(key in v));
 // Public trust/client may remain unbound for disabled bootstrap, but no staging material is accepted.
 assert.ok(!JSON.stringify(v).includes('staging'));
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  assert.equal(process.argv.length,2);
  const ts=await import('typescript');
  const path='account/wrangler.production.jsonc', bytes=readFileSync(path,'utf8');
  const parsed=ts.default.parseConfigFileTextToJson(path,bytes); assert.equal(parsed.error,undefined);
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  validateNativeProduction(parsed.config,process.env,head,bytes);
  execFileSync('npx',['--no-install','wrangler','deploy','--config',path,'--experimental-autoconfig=false','--keep-vars'],{stdio:'inherit'});
 }catch{
  console.error('Native production deployment refused or failed. Check the reviewed commit/config and dedicated Worker target.');process.exitCode=1;
 }
}
