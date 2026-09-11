import {it,expect} from 'vitest';
import fixtures from './fixtures/identity-repositories.json';
import {setup,input,context,SHA} from './helpers';
it('one account navigates three distinct owners and non-main defaults without reconnect',async()=>{const x=await setup();for(const r of fixtures.repositories){const result=await x.broker.read({...input,repository:{owner:r.owner,name:r.name,id:r.id}},context);expect(result.repository.id).toBe(r.id);expect(result.snapshotSha).toBe(SHA);expect(result.intent).toEqual({path:'docs/cookbook.md'});expect(atob((result.data as {content:string}).content)).toBe(r.marker);expect(x.calls.some(c=>c.url.endsWith(`/commits/${r.defaultBranch}`))).toBe(true);}expect(x.store.record?.generation).toBe(1);});
