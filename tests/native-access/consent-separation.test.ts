import {it,expect} from 'vitest';
import {validateScopes} from '../../account/oauth';
import {context,MemoryStore,mockProvider,provider} from './helpers';
it.each([undefined,'','repo','repo read:user','admin:org'])('identity-only scope inheritance %s is denied',scope=>{expect(()=>validateScopes(scope,'identity')).toThrow();});
it('identity-only sign-in never produces a repository credential',async()=>{const store=new MemoryStore(), oauth=provider(mockProvider({scope:'read:user',expires_in:undefined,refresh_token:undefined,refresh_token_expires_in:undefined},1001,'read:user'));const start=new URL(await oauth.start(context,'identity',store)); const callback=new URL('https://account.example.test/oauth/callback?code=synthetic');callback.searchParams.set('state',start.searchParams.get('state')!);expect((await oauth.callback(callback,context,store)).credential).toBeNull();expect(store.record).toBeUndefined();});
