import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectForm} from './project-form.mjs';
import {palettes} from './surface.mjs';
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
function fixture(){let value='';const results=[];const input={focused:true,getValue:()=>value,render:w=>[value.padEnd(w)],handleInput:data=>{if(data==='enter')input.onSubmit(value);else value+=data;}};
 const tui={terminal:{columns:80,rows:24,write(){}},requestRender(){}};
 return{results,set:v=>value=v,form:createProjectForm({tui,done:v=>results.push(v),palette:palettes.dark,makeInput:()=>input,truncate:(s,w)=>strip(s).slice(0,w),measure:s=>strip(s).length,matchesKey:(s,k)=>s===k})};}
test('custom project form validates inline, supports Cyrillic and keyboard submission',()=>{
 const h=fixture();h.form.render(80);h.form.handleInput('../bad');h.form.handleInput('enter');assert.equal(h.results.length,0);assert.ok(h.form.render(80).map(strip).join('\n').includes('без /'));
 h.set('Сайт пекарни');h.form.handleInput('tab');h.form.handleInput('enter');assert.deepEqual(h.results,['Сайт пекарни']);
});
test('custom project form mouse cancel never creates a project and both button rows click',()=>{
 const h=fixture(),rows=h.form.render(80).map(strip),y=rows.findIndex(r=>r.includes('Отмена')),x=rows[y].indexOf('Отмена');h.form.handleInput(`\x1b[<0;${x+1};${y+2}M`);assert.deepEqual(h.results,[undefined]);
 const s=fixture();s.set('Новый сайт');const rs=s.form.render(80).map(strip),yy=rs.findIndex(r=>r.includes('Создать проект')),xx=rs[yy].indexOf('Создать проект');s.form.handleInput(`\x1b[<0;${xx+1};${yy+2}M`);assert.deepEqual(s.results,['Новый сайт']);
});
