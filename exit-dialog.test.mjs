import test from 'node:test';
import assert from 'node:assert/strict';
import {requestExit,createExitDialog} from './exit-dialog.mjs';
import {palettes} from './surface.mjs';
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
test('exit is blocked while busy and rechecked after confirmation',async()=>{
 let idle=false,asked=0,closed=0;const ctx={isIdle:()=>idle,shutdown:()=>closed++};
 await requestExit(ctx,async()=>{asked++;return true;});assert.equal(asked,0);
 idle=true;await requestExit(ctx,async()=>false);assert.equal(closed,0);
 await requestExit(ctx,async()=>{idle=false;return true;});assert.equal(closed,0);
 idle=true;await requestExit(ctx,async()=>true);assert.equal(closed,1);
});
test('exit popup cancels by default and supports keyboard and mouse confirmation',()=>{
 for(const action of ['enter','escape','confirm','mouse']){
  let result;const tui={terminal:{columns:100,rows:30,write(){}},requestRender(){}};
  const dialog=createExitDialog({tui,done:v=>result=v,palette:palettes.dark,truncate:(s,w)=>strip(s).slice(0,w),measure:s=>strip(s).length,matchesKey:(s,k)=>s===k});
  const rows=dialog.render(100).map(strip);assert.equal(rows.length,30);assert.ok(rows.every(r=>r.length===100));
  if(action==='confirm'){dialog.handleInput('tab');dialog.handleInput('enter');}
  else if(action==='mouse'){const y=rows.findIndex(r=>r.includes('Выйти')),x=rows[y].indexOf('Выйти');dialog.handleInput(`\x1b[<0;${x+1};${y+1}M`);}
  else dialog.handleInput(action);
  assert.equal(result,action==='confirm'||action==='mouse');dialog.dispose();
 }
});
