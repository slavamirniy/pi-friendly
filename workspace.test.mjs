import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from './workspace.mjs';
import { acquireMouse } from './mouse.mjs';
const theme = { fg: (_c,s)=>s, bg: (_c,s)=>s, bold:s=>s };
const rendering = { truncate:(s,w)=>s.slice(0,w), measure:s=>s.length, matchesKey:(s,k)=>s===k };
const tick=()=>new Promise(r=>setImmediate(r));
function harness(cleanView=false,viewState=()=>({})) {
  const overlays=[],writes=[],calls=[],submitted=[]; let input,text='',focus,idle=true,autocomplete;
  const tui={terminal:{rows:24,columns:90,write:s=>writes.push(s)},requestRender(){},getFocusedComponent:()=>focus,
    showOverlay:(component,options)=>{const item={component,options,hidden:false};overlays.push(item);return{hide:()=>{item.hidden=true;}};},
    addInputListener:fn=>{input=fn;return()=>{input=undefined;};}};
  const delegate={actionHandlers:new Map(),getText:()=>text,setText:v=>{text=v;},render:()=>['input: '+text],
    handleInput:data=>{if(data==='\r'){submitted.push(text);text='';}else{text+=data;}},
    setAutocompleteProvider:p=>{autocomplete=p;}, customMethod:()=>42};
  const ctx={isIdle:()=>idle,abort:()=>calls.push('stop')};
  const actions={voice:()=>calls.push('voice'),newChat:()=>calls.push('newChat'),menu:()=>calls.push('menu'),model:()=>calls.push('model'),commands:()=>calls.push('commands'),details:()=>calls.push('details')};
  const w=createWorkspace({delegate,tui,theme,rendering,ctx,actions,cleanView,viewState});focus=w.editor;
  const provider={getSuggestions:async()=>({prefix:text,items:[{value:'model',label:'model',description:'Model'},{value:'new-plugin',label:'new-plugin',description:'Installed plugin'}]}),
    applyCompletion:(_l,_r,_c,item)=>({lines:['/'+item.value+' '],cursorLine:0,cursorCol:item.value.length+2})};
  w.editor.setAutocompleteProvider(provider);
  const render=()=>{w.editor.render(90);for(const o of overlays)if(!o.hidden&&o.options.visible())o.component.render(90);};
  return{w,delegate,provider,tui,render,writes,calls,submitted,overlays,input:d=>input?.(d),getText:()=>text,setFocus:v=>{focus=v;},setIdle:v=>{idle=v;},getProvider:()=>autocomplete};
}
test('top menu is clickable, modal focus blocks clicks, resize rejects stale targets',()=>{
  const h=harness();h.render();h.input('\x1b[<0;4;1M');assert.deepEqual(h.calls,['menu']);
  h.setFocus({});h.input('\x1b[<0;4;1M');assert.equal(h.calls.length,1);
  h.setFocus(h.w.editor);h.tui.terminal.columns=70;h.input('\x1b[<0;4;1M');assert.equal(h.calls.length,1);h.w.dispose();
});
test('native slash suggestions including new plugin commands select with mouse and execute through host',async()=>{
  const h=harness();h.w.editor.setText('/');await tick();h.render();
  // 2 results + heading + help = 4 rows, above the one-row footer: top row 20 (1 based).
  h.input('\x1b[<0;8;22M');assert.equal(h.getText(),'/new-plugin ');
  h.render();h.w.submit();assert.deepEqual(h.submitted,['/new-plugin ']);h.w.dispose();
});
test('keyboard completion, host properties and non-slash autocomplete are preserved',async()=>{
  const h=harness();h.w.editor.setText('/');await tick();h.w.editor.handleInput('down');h.w.editor.handleInput('enter');
  assert.equal(h.getText(),'/new-plugin ');assert.equal(h.w.editor.customMethod(),42);
  const cb=()=>{};h.w.editor.onSubmit=cb;assert.equal(h.delegate.onSubmit,cb);
  assert.equal(await h.getProvider().getSuggestions(['/mo'],0,3,{}),null);
  assert.ok(await h.getProvider().getSuggestions(['file'],0,4,{}));h.w.dispose();
});
test('late completion cannot resurrect dropdown after editor changes',async()=>{
  const h=harness();let resolve;
  h.provider.getSuggestions=()=>new Promise(r=>{resolve=r;});h.w.editor.setText('/');
  h.w.editor.setText('normal text');resolve({prefix:'/',items:[{value:'model',label:'model'}]});await tick();
  h.render();assert.equal(h.w.editor.render(90).length,1);h.w.dispose();
});
test('busy submit does not enqueue text; dock stop works and cleanup removes listeners',()=>{
  const h=harness();h.w.editor.setText('hello');h.setIdle(false);h.render();h.w.submit();assert.equal(h.submitted.length,0);
  const toolbar=h.overlays.find(o=>o.options.row===0 && !o.options.maxHeight).component.render(90)[0];
  h.input(`\x1b[<0;${toolbar.indexOf('Остановить')+1};1M`);assert.deepEqual(h.calls,['stop']);h.w.dispose();h.w.dispose();
  assert.equal(h.input('\x1b[<0;4;1M'),undefined);assert.ok(h.overlays.every(o=>o.hidden));
});
test('nested mouse leases restore original mode only after last owner',()=>{
  const writes=[],terminal={write:s=>writes.push(s)};const first=acquireMouse(terminal),second=acquireMouse(terminal);
  first();assert.equal(writes.length,1);second();assert.equal(writes.length,2);second();assert.equal(writes.length,2);
});

test('navigation retains the last pane until its replacement and ignores stale release',()=>{
 const h=harness(true),screen=h.overlays[0].component;
 const history=Array(24).fill('history'),models=Array(24).fill('models');
 const releaseHistory=h.w.holdFrame(history);assert.deepEqual(screen.render(90),history);
 const releaseModels=h.w.holdFrame(models);releaseHistory();assert.deepEqual(screen.render(90),models);
 releaseModels();assert.notDeepEqual(screen.render(90),models);h.w.dispose();
});

test('project hub blocks both Enter and send until a project is chosen, preserving draft',()=>{
 const h=harness(true,()=>({needsProject:true}));h.w.editor.setText('Создай сайт');h.w.editor.handleInput('enter');h.w.submit();
 assert.equal(h.submitted.length,0);assert.equal(h.getText(),'Создай сайт');assert.deepEqual(h.calls,['newChat','newChat']);
 h.w.editor.setText('/reload');h.w.submit();assert.deepEqual(h.submitted,['/reload']);h.w.dispose();
});

test('recording and transcription never auto-send a partially dictated message',()=>{
 for(const phase of ['starting','recording','transcribing']){
  const h=harness(true,()=>({voice:{phase}}));h.w.editor.setText('мой черновик');h.w.submit();h.w.editor.handleInput('enter');assert.deepEqual(h.submitted,[]);assert.equal(h.getText(),'мой черновик');h.w.dispose();
 }
});

test('Enter stops recording once, starts transcription and never submits the draft',()=>{
 const state={voice:{phase:'recording'}};const h=harness(true,()=>state);h.w.editor.setText('Текст до диктовки');
 h.w.editor.handleInput('enter');assert.deepEqual(h.calls,['voice']);assert.deepEqual(h.submitted,[]);
 state.voice.phase='transcribing';h.w.editor.handleInput('enter');assert.deepEqual(h.calls,['voice']);assert.deepEqual(h.submitted,[]);assert.equal(h.getText(),'Текст до диктовки');h.w.dispose();
});
