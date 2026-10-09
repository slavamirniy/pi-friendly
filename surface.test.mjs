import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurface,messageText,chatMessages} from './surface.mjs';
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const rendering={truncate:(s,w)=>s.slice(0,w),measure:s=>strip(s).length};
function fixture(w=100,h=30){
 const calls=[];const tui={terminal:{columns:w,rows:h},requestRender(){}};
 const data={scheme:'light',statuses:['Осталось 993 тыс.'],live:{role:'assistant',timestamp:1,content:[{type:'thinking',thinking:'PRIVATE THOUGHT'},{type:'text',text:'Привет! Чем могу помочь?'}]}};
 const ctx={isIdle:()=>true,model:{name:'Kimi K3'},sessionManager:{getBranch:()=>[]}};
 const actions=Object.fromEntries(['newChat','history','model','commands','theme','technical','more','submit'].map(k=>[k,()=>calls.push(k)]));
 const delegate={getText:()=>'',render:width=>['─'.repeat(width),'','─'.repeat(width)]};
 const surface=createSurface({tui,delegate,rendering,ctx,actions,state:()=>data});
 return{surface,tui,data,calls};
}
test('light chat hides thinking, shows answer and quota, commands only appear at composer',()=>{
 const h=fixture();const rows=h.surface.render(100).map(strip);const text=rows.join('\n');
 assert.ok(text.includes('Привет!'));assert.ok(text.includes('Осталось 993 тыс.'));assert.ok(!text.includes('PRIVATE THOUGHT'));assert.ok(!text.includes('Частые команды'));
 const row=rows.findIndex(r=>r.includes('Команды'));assert.ok(row>20);
 h.surface.onMouse(`\x1b[<0;30;${row+1}M`);assert.deepEqual(h.calls,['commands']);
 assert.match(h.surface.render(100)[0],/48;2;255;255;255/);
});
test('all rendered rows fit viewport, sidebar targets do not overlap at short heights',()=>{
 for(const width of [44,60,80,100,140])for(const height of [12,16,24,35]){
  const h=fixture(width,height);const rows=h.surface.render(width);assert.equal(rows.length,height);assert.ok(rows.every(r=>strip(r).length===width),`${width}x${height}`);
 }
});
test('dark theme, tool progress and errors remain readable',()=>{
 const h=fixture();h.data.scheme='dark';h.data.widgets=[['Генерация · 12 с']];h.data.live.errorMessage='Connection failed';
 const text=h.surface.render(100).map(strip).join('\n');assert.ok(text.includes('Генерация · 12 с'));assert.ok(text.includes('Connection failed'));assert.match(h.surface.render(100)[0],/48;2;26;29;33/);
});
test('live assistant replaces matching saved message instead of duplicating it',()=>{
 const old={role:'assistant',timestamp:1,content:[{type:'text',text:'old'}]};const live={...old,content:[{type:'text',text:'new'}]};
 assert.deepEqual(chatMessages({sessionManager:{getBranch:()=>[{type:'message',message:old}]}},live),[live]);
 assert.equal(messageText({content:[{type:'thinking',thinking:'hidden'},{type:'image'}]}),'[Прикреплено изображение]');
});
