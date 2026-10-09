import { clean, mouseEvent } from './menu.mjs';
export const palettes = {
 light:{canvas:'255;255;255',sidebar:'243;245;247',text:'31;41;51',muted:'79;92;105',button:'226;232;237',accent:'0;102;81',onAccent:'255;255;255',bubble:'232;241;237',border:'182;194;202'},
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
  const side=width>=84?24:18,main=width-side,pad=main>=50?4:2,cw=main-2*pad;
  const left=Array(height).fill(paint('',side,p.sidebar));
  const right=Array(height).fill(paint('',main));
  const put=(y,text,bg=p.canvas,fg=p.text)=>{if(y>=0&&y<height)right[y]=paint(' '.repeat(pad)+text,main,bg,fg);};
  left[1]=paint('  Просто pi',side,p.sidebar,p.accent);
  const button=(y,label,run,primary=false)=>{
   if(y+1>=height-3)return;
   const bg=primary?p.accent:p.button,fg=primary?p.onAccent:p.text;
   for(let dy=0;dy<2;dy++)left[y+dy]=paint(' ',1,p.sidebar)+paint(dy===0?' '+label:'',side-2,bg,fg)+paint(' ',1,p.sidebar);
   targets.push({x:1,y,w:side-2,h:2,run});
  };
  const buttons=[['Новый разговор',actions.newChat,true],['История',actions.history],['Модель',actions.model],
   [s.scheme==='dark'?'Светлая тема':'Тёмная тема',actions.theme],['Технический вид',actions.technical]];
  const slots=Math.max(1,Math.floor((height-5)/3));
  const visible=buttons.length>slots?[...buttons.slice(0,slots-1),['Ещё…',actions.more]]:buttons;
  visible.forEach(([label,run,primary],i)=>button(3+i*3,label,run,primary));
  left[height-2]=paint('  '+clean(ctx.model?.name||ctx.model?.id||'Выберите модель'),side,p.sidebar,p.muted);
  put(1,'Разговор',p.canvas,p.muted);
  const commandW=12;
  const editorAll=delegate.render(cw-commandW), editorLimit=Math.min(6,Math.max(3,height-8));
  const cursorLine=editorAll.findIndex(line=>line.includes("\x1b_pi:c\x07"));
  const editorStart=Math.min(Math.max(0,cursorLine-editorLimit+2),Math.max(0,editorAll.length-editorLimit));
  const editorLines=editorAll.slice(editorStart,editorStart+editorLimit);
  const editorTop=height-editorLines.length-3;
  for(let i=0;i<editorLines.length;i++){
   const control=i<2?paint(i===0?' Команды ':'',commandW-1,p.button):paint('',commandW-1);
   right[editorTop+i]=paint('',pad)+control+paint(' ',1)+paint(editorLines[i].replace(/\x1b\[[0-9;]*m/g,''),cw-commandW)+paint('',pad);
  }
  targets.push({x:side+pad,y:editorTop,w:commandW-1,h:2,run:actions.commands});
  if(!delegate.getText())put(editorTop-1,'Напишите сообщение…',p.canvas,p.muted);
  const send=ctx.isIdle()?(delegate.getText().startsWith('/')?'Выполнить':'Отправить'):'Остановить';
  const sendW=measure(send)+4,sendX=width-pad-sendW;
  right[height-2]=paint(' '.repeat(main-pad-sendW),main-pad-sendW)+paint('  '+send+'  ',sendW,p.accent,p.onAccent)+paint('',pad);
  if(!ctx.isIdle()||delegate.getText().trim())targets.push({x:sendX,y:height-2,w:sendW,h:1,run:ctx.isIdle()?actions.submit:()=>ctx.abort()});
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
  if(!content.length){put(5,'Чем могу помочь?',p.canvas,p.accent);put(7,'Опишите задачу своими словами.',p.canvas,p.muted);}
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
