import { it, expect } from 'vitest';
import { GrantVault } from '../../account/grants';
import { MemoryStore, credential } from './helpers';
it('bootstrap never creates authority or resets revoked/uncertain generations', async () => {
  const store = new MemoryStore(), vault = new GrantVault(store, new Uint8Array(32), 'managed-A');
  expect(await vault.bootstrap(1001)).toEqual({ generation: 1, status: 'absent' }); expect(store.record).toBeUndefined();
  await vault.connect(credential(), 1); expect(await vault.bootstrap(1001)).toEqual({ generation: 1, status: 'verified' });
  await expect(vault.bootstrap(1002)).rejects.toThrow();
  await vault.revoke(); expect(await vault.bootstrap(1001)).toEqual({ generation: 2, status: 'revoked' });
  await expect(vault.connect(credential(), 1)).rejects.toThrow(); await vault.connect(credential(), 2);
  store.record!.status = 'refreshing'; await expect(vault.bootstrap(1001)).rejects.toThrow();
});
