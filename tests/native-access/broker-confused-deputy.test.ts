import {it,expect} from 'vitest';
import {AccountBroker,type BrokerReadRequest} from '../../account/broker';
import {GitHubReads} from '../../account/upstream';
import {setup,input,context} from './helpers';
it.each([{action:'write_blob'},{resource:'other'},{path:'../secret'},{path:'/secret'},{ref:'main?evil'},{sha:'short'},{repository:{owner:'https://evil.test',name:'same-name',id:2001}}])('denies malformed action/intent before dispatch %j',async change=>{const x=await setup();await expect(x.broker.read({...input,...change} as BrokerReadRequest,context)).rejects.toThrow();expect(x.calls).toHaveLength(0);});
it('ignores no arbitrary proxy: only fixed GET paths dispatch',async()=>{const x=await setup();await expect(x.broker.read({...input,url:'https://evil.test',method:'DELETE',headers:{Authorization:'other'}} as BrokerReadRequest,context)).rejects.toThrow();expect(x.calls).toHaveLength(0);});
it('disconnect during upstream fetch suppresses disclosure',async()=>{const x=await setup();const transport=(async(...args:Parameters<typeof fetch>)=>{const response=await x.fetcher(...args);if(String(args[0]).includes('/contents/'))await x.vault.revoke();return response;}) as typeof fetch;await expect(new AccountBroker(x.vault,x.oauth,new GitHubReads(transport)).read(input,context)).rejects.toThrow();});
