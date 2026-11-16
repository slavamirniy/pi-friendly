import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {canAutoOpen,launchBrowser} from './browser-start.mjs';
import {startWebServer} from './web-server.mjs';

test('only local interactive desktop startup opens a tab',()=>{
  const check=(platform,env={},extra={})=>canAutoOpen({mode:'tui',reason:'startup',tty:true,platform,env,...extra});
  for(const [platform,env] of [['win32',{}],['darwin',{}],['linux',{DISPLAY:':0'}],['linux',{WAYLAND_DISPLAY:'wayland-0'}]]) {
    assert.equal(check(platform,env),true);
    for(const override of [{SSH_TTY:'pts/1'},{CI:'true'},{PI_FRIENDLY_WEB_CHILD:'1'},{PI_FRIENDLY_AUTO_WEB:'0'}])
      assert.equal(check(platform,{...env,...override}),false);
    for(const extra of [{mode:'rpc'},{mode:'print'},{tty:false},{reason:'new'},{reason:'resume'},{reason:'reload'},{reason:'fork'}])
      assert.equal(check(platform,env,extra),false);
  }
  assert.equal(check('linux'),false);
  assert.equal(check('win32',{SESSIONNAME:'Services'}),false);
});

test('a desktop handler must actually authenticate to confirm opening',async t=>{
  const web=await startWebServer({});
  t.after(()=>web.close());
  for(const platform of ['darwin','win32','linux']) {
    const child=new EventEmitter();child.unref=()=>{};
    await launchBrowser(web.url, web.browserReady,{platform,launch:(cmd,args,options)=>{
      assert.equal(cmd,({linux:'xdg-open',win32:'rundll32.exe',darwin:'open'})[platform]);
      assert.equal(args.at(-1),web.url);assert.equal(options.shell,undefined);
      fetch(web.origin+'/api/auth',{method:'POST',body:JSON.stringify({token:web.url.split('#')[1]})}).catch(()=>{});
      return child;
    }});
  }
});

test('missing or ineffective desktop handler leaves a bounded failure',async()=>{
  for(const event of ['error','nonzero','silent']) {
    const child=new EventEmitter();child.unref=()=>{};
    await assert.rejects(launchBrowser('http://127.0.0.1/',new Promise(()=>{}),{timeout:25,launch:()=>{
      queueMicrotask(()=>event==='error'?child.emit('error',new Error('missing')):child.emit('exit',event==='nonzero'?1:0));
      return child;
    }}),/терминале/);
  }
});
