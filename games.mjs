import {mouseEvent} from './menu.mjs';
import {acquireMouse} from './mouse.mjs';
import {centered,buttonRows} from './buttons.mjs';
export function newPuzzle(random=Math.random){
 const board=Array.from({length:16},(_,i)=>(i+1)%16);let previous=-1;
 for(let n=0;n<200;n++){const z=board.indexOf(0),choices=[z-4,z+4,z%4?z-1:-1,z%4<3?z+1:-1].filter(i=>i>=0&&i<16&&i!==previous),i=choices[Math.floor(random()*choices.length)];[board[z],board[i]]=[board[i],board[z]];previous=z;}
 if(board.every((v,i)=>v===(i+1)%16))[board[14],board[15]]=[board[15],board[14]];
 return {board,moves:0};
}
export function moveTile(game,index){const z=game.board.indexOf(0);if(index<0||index>15||Math.abs(Math.floor(z/4)-Math.floor(index/4))+Math.abs(z%4-index%4)!==1)return false;[game.board[z],game.board[index]]=[game.board[index],game.board[z]];game.moves++;return true;}
export function newMines(){return {mines:null,open:new Set(),flags:new Set(),lost:false,won:false};}
export function revealMine(game,index,random=Math.random){
 if(game.lost||game.won||game.flags.has(index)||index<0||index>=64)return;
 const neighbors=i=>Array.from({length:64},(_,j)=>j).filter(j=>j!==i&&Math.abs(j%8-i%8)<=1&&Math.abs(Math.floor(j/8)-Math.floor(i/8))<=1);
 if(!game.mines){const candidates=Array.from({length:64},(_,i)=>i).filter(i=>i!==index&&!neighbors(index).includes(i));for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}game.mines=new Set(candidates.slice(0,10));}
 if(game.mines.has(index)){game.lost=true;return;}
 const queue=[index];while(queue.length){const i=queue.pop();if(game.open.has(i)||game.flags.has(i))continue;game.open.add(i);const around=neighbors(i);if(!around.some(j=>game.mines.has(j)))queue.push(...around.filter(j=>!game.open.has(j)));}
 game.won=game.open.size===54;
}
export function newRunner(){return {y:0,v:0,x:36,score:0,over:false};}
export function stepRunner(g,random=Math.random){if(g.over)return;g.y=Math.max(0,g.y+g.v);g.v=g.y?g.v-.48:0;g.x--;if(g.x===4&&g.y<1.4)g.over=true;if(g.x<0){g.score++;g.x=26+Math.floor(random()*14);}}
export function createGames({tui,done,palette:p,truncate,measure,matchesKey,state,status,background}){
 state.kind??='menu';let disposed=false,targets=[],size='',cursor=0,renderWidth=0,renderHeight=0;
 const release=acquireMouse(tui.terminal),close=()=>{if(disposed)return;dispose();done();};
 const dispose=()=>{if(disposed)return;disposed=true;clearInterval(timer);release();};
 const reset=()=>{state[state.kind]=state.kind==='mines'?newMines():state.kind==='puzzle'?newPuzzle():newRunner();};
 const select=kind=>{state.kind=kind;cursor=0;if(!state[kind])reset();tui.requestRender();};
 const jump=()=>{const g=state.runner;if(g&&!g.over&&g.y===0)g.v=2.6;};
 const timer=setInterval(()=>{if(disposed)return;if(state.kind==='runner'&&status().running&&state.runner){stepRunner(state.runner);}tui.requestRender();},100);timer.unref?.();
 const paint=(text,w,bg=p.sidebar,fg=p.text)=>{const t=truncate(text,w,'');const base=`\x1b[48;2;${bg}m\x1b[38;2;${fg}m`;return base+t.replace(/\x1b\[0m/g,base)+' '.repeat(Math.max(0,w-measure(t)))+'\x1b[0m';};
 return {dispose,invalidate(){},render(width){
  const height=tui.terminal.rows;renderWidth=width;renderHeight=height;targets=[];size=`${width}:${height}`;
  const side=width>=100?26:18,main=width-side,pad=3,cw=Math.max(0,main-pad*2),base=background?.(width);
  const rows=Array.from({length:height},(_,y)=>(base?truncate(base[y]||'',side,''):paint('',side,p.sidebar))+paint('',main,p.canvas));
  const put=(y,text,fg=p.text,bg=p.canvas)=>{if(y>=0&&y<height)rows[y]=(base?truncate(base[y]||'',side,''):paint('',side,p.sidebar))+paint('',pad,p.canvas)+paint(text,cw,bg,fg)+paint('',pad,p.canvas);};
  const middle=(y,text,fg=p.text)=>put(y,centered(text,cw,truncate,measure),fg);
  const button=(y,label,run,primary=false)=>{
   const w=Math.min(64,cw),offset=Math.floor((cw-w)/2),bg=primary?p.selection:p.button;
   buttonRows(label,w,truncate,measure).forEach((line,dy)=>put(y+dy,paint('',offset,p.canvas)+paint(line,w,bg,primary?p.accent:p.text)+paint('',cw-w-offset,p.canvas)));
   targets.push({x:side+pad+offset,y,w,h:3,run});
  };
  if(width<62||height<25){button(1,'Вернуться к чату · Esc',close,true);middle(7,'Увеличьте окно для игры');return rows;}
  button(1,'← Вернуться к чату · Esc',close,true);
  // The persistent sidebar return button also closes the game.
  if(height>=18)targets.push({x:2,y:4,w:side-4,h:3,run:close});
  const info=status();middle(5,info.running?'Помощник продолжает работу':'✓ Ответ готов — можно вернуться к чату',p.accent);
  middle(6,info.running?(info.summary||'Готовит ответ…'):'Ваш ответ уже в разговоре. Игра сохранена.',p.muted);
  const gameTop=10,footer=height-5;
  if(state.kind==='menu'){
   middle(8,'Во что поиграем?');
   const choices=[['1 · Сапёр','Откройте поле и найдите безопасные клетки','mines'],['2 · Пятнашки','Соберите числа от 1 до 15','puzzle'],['3 · Динозаврик','Перепрыгивайте препятствия','runner']];
   choices.forEach(([label,help,kind],i)=>{const y=10+i*5;button(y,label,()=>select(kind));middle(y+3,help,p.muted);});
  }else{
   const g=state[state.kind];middle(8,state.kind==='mines'?`Сапёр · 10 мин · флагов: ${g.flags.size}`:state.kind==='puzzle'?`Пятнашки · ходов: ${g.moves}`:`Динозаврик · счёт: ${g.score}`);
   if(state.kind==='runner'){
    const w=Math.min(48,cw),fh=Math.max(3,Math.min(7,footer-gameTop-5)),field=Array.from({length:fh},()=>Array(w).fill(' '));field[fh-1-Math.min(fh-1,Math.round(g.y))][4]='🦖';field[fh-1][Math.min(w-1,g.x)]='▲';
    for(let y=0;y<fh;y++)middle(gameTop+y,field[y].join(''));middle(gameTop+fh,'─'.repeat(w),p.border);
    button(gameTop+fh+1,g.over?'Ещё попытка':'↑ Прыжок · Пробел / Enter',g.over?reset:jump,true);
   }else{
    const count=state.kind==='mines'?8:4,available=footer-gameTop-2;
    const cellH=Math.max(1,Math.min(3,Math.floor(available/count))),cellW=Math.max(3,Math.min(state.kind==='mines'?6:10,Math.floor(cw/count))),left=Math.floor((cw-count*cellW)/2);
    for(let y=0;y<count;y++)for(let dy=0;dy<cellH;dy++){
     let line=paint('',left,p.canvas);
     for(let x=0;x<count;x++){
      const i=y*count+x;let label,bg=p.button,fg=p.text;
      if(state.kind==='puzzle'){label=g.board[i]?String(g.board[i]):'';bg=g.board[i]?p.bubble:p.canvas;}
      else if(g.lost&&g.mines.has(i)){label='*';bg=p.errorBg;fg=p.error;}else if(g.flags.has(i)){label='F';bg=p.bubble;fg=p.accent;}else if(!g.open.has(i))label='·';else{let n=0;for(const m of g.mines)if(Math.abs(m%8-x)<=1&&Math.abs(Math.floor(m/8)-y)<=1)n++;label=n?String(n):'';bg=p.canvas;fg=p.accent;}
      if(i===cursor)bg=p.selection;
      const tile=dy===Math.floor((cellH-1)/2)?centered(label,cellW-1,truncate,measure):' '.repeat(cellW-1);
      line+=(cellH>1&&dy===cellH-1?paint('─'.repeat(cellW-1),cellW-1,p.canvas,p.border):paint(tile,cellW-1,bg,fg))+paint(' ',1,p.canvas);
      if(dy===0)targets.push({x:side+pad+left+x*cellW,y:gameTop+y*cellH,w:cellW-1,h:cellH,run:()=>{cursor=i;if(state.kind==='mines')revealMine(g,i);else moveTile(g,i);},flag:()=>{if(!g.lost&&!g.won&&!g.open.has(i)){g.flags.has(i)?g.flags.delete(i):g.flags.add(i);}}});
     }
     put(gameTop+y*cellH+dy,line+paint('',cw-left-count*cellW,p.canvas));
    }
    middle(footer-1,state.kind==='mines'?(g.lost?'Мина! Нажмите N для новой попытки':g.won?'Победа! Все безопасные клетки открыты':'Клик / Enter — открыть · правый клик / F — флаг'):(g.board.every((v,i)=>v===(i+1)%16)?'Победа! Пятнашки собраны':'Кликните плитку рядом с пустой клеткой'),p.accent);
   }
   const bw=Math.floor((Math.min(70,cw)-2)/2),offset=Math.floor((cw-bw*2-2)/2);
   const again=buttonRows('Заново · N',bw,truncate,measure),other=buttonRows('← Другие игры',bw,truncate,measure);
   for(let n=0;n<3;n++)put(footer+n,paint('',offset,p.canvas)+paint(again[n],bw,p.button)+paint('  ',2,p.canvas)+paint(other[n],bw,p.button)+paint('',cw-offset-bw*2-2,p.canvas));
   targets.push({x:side+pad+offset,y:footer,w:bw,h:3,run:reset},{x:side+pad+offset+bw+2,y:footer,w:bw,h:3,run:()=>{state.kind='menu';}});
   middle(height-1,'N — начать заново · Esc — вернуться к чату',p.muted);
  }
  return rows;
 },handleInput(data){
  if(disposed)return;if(matchesKey(data,'escape')){close();return;}
  const mouse=mouseEvent(data);if(mouse){if(size!==`${tui.terminal.columns}:${tui.terminal.rows}`)return;const x=mouse.x,y=mouse.y;if(mouse.press){const hit=targets.find(t=>y>=t.y&&y<t.y+t.h&&x>=t.x&&x<t.x+t.w);if(mouse.button===0)hit?.run();if(mouse.button===2&&state.kind==='mines')hit?.flag?.();}}
  else if(state.kind==='menu'){if(['1','2','3'].includes(data))select(['mines','puzzle','runner'][Number(data)-1]);}
  else if(data.toLowerCase()==='n')reset();
  else if(state.kind==='runner'){if(data===' '||matchesKey(data,'enter')||matchesKey(data,'up'))jump();}
  else{const count=state.kind==='mines'?8:4;if(matchesKey(data,'left'))cursor=Math.max(0,cursor-1);if(matchesKey(data,'right'))cursor=Math.min(count*count-1,cursor+1);if(matchesKey(data,'up'))cursor=Math.max(0,cursor-count);if(matchesKey(data,'down'))cursor=Math.min(count*count-1,cursor+count);if(matchesKey(data,'enter')||data===' '){if(state.kind==='mines')revealMine(state.mines,cursor);else moveTile(state.puzzle,cursor);}if(state.kind==='mines'&&data.toLowerCase()==='f'){const g=state.mines;if(!g.open.has(cursor)&&!g.lost&&!g.won){g.flags.has(cursor)?g.flags.delete(cursor):g.flags.add(cursor);}}}
  tui.requestRender();
 }};
}
