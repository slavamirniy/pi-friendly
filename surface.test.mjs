import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurface,messageText,chatMessages} from './surface.mjs';
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const rendering={truncate:(s,w)=>s.slice(0,w),measure:s=>strip(s).length};
function fixture(w=100,h=30){
 const calls=[];const tui={terminal:{columns:w,rows:h},requestRender(){}};
 const data={scheme:'light',statuses:['Осталось 993 тыс.'],live:{role:'assistant',timestamp:1,content:[{type:'thinking',thinking:'PRIVATE THOUGHT'},{type:'text',text:'Привет! Чем могу помочь?'}]}};
 const ctx={isIdle:()=>true,model:{name:'Kimi K3'},sessionManager:{getBranch:()=>[]}};
 const actions=Object.fromEntries(['newChat','history','model','commands','theme','technical','more','submit','errorDetails','exit','voice'].map(k=>[k,()=>calls.push(k)]));
 const delegate={getText:()=>'',render:width=>['─'.repeat(width),'','─'.repeat(width)]};
 const surface=createSurface({tui,delegate,rendering,ctx,actions,state:()=>data});
 return{surface,tui,data,calls,ctx,delegate};
}
test('light chat hides thinking, shows answer and quota, commands button is absent',()=>{
 const h=fixture();const rows=h.surface.render(100).map(strip);const text=rows.join('\n');
 assert.ok(text.includes('Привет!'));assert.ok(text.includes('Осталось 993 тыс.'));assert.ok(!text.includes('PRIVATE THOUGHT'));assert.ok(!text.includes('Частые команды'));
 assert.ok(!text.includes('Команды'));
 assert.match(h.surface.render(100)[0],/48;2;255;255;255/);
});
test('all rendered rows fit viewport, sidebar targets do not overlap at short heights',()=>{
 for(const width of [44,60,80,100,140])for(const height of [12,16,24,35]){
  const h=fixture(width,height);const rows=h.surface.render(width);assert.equal(rows.length,height);assert.ok(rows.every(r=>strip(r).length===width),`${width}x${height}`);
 }
});
test('dark theme, tool progress and errors remain readable',()=>{
 const h=fixture();h.data.scheme='dark';h.data.widgets=[['Генерация · 12 с']];h.data.live.errorMessage='Connection failed';
 const text=h.surface.render(100).map(strip).join('\n');assert.ok(text.includes('Генерация · 12 с'));assert.ok(text.includes('Не удалось связаться с сервисом'));assert.ok(!text.includes('Connection failed'));assert.match(h.surface.render(100)[0],/48;2;26;29;33/);
});
test('live assistant replaces matching saved message instead of duplicating it',()=>{
 const old={role:'assistant',timestamp:1,content:[{type:'text',text:'old'}]};const live={...old,content:[{type:'text',text:'new'}]};
 assert.deepEqual(chatMessages({sessionManager:{getBranch:()=>[{type:'message',message:old}]}},live),[live]);
 assert.equal(messageText({content:[{type:'thinking',thinking:'hidden'},{type:'image'}]}),'[Прикреплено изображение]');
});

test('errors stay visible over progress and open technical details',()=>{
 const h=fixture();h.data.error={raw:'HTTP 429 too many requests'};h.data.widgets=[['Progress is running']];
 const rows=h.surface.render(100).map(strip);assert.ok(rows.join('\n').includes('Слишком много запросов'));
 const y=rows.findIndex(r=>r.includes('Подробнее'));h.surface.onMouse(`\x1b[<0;30;${y+1}M`);assert.deepEqual(h.calls,['errorDetails']);
 for(const w of [44,60,100])for(const height of [12,20,30]){const f=fixture(w,height);f.data.error={raw:'HTTP 503 unavailable'};const r=f.surface.render(w).map(strip);assert.equal(r.length,height);assert.ok(r.every(l=>l.length===w));assert.ok(r.join('\n').includes('Подробнее'));}
});
test('three-row send target is usable without the bottom activity panel',()=>{
 for(const delta of [-1,0,1]){const h=fixture();h.delegate.getText=()=> 'Привет';const rows=h.surface.render(100).map(strip);const y=rows.findIndex(r=>r.includes('Отправить'));const x=rows[y].indexOf('Отправить');h.surface.onMouse(`\x1b[<0;${x+1};${y+1+delta}M`);assert.deepEqual(h.calls,['submit']);}
 const h=fixture();h.data.running=true;h.data.started=Date.now()-12000;h.data.steps=[{label:'Создаю файл · index.html',status:'done'},{label:'Проверяю сборку',status:'running'}];
 const text=h.surface.render(100).map(strip).join('\n');assert.ok(!text.includes('✓ Создаю файл'));assert.ok(!text.includes('Проверяю сборку'));assert.ok(!text.includes('Работаю ·'));
});

