import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const targets = {
  staging: { branch: 'main', worker: 'native-account-broker-staging-v15', config: 'account/wrangler.staging.jsonc', entry: 'broker.ts' },
  production: { branch: 'production', worker: 'git-repo-auth-mcp', config: 'wrangler.jsonc', entry: 'src/index.ts' },
};

export function validateDeployment(target, configPath, config, env) {
  assert.ok(Object.hasOwn(targets, target), 'unknown deployment target');
  const expected = targets[target];
  assert.equal(configPath, expected.config, 'wrong configuration path');
  assert.equal(env.WORKERS_CI_BRANCH, expected.branch, 'wrong or missing build branch');
  assert.equal(env.WRANGLER_CI_OVERRIDE_NAME, expected.worker, 'wrong or missing connected Worker');
  assert.equal(config.name, expected.worker, 'wrong configured Worker');
  assert.equal(config.main, expected.entry, 'wrong entrypoint');
  if (target === 'staging') {
    assert.equal(config.vars?.PRIVATE_ACTIVATION, 'disabled');
    assert.equal(config.vars?.STAGING_CLIENT_REGISTRATION, 'disabled');
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.observability?.enabled, false);
    assert.deepEqual(config.routes, [{ pattern: 'account-staging.klappy.dev', custom_domain: true, zone_id: 'd3fb39dede08497b44146266cc7c6d4e' }]);
    assert.deepEqual(config.kv_namespaces, [{ binding: 'ACCOUNT_CONNECTOR_KV', remote: false, id: 'f1175de951844fbd80942d82c8416903' }]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [target, configPath, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0);
    assert.ok(Object.hasOwn(targets, target));
    assert.equal(configPath, targets[target].config);
    const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(new URL(`../${configPath}`, import.meta.url), 'utf8'));
    assert.equal(parsed.error, undefined);
    validateDeployment(target, configPath, parsed.config, process.env);
    console.log(`Deployment contract validated: ${target}.`);
  } catch {
    console.error('Deployment refused: verify target, build branch, connected Worker and configuration.');
    process.exitCode = 1;
  }
}
