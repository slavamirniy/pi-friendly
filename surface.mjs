import { clean, mouseEvent } from './menu.mjs';
export const palettes = {
 light:{canvas:'255;255;255',sidebar:'247;248;250',text:'31;41;51',muted:'79;92;105',button:'237;241;243',accent:'0;102;81',onAccent:'255;255;255',bubble:'232;241;237',border:'182;194;202'},
 dark:{canvas:'26;29;33',sidebar:'33;38;43',text:'239;243;247',muted:'177;188;199',button:'49;58;65',accent:'117;223;185',onAccent:'18;39;31',bubble:'41;59;54',border:'96;115;128'},
};
export function chatMessages(ctx, live) {
 const branch=ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
 const messages=branch.filter(e=>e.type==='message').map(e=>e.message);
 if(live && !messages.some(m=>m===live || (m.role===live.role && m.timestamp===live.timestamp))) messages.push(live);
 else if(live) {const index=messages.findLastIndex(m=>m.role===live.role&&m.timestamp===live.timestamp);if(index>=0)messages[index]=live;}
 return messages.filter(m=>m.role==='user'||m.role==='assistant'||(m.role==='custom'&&m.display!==false));
}
export function messageText(message) {
 if(typeof message.content==='string')return message.content;
 return (message.content??[]).filter(c=>c.type==='text'||c.type==='image').map(c=>c.type==='image'?'[Прикреплено изображение]':c.text).join('\n');
}
export function createSurface({tui,delegate,rendering,ctx,actions,state}) {
 let targets=[],dimensions='',scroll=0;
 const {truncate,measure}=rendering;
 const safeText=text=>String(text??'').split('\n').map(clean).join('\n');
 function render(width) {
  const height=tui.terminal.rows,s=state(),p=palettes[s.scheme]??palettes.light;
  dimensions=`${width}:${height}`;targets=[];
  const paint=(text,w,bg=p.canvas,fg=p.text)=>{
   const base=`\x1b[48;2;${bg}m\x1b[38;2;${fg}m`;
   const value=truncate(text,w,'');return base+value.replace(/\x1b\[(?:0)?m/g,base).replace(/\x1b\[39m/g,`\x1b[38;2;${fg}m`).replace(/\x1b\[49m/g,`\x1b[48;2;${bg}m`)+' '.repeat(Math.max(0,w-measure(value)))+'\x1b[0m';
  };
  if(width<44||height<12)return [paint('Увеличьте окно. F2 — меню.',width),...Array(Math.max(0,height-1)).fill(paint('',width))];
  const side=width>=100?26:18,main=width-side,pad=Math.max(2,Math.floor((main-78)/2)),cw=main-2*pad;
  const left=Array(height).fill(paint('',side,p.sidebar));
  const right=Array(height).fill(paint('',main));
  const put=(y,text,bg=p.canvas,fg=p.text)=>{if(y>=0&&y<height)right[y]=paint(' '.repeat(pad)+text,main,bg,fg);};
  const bold=text=>`\x1b[1m${text}\x1b[22m`;
  const center=(text,w)=>' '.repeat(Math.max(0,Math.floor((w-measure(text))/2)))+text;
  left[1]=paint('  '+bold('pi')+(side>=24?'  /  помощник':''),side,p.sidebar,p.text);
  const button=(y,label,run,primary=false)=>{
   if(y<3||y+2>=height-2)return;
   const w=side-4,bg=primary?p.bubble:p.sidebar,fg=primary?p.accent:p.text;
   const rows=primary?['╭'+'─'.repeat(w-2)+'╮','│'+center(label,w-2).padEnd(w-2)+'│','╰'+'─'.repeat(w-2)+'╯']:['', '  '+label+'  ›',''];
   for(let dy=0;dy<3;dy++)left[y+dy]=paint('  ',2,p.sidebar)+paint(rows[dy],w,bg,fg)+paint('  ',2,p.sidebar);
   targets.push({x:2,y,w,h:3,run});
  };
  button(4,side<24?'Новый чат':'Новый разговор',actions.newChat,true);
  if(height>=23)button(8,'История',actions.history);
  const utilities=[['Модель',actions.model],[s.scheme==='dark'?'Светлая тема':'Тёмная тема',actions.theme],['Подробности',actions.technical]];
  if(height>=27)utilities.forEach(([label,run],i)=>button(height-13+i*3,label,run));
  else if(height>=23){button(12,'Модель',actions.model);button(height-6,'Ещё',actions.more);}
  else button(height-6,'Ещё',actions.more);
  left[height-2]=paint('  '+clean(ctx.model?.name||ctx.model?.id||'Выберите модель'),side,p.sidebar,p.muted);
  put(1,chatMessages(ctx,s.live).length?'Разговор':'Новый разговор',p.canvas,p.muted);
  const editorWidth=Math.max(4,cw-4);
  let editorAll=delegate.render(editorWidth);
  // Keep the native editor/cursor, replace only its horizontal rules with our frame.
  const rule=line=>/^[─━╌┄\s]+$/.test(clean(line));
  if(editorAll.length>=3&&rule(editorAll[0])&&rule(editorAll.at(-1)))editorAll=editorAll.slice(1,-1);
  const editorLimit=Math.min(5,Math.max(1,height-10));
  const cursorLine=editorAll.findIndex(line=>line.includes("\x1b_pi:c\x07"));
  const editorStart=Math.min(Math.max(0,cursorLine-editorLimit+2),Math.max(0,editorAll.length-editorLimit));
  const editorLines=editorAll.slice(editorStart,editorStart+editorLimit);
  const editorTop=height-Math.max(1,editorLines.length)-6;
  put(editorTop,'╭'+'─'.repeat(cw-2)+'╮',p.canvas,p.border);
  const inside=(y,text)=>{right[y]=paint('',pad)+paint('│ ',2,p.canvas,p.border)+paint(text,editorWidth)+paint(' │',2,p.canvas,p.border)+paint('',main-pad-cw);};
  editorLines.forEach((line,i)=>inside(editorTop+1+i,line.replace(/\x1b\[[0-9;]*m/g,'')));
  const actionY=editorTop+1+editorLines.length;
  inside(actionY,'');
  const send=ctx.isIdle()?(delegate.getText().startsWith('/')?'Выполнить':'Отправить ↑'):'Остановить';
  const sendW=measure(send)+2, enabled=!ctx.isIdle()||Boolean(delegate.getText().trim());
  right[actionY]=paint('',pad)+paint('│ ',2,p.canvas,p.border)+paint('',Math.max(0,cw-sendW-4))+paint(' '+send+' ',sendW,enabled?p.accent:p.button,enabled?p.onAccent:p.muted)+paint(' │',2,p.canvas,p.border)+paint('',main-pad-cw);
  if(enabled)targets.push({x:side+pad+cw-sendW-2,y:actionY,w:sendW,h:1,run:ctx.isIdle()?actions.submit:()=>ctx.abort()});
  put(actionY+1,'╰'+'─'.repeat(cw-2)+'╯',p.canvas,p.border);
  if(!delegate.getText())put(editorTop-1,'Сообщение',p.canvas,p.muted);
  let info=s.notice||s.activity||'';
  const widgetLines=[];
  for(const widget of s.widgets??[]) {try {widgetLines.push(...(Array.isArray(widget)?widget:widget.render(cw)));}catch{}}
  if(widgetLines.length && !s.notice)info=clean(widgetLines.at(-1));
  if(info)put(editorTop-1,truncate(clean(info),cw,''),p.canvas,s.notice?p.accent:p.muted);
  const status=(s.statuses??[]).map(clean).join(' · ');
  if(status)put(height-1,truncate(status,cw,''),p.canvas,p.muted);
  const items=s.suggestions??[];
  const count=Math.min(items.length,5,Math.max(0,editorTop-5));
  let contentBottom=editorTop-2;
  if(count){
   const start=Math.max(0,s.selected-count+1);contentBottom-=count+1;
   for(let n=0;n<count;n++) {
    const item=items[start+n],y=contentBottom+1+n,label=' /'+clean(item.label).replace(/^\//,'');
    put(y,truncate(label+'  '+clean(item.description),cw,''),start+n===s.selected?p.bubble:p.sidebar);
    targets.push({x:side+pad,y,w:cw,h:1,run:()=>actions.complete(item)});
   }
  }
  let content=[];
  for(const message of chatMessages(ctx,s.live)){
   const text=messageText(message);
   if(!text && !message.errorMessage)continue;
   content.push({text:message.role==='user'?'Вы':'Помощник',muted:true});
   const lines=rendering.markdown?rendering.markdown(safeText(text),cw,p):safeText(text).split('\n').flatMap(l=>{const out=[];while(l.length){out.push(l.slice(0,cw));l=l.slice(cw);}return out.length?out:[''];});
   for(const line of lines)content.push({text:line,user:message.role==='user'});
   if(message.errorMessage)content.push({text:'Не удалось получить ответ: '+clean(message.errorMessage)});
   content.push({text:''});
  }
  const capacity=Math.max(0,contentBottom-3);
  scroll=Math.min(scroll,Math.max(0,content.length-capacity));
  const start=Math.max(0,content.length-capacity-scroll);
  if(!content.length && editorTop>7){const y=Math.max(4,Math.floor(editorTop/2)-1);put(y,center(bold('С чего начнём?'),cw));put(y+2,center('Напишите, что хотите сделать.',cw),p.canvas,p.muted);}
  content.slice(start,start+capacity).forEach((line,n)=>put(3+n,line.text,line.user?p.bubble:p.canvas,line.muted?p.muted:p.text));
  if(scroll>0)put(2,'↑ История · прокрутите вниз к новым сообщениям',p.canvas,p.muted);
  return left.map((line,i)=>line+right[i]);
 }
 return {render,invalidate(){},onMouse(data){
  const event=mouseEvent(data);if(!event)return false;
  if(dimensions!==`${tui.terminal.columns}:${tui.terminal.rows}`){tui.requestRender();return true;}
  if(event.press&&event.button===0){const hit=targets.find(t=>event.x>=t.x&&event.x<t.x+t.w&&event.y>=t.y&&event.y<t.y+t.h);if(hit)void hit.run();}
  if(event.press&&(event.button===64||event.button===65))scroll=Math.max(0,scroll+(event.button===64?3:-3));
  tui.requestRender();return true;
 },resetScroll(){scroll=0;}};
}
