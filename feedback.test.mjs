import test from 'node:test';
import assert from 'node:assert/strict';
import {explainError,wrapText} from './errors.mjs';
import {startActivity,finishActivity,activityLabel} from './activity.mjs';
test('known failures get distinct explanations and next steps without raw dumps',()=>{
 const cases=[['401 invalid api key','ключ доступа'],['403 forbidden','Нет доступа'],['429 rate limit','много запросов'],['insufficient_quota','лимит'],['timeout','вовремя'],['fetch failed','связаться'],['503 unavailable','недоступен'],['maximum context length','длинным'],['unknown failure','получить ответ']];
 for(const [raw,part]of cases){const e=explainError(raw);assert.ok(e.title.includes(part),raw);assert.ok(e.help.length>15);assert.ok(!e.help.includes(raw));}
 assert.ok(explainError('x','tool').title.includes('действие'));assert.ok(wrapText('longwordwithnospaces hello',5).every(l=>l.length<=5));
});
test('activity follows actual start/end IDs, not fabricated completion',()=>{
 let rows=startActivity([],{toolCallId:'a',toolName:'write',args:{path:'src/index.html'}},100);
 rows=startActivity(rows,{toolCallId:'b',toolName:'bash',args:{command:'npm run build'}},200);
 rows=finishActivity(rows,{toolCallId:'a',isError:false},300);assert.equal(rows[0].status,'done');assert.equal(rows[1].status,'running');
 rows=finishActivity(rows,{toolCallId:'b',isError:true},400);assert.equal(rows[1].status,'error');assert.equal(rows[1].ended,400);
 assert.equal(activityLabel('bash',{command:'npm run build'}),'Проверяю сборку');assert.ok(rows[0].label.includes('index.html'));
});