test('saved file actions survive reload, failures stay distinct and assistant headings do not repeat',()=>{
 const h=fixture(140,40);h.data.live=undefined;
 const messages=[
  {role:'assistant',content:[{type:'text',text:'Общие стили:'},{type:'toolCall',id:'w',name:'write',arguments:{path:'src/styles.css',content:'a\nb\n'}}]},
  {role:'toolResult',toolCallId:'w',toolName:'write',isError:false,content:[{type:'text',text:'raw tool response'}]},
  {role:'assistant',content:[{type:'toolCall',id:'e',name:'edit',arguments:{path:'src/app.js'}}]},
  {role:'toolResult',toolCallId:'e',toolName:'edit',isError:true,content:[{type:'text',text:'raw failure'}]},
  {role:'assistant',content:[{type:'thinking',thinking:'hidden'}]},
 ];
 h.ctx.sessionManager.getBranch=()=>messages.map(message=>({type:'message',message}));
 const text=h.surface.render(140).map(strip).join('\n');
 assert.ok(text.includes('✓ Файл записан · src/styles.css · строк: 2'));
 assert.ok(text.includes('! Обновляю файл · src/app.js'));assert.equal(text.match(/Помощник/g)?.length,1);
 assert.ok(!text.includes('raw tool response'));assert.ok(!text.includes('raw failure'));assert.ok(!text.includes('hidden'));
});
test('wide windows use available chat width and pending writes are not marked successful',()=>{
 const h=fixture(160,40);h.data.live={role:'assistant',content:[{type:'text',text:'Обновляю страницу'},{type:'toolCall',id:'pending',name:'write',arguments:{path:'index.html',content:'hello'}}]};
 const rows=h.surface.render(160).map(strip),row=rows.find(r=>r.includes('Обновляю страницу'));
 assert.ok(row.indexOf('Обновляю страницу')<35);assert.ok(rows.join('\n').includes('· Создаю файл · index.html'));assert.ok(!rows.join('\n').includes('✓ Файл записан'));
});

test('red exit button stays clickable at the bottom without a details button',()=>{
 for(const height of [12,18,23,27,35])for(const scheme of ['light','dark']){
  const h=fixture(100,height);h.data.scheme=scheme;
  const raw=h.surface.render(100),rows=raw.map(strip),y=rows.findIndex(r=>r.includes('Выйти')),x=rows[y].indexOf('Выйти');
  assert.ok(y>=height/2);assert.ok(!rows.join('').includes('Подробности'));
  assert.ok(raw[y].includes(scheme==='dark'?'255;186;186':'157;35;42'));
  h.surface.onMouse(`\x1b[<0;${x+1};${y+1}M`);assert.deepEqual(h.calls,['exit']);
 }
});

test('busy exit button has no click target',()=>{
 const h=fixture();h.ctx.isIdle=()=>false;const rows=h.surface.render(100).map(strip),y=rows.findIndex(r=>r.includes('Выйти')),x=rows[y].indexOf('Выйти');
 h.surface.onMouse(`\x1b[<0;${x+1};${y+1}M`);assert.deepEqual(h.calls,[]);
});

test('voice control fits narrow and wide windows and microphone toggles from its visible label',()=>{
 for(const width of [44,60,100,160])for(const height of [16,27,40])for(const phase of ['ready','recording','transcribing','downloading']){
  const h=fixture(width,height);h.data.voice={phase,percent:42,seconds:65,level:.7};h.delegate.getText=()=> 'черновик';
  const rows=h.surface.render(width).map(strip);assert.equal(rows.length,height);assert.ok(rows.every(row=>row.length===width),`${width} ${height} ${phase}`);
  if(width>=100&&phase==='ready'){
   const y=rows.findIndex(row=>row.includes('🎤')),x=rows[y].indexOf('🎤');assert.ok(x<rows[y].indexOf('Отправить'));assert.ok(x>width/2);h.surface.onMouse(`\x1b[<0;${x+1};${y+1}M`);assert.deepEqual(h.calls,['voice']);
  }
 }
});

