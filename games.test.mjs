import test from 'node:test';
import assert from 'node:assert/strict';
import {newMines,revealMine,newPuzzle,moveTile,newRunner,stepRunner,createGames} from './games.mjs';
import {palettes} from './surface.mjs';
test('mines first click and its neighbors are safe, flags block opening and all safe cells win',()=>{
 const g=newMines();revealMine(g,27,()=>.4);assert.equal(g.mines.size,10);assert.ok(!g.lost);for(const i of g.mines)assert.ok(Math.abs(i%8-3)>1||Math.abs(Math.floor(i/8)-3)>1);
 const hidden=Array.from({length:64},(_,i)=>i).find(i=>!g.open.has(i)&&!g.mines.has(i));g.flags.add(hidden);revealMine(g,hidden);assert.ok(!g.open.has(hidden));g.flags.delete(hidden);
 for(let i=0;i<64;i++)if(!g.mines.has(i))revealMine(g,i);assert.equal(g.won,true);
});
test('puzzle shuffle stays solvable and allows only adjacent moves',()=>{
 for(let n=0;n<50;n++){
 const g=newPuzzle(),a=g.board.filter(Boolean);let inv=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i]>a[j])inv++;
 assert.equal((inv+4-Math.floor(g.board.indexOf(0)/4))%2,1);assert.ok(!g.board.every((v,i)=>v===(i+1)%16));
 const z=g.board.indexOf(0),neighbor=z>=4?z-4:z+4;assert.ok(moveTile(g,neighbor));assert.equal(g.moves,1);assert.equal(moveTile(g,-1),false);
 }
});
test('runner collides on ground, clears obstacles in air and freezes after collision',()=>{
 const a=newRunner();a.x=5;stepRunner(a);assert.equal(a.over,true);const old=a.x;stepRunner(a);assert.equal(a.x,old);
 const b=newRunner();b.x=5;b.v=2.6;stepRunner(b);assert.equal(b.over,false);b.x=0;stepRunner(b,()=>0);assert.equal(b.score,1);
});
test('games cover full viewport, preserve sidebar and have large clickable controls',()=>{
 const state={},strip=s=>s.replace(/\x1b\[[0-9;]*m/g,''),writes=[];let closed=0;
 const tui={terminal:{columns:120,rows:36,write:s=>writes.push(s)},requestRender(){}};
 const g=createGames({tui,state,done:()=>closed++,palette:palettes.light,background:()=>Array(36).fill('S'.repeat(26)+'NATIVE CONTENT'.padEnd(94)),truncate:(s,w)=>strip(s).slice(0,w),measure:s=>strip(s).length,matchesKey:(s,k)=>s===k,status:()=>({running:true,summary:'Создаю файл'})});
 let rows=g.render(120).map(strip);assert.equal(rows.length,36);assert.ok(rows.every(r=>r.length===120));assert.ok(rows.every(r=>r.startsWith('S'.repeat(26))));assert.ok(!rows.join('').includes('NATIVE CONTENT'));
 g.handleInput('\x1b[<0;55;12M');assert.equal(state.kind,'mines');rows=g.render(120).map(strip);assert.ok(rows.some(r=>r.includes('Сапёр')));assert.ok(rows.some(r=>r.includes('Заново')));
 g.handleInput('\x1b[<0;50;3M');assert.equal(closed,1);g.dispose();assert.ok(writes.at(-1).includes('1000l'));
});
test('all games fit short and wide viewports without leaking background',()=>{
 const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
 for(const width of [60,80,120,160])for(const height of [20,25,36,45])for(const kind of ['menu','mines','puzzle','runner']){
 const tui={terminal:{columns:width,rows:height,write(){}},requestRender(){}},state={kind,mines:newMines(),puzzle:newPuzzle(),runner:newRunner()};
 const g=createGames({tui,state,done(){},palette:palettes.dark,truncate:(s,w)=>strip(s).slice(0,w),measure:s=>strip(s).length,matchesKey:(s,k)=>s===k,status:()=>({running:false})});
 const rows=g.render(width).map(strip);assert.equal(rows.length,height);assert.ok(rows.every(r=>r.length===width),`${width} ${height} ${kind}`);g.dispose();
 }
});
