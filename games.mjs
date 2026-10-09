import {mouseEvent} from './menu.mjs';
import {acquireMouse} from './mouse.mjs';
import {centered} from './buttons.mjs';
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
export function createGames({tui,done,palette:p,truncate,measure,matchesKey,state,status}){
 state.kind??='menu';let disposed=false,targets=[],size='',cursor=0,renderWidth=0,renderHeight=0;
 const release=acquireMouse(tui.terminal),close=()=>{if(disposed)return;dispose();done();};
 const dispose=()=>{if(disposed)return;disposed=true;clearInterval(timer);release();};
 const reset=()=>{state[state.kind]=state.kind==='mines'?newMines():state.kind==='puzzle'?newPuzzle():newRunner();};
 const select=kind=>{state.kind=kind;cursor=0;if(!state[kind])reset();tui.requestRender();};
 const jump=()=>{const g=state.runner;if(g&&!g.over&&g.y===0)g.v=2.6;};
 const timer=setInterval(()=>{if(disposed)return;if(state.kind==='runner'&&status().running&&state.runner){stepRunner(state.runner);}tui.requestRender();},100);timer.unref?.();
 const paint=(text,w,bg=p.sidebar,fg=p.text)=>{const t=truncate(text,w,'');return `\x1b[48;2;${bg}m\x1b[38;2;${fg}m${t}`+' '.repeat(Math.max(0,w-measure(t)))+'\x1b[0m';};
 return {dispose,invalidate(){},render(width){
  const height=Math.min(23,tui.terminal.rows);renderWidth=width;renderHeight=height;const rows=Array(height).fill(paint('',width));targets=[];size=`${tui.terminal.columns}:${tui.terminal.rows}`;
  const put=(y,text,fg=p.text)=>{if(y>=0&&y<height)rows[y]=paint(centered(text,width,truncate,measure),width,p.sidebar,fg);};
  const button=(y,label,run,bg=p.button)=>{put(y,'');rows[y]=paint('  ',2)+paint(centered(label,width-4,truncate,measure),width-4,bg)+paint('  ',2);targets.push({x:2,y,w:width-4,run});};
  button(0,'× Свернуть · Esc',close);const info=status();put(2,info.running?'Помощник работает · можно поиграть':'✓ Ответ готов · вернитесь к чату',p.accent);put(3,info.running?(info.summary||'Готовит ответ…'):'Нажмите «Свернуть» или Esc',p.muted);
  if(height<23||width<36){put(6,'Увеличьте окно для игры');return rows;}
  if(state.kind==='menu'){
   put(5,'Мини-игры');button(8,'1 · Сапёр',()=>select('mines'));put(9,'Откройте поле, избегая мин',p.muted);
   button(12,'2 · Пятнашки',()=>select('puzzle'));put(13,'Соберите числа по порядку',p.muted);
   button(16,'3 · Динозаврик',()=>select('runner'));put(17,'Перепрыгивайте препятствия',p.muted);
  }else{
   const g=state[state.kind];put(5,state.kind==='mines'?'Сапёр · 10 мин':state.kind==='puzzle'?`Пятнашки · ходов: ${g.moves}`:`Динозаврик · счёт: ${g.score}`);
   if(state.kind==='runner'){
    const w=Math.min(40,width-4),field=Array.from({length:6},()=>Array(w).fill(' '));field[5-Math.min(5,Math.round(g.y))][4]='🦖';field[5][Math.min(w-1,g.x)]='▲';for(let y=0;y<6;y++)put(7+y,field[y].join(''));put(13,'─'.repeat(w));
    button(15,g.over?'Столкновение · Новая попытка':'↑ Прыжок · Пробел / Enter',g.over?reset:jump);put(16,info.running?'':'Игра на паузе: ответ уже готов',p.muted);
   }else{
    const count=state.kind==='mines'?8:4,cell=state.kind==='mines'?3:5,left=Math.floor((width-count*cell)/2);
    for(let y=0;y<count;y++){
     let line=paint('',left);
     for(let x=0;x<count;x++){
      const i=y*count+x;let label;
      if(state.kind==='puzzle')label=g.board[i]?String(g.board[i]):'·';
      else if(g.lost&&g.mines.has(i))label='*';else if(g.flags.has(i))label='F';else if(!g.open.has(i))label='□';else{let n=0;for(const m of g.mines)if(Math.abs(m%8-x)<=1&&Math.abs(Math.floor(m/8)-y)<=1)n++;label=n?String(n):'·';}
      line+=paint(centered(label,cell,truncate,measure),cell,i===cursor?p.selection:p.button);targets.push({x:left+x*cell,y:7+y,w:cell,run:()=>{cursor=i;if(state.kind==='mines')revealMine(g,i);else moveTile(g,i);},flag:()=>{if(!g.lost&&!g.won&&!g.open.has(i)){g.flags.has(i)?g.flags.delete(i):g.flags.add(i);}}});
     }rows[7+y]=line+paint('',width-left-count*cell);
    }
    put(16,state.kind==='mines'?(g.lost?'Мина! Попробуйте ещё раз':g.won?'Поле очищено!':'Клик — открыть · правый клик / F — флаг'):(g.board.every((v,i)=>v===(i+1)%16)?'Собрано!':'Нажмите плитку рядом с пустой клеткой'),p.accent);
   }
   button(18,'Заново · N',reset);button(20,'← Выбрать другую игру',()=>{state.kind='menu';});
  }
  return rows;
 },handleInput(data){
  if(disposed)return;if(matchesKey(data,'escape')){close();return;}
  const mouse=mouseEvent(data);if(mouse){if(size!==`${tui.terminal.columns}:${tui.terminal.rows}`)return;const width=renderWidth,height=renderHeight,x=mouse.x-Math.floor((tui.terminal.columns-width)/2),y=mouse.y-Math.floor((tui.terminal.rows-height)/2);if(mouse.press){const hit=targets.find(t=>y===t.y&&x>=t.x&&x<t.x+t.w);if(mouse.button===0)hit?.run();if(mouse.button===2&&state.kind==='mines')hit?.flag?.();}}
  else if(state.kind==='menu'){if(['1','2','3'].includes(data))select(['mines','puzzle','runner'][Number(data)-1]);}
  else if(data.toLowerCase()==='n')reset();
  else if(state.kind==='runner'){if(data===' '||matchesKey(data,'enter')||matchesKey(data,'up'))jump();}
  else{const count=state.kind==='mines'?8:4;if(matchesKey(data,'left'))cursor=Math.max(0,cursor-1);if(matchesKey(data,'right'))cursor=Math.min(count*count-1,cursor+1);if(matchesKey(data,'up'))cursor=Math.max(0,cursor-count);if(matchesKey(data,'down'))cursor=Math.min(count*count-1,cursor+count);if(matchesKey(data,'enter')||data===' '){if(state.kind==='mines')revealMine(state.mines,cursor);else moveTile(state.puzzle,cursor);}if(state.kind==='mines'&&data.toLowerCase()==='f'){const g=state.mines;if(!g.open.has(cursor)&&!g.lost&&!g.won){g.flags.has(cursor)?g.flags.delete(cursor):g.flags.add(cursor);}}}
  tui.requestRender();
 }};
}