test('recognition stays inside composer, installation stays only in sidebar',()=>{
 for(const phase of ['recording','transcribing','downloading']){
  const h=fixture(120,36);h.data.voice={phase,percent:42,seconds:62,level:.6};
  const rows=h.surface.render(120).map(strip),left=rows.map(r=>r.slice(0,26)).join('\n'),right=rows.map(r=>r.slice(26)).join('\n');
  if(phase==='downloading'){assert.ok(left.includes('Модель 42%'));assert.ok(!right.includes('42%'));}
  else {assert.ok(!left.includes('42%'));assert.ok(!left.includes('запись'));assert.ok(!left.includes('Распозна'));
   if(phase==='transcribing'){const row=rows.find(r=>r.includes('Распознаю'));assert.ok(row.includes('│'));assert.ok(row.includes('42%'));}
  }
 }
});

test('microphone remains clickable during download and highlights only the setup area for its hint',()=>{
 const h=fixture(120,36);h.data.voice={phase:'downloading',percent:42};let rows=h.surface.render(120).map(strip),y=rows.findIndex(row=>row.includes('🎤')),x=rows[y].indexOf('🎤');
 assert.ok(y>=0);h.surface.onMouse(`\x1b[<0;${x+1};${y+1}M`);assert.deepEqual(h.calls,['voice']);
 h.data.voiceHintUntil=Date.now()+3000;const raw=h.surface.render(120);rows=raw.map(strip);
 assert.ok(rows.join('\n').includes('← Для голосового ввода'));assert.ok(rows.join('\n').includes('дождитесь загрузки голосовой модели'));
 const loading=raw.find(row=>row.includes('Модель 42%'));assert.ok(loading.includes('48;2;215;232;250'));
 h.data.voiceHintUntil=0;assert.ok(!h.surface.render(120).map(strip).join('').includes('← Для голосового ввода'));
});

test('raster bars have distinct symmetric heights and scroll from right to left',async()=>{
 const {voiceWaveform}=await import('./surface.mjs');
 const levels=[.1,.3,.5,.65,.8,1],rows=voiceWaveform(levels,6,3),bits=[1,2,4,64];
 const heights=[];
 for(let x=0;x<6;x++){
  const column=rows.flatMap(row=>bits.map(bit=>Boolean((row.charCodeAt(x)-0x2800)&bit)));
  assert.deepEqual(column,[...column].reverse());heights.push(column.filter(Boolean).length);
 }
 assert.deepEqual(heights,[2,4,6,8,10,12]);
 const first=voiceWaveform([1],6),next=voiceWaveform([1,0],6);
 for(let y=0;y<3;y++)assert.equal(first[y][5],next[y][4]);
 assert.deepEqual(voiceWaveform([1],0),['','','']);
 assert.ok(voiceWaveform([],6).every(row=>row.length===6));
});

test('voice replaces draft without growing composer and stop icon is centered',()=>{
 for(const width of [60,100,160])for(const height of [16,30,40]){
  const h=fixture(width,height);h.delegate.getText=()=> 'Сохранённый черновик';h.delegate.render=()=>['Сохранённый черновик'];
  h.data.voice={phase:'ready'};const before=h.surface.render(width).map(strip);
  const top=rows=>rows.findIndex(r=>r.slice(26).includes('╭────'));
  for(const phase of ['recording','transcribing']){
   h.data.voice={phase,levels:[.2,.5,1],percent:42};const rows=h.surface.render(width).map(strip);
   assert.equal(top(rows),top(before));assert.ok(!rows.join('').includes('Сохранённый черновик'));assert.equal(h.delegate.getText(),'Сохранённый черновик');
   if(phase==='recording'&&height>=20)assert.ok(rows.some(r=>r.includes('│ ██ │')));
  }
  h.data.voice={phase:'ready'};assert.ok(h.surface.render(width).map(strip).join('').includes('Сохранённый черновик'));
 }
});
