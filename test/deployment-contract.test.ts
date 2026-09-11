import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Deployment scripts are intentionally executable JavaScript.
// @ts-expect-error no declaration required for the CLI module
import { validateDeployment } from '../scripts/validate-deployment.mjs';

const stagingPath = 'account/wrangler.staging.jsonc';
const productionPath = 'wrangler.jsonc';
const read = (path: string) => ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8')).config;
const staging = { WORKERS_CI_BRANCH: 'main', WRANGLER_CI_OVERRIDE_NAME: 'native-account-broker-staging-v15' };
const production = { WORKERS_CI_BRANCH: 'production', WRANGLER_CI_OVERRIDE_NAME: 'git-repo-auth-mcp' };

describe('deployment topology', () => {
  it('accepts the two exact connected build contracts', () => {
    expect(() => validateDeployment('staging', stagingPath, read(stagingPath), staging)).not.toThrow();
    expect(() => validateDeployment('production', productionPath, read(productionPath), production)).not.toThrow();
  });
  it.each([undefined, '', 'HEAD', 'detached', 'feature/fix', 'production', 'dish/2026-09-07-native-staging-public'])('denies staging branch %s', branch => {
    expect(() => validateDeployment('staging', stagingPath, read(stagingPath), { ...staging, WORKERS_CI_BRANCH: branch })).toThrow();
  });
  it.each([undefined, 'main', 'feature/fix'])('denies production branch %s', branch => {
    expect(() => validateDeployment('production', productionPath, read(productionPath), { ...production, WORKERS_CI_BRANCH: branch })).toThrow();
  });
  it('denies missing/wrong Worker and crossed configurations', () => {
    for (const worker of [undefined, 'git-repo-auth-mcp', 'other-worker']) {
      expect(() => validateDeployment('staging', stagingPath, read(stagingPath), { ...staging, WRANGLER_CI_OVERRIDE_NAME: worker })).toThrow();
    }
    expect(() => validateDeployment('staging', productionPath, read(productionPath), staging)).toThrow();
    expect(() => validateDeployment('production', stagingPath, read(stagingPath), production)).toThrow();
    expect(() => validateDeployment('production', productionPath, read(stagingPath), production)).toThrow();
  });
  it('denies staging resource, route, entrypoint and activation drift', () => {
    for (const mutate of [
      (c: any) => { c.name = 'git-repo-auth-mcp'; },
      (c: any) => { c.main = '../src/index.ts'; },
      (c: any) => { c.vars.PRIVATE_ACTIVATION = 'owner-verified'; },
      (c: any) => { c.kv_namespaces[0].id = ''; },
      (c: any) => { c.routes[0].pattern = 'account.klappy.dev'; },
      (c: any) => { c.workers_dev = true; },
      (c: any) => { c.preview_urls = true; },
      (c: any) => { c.observability.enabled = true; },
    ]) {
      const config = read(stagingPath); mutate(config);
      expect(() => validateDeployment('staging', stagingPath, config, staging)).toThrow();
    }
  });
});
