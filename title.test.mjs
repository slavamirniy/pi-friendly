import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanChatTitle,isValidChatTitle,fallbackChatTitle,finalChatTitle,createTitleGenerator,buildTitlePrompt} from './title.mjs';

test('cleanChatTitle removes labels, quotes, fences and markdown',()=>{
 assert.equal(cleanChatTitle('```\nНазвание: Сайт пекарни.\n```'),'Сайт пекарни');
 assert.equal(cleanChatTitle('Title: "Bakery landing page"'),'Bakery landing page');
 assert.equal(cleanChatTitle('«Ремонт кухни»'),'Ремонт кухни');
 assert.equal(cleanChatTitle('## **План поездки**'),'План поездки');
 assert.equal(cleanChatTitle('  привет   мир  '),'привет мир');
 assert.equal(cleanChatTitle(''),'');
 assert.equal(cleanChatTitle(null),'');
});

test('cleanChatTitle truncates long titles at a word boundary',()=>{
 const value=cleanChatTitle('Очень длинное название чата которое не должно превышать лимит символов и слов');
 assert.ok(value.length<=64,value);
 assert.equal(value.endsWith(' '),false);
});

test('isValidChatTitle rejects garbage, refusals, URLs and code',()=>{
 assert.equal(isValidChatTitle('Сайт пекарни'),true);
 assert.equal(isValidChatTitle('Привет'),true);
 assert.equal(isValidChatTitle(''),false);
 assert.equal(isValidChatTitle('...'),false);
 assert.equal(isValidChatTitle('12345'),false);
 assert.equal(isValidChatTitle('Новый чат'),false);
 assert.equal(isValidChatTitle('Извините, я не могу придумать название'),false);
 assert.equal(isValidChatTitle('https://example.com'),false);
 assert.equal(isValidChatTitle('<script>alert(1)</script>'),false);
 assert.equal(isValidChatTitle('console.log(1)'),false);
 assert.equal(isValidChatTitle('Очень длинное название '.repeat(5)),false);
});

test('fallbackChatTitle makes a readable title from the first message',()=>{
 assert.equal(fallbackChatTitle('Привет! Помоги сделать сайт пекарни'),'Помоги сделать сайт пекарни');
 assert.equal(fallbackChatTitle('привет'),'Привет');
 assert.equal(fallbackChatTitle('https://example.com'),'Ссылка');
 assert.equal(fallbackChatTitle('```js\nconsole.log(1)\n```'),'Задача по коду');
 assert.equal(fallbackChatTitle('/help'),'');
 assert.equal(fallbackChatTitle('!!!'),'');
});

test('finalChatTitle falls back when the model returns a refusal',()=>{
 assert.equal(finalChatTitle('Извините, я не могу придумать название','Сделай сайт пекарни'),'Сделай сайт пекарни');
 assert.equal(finalChatTitle('Сайт пекарни','Сделай сайт пекарни'),'Сайт пекарни');
 assert.equal(finalChatTitle('Новый чат',''), '');
});

test('title generator sends a bounded prompt and returns text',async()=>{
 let request;
 const generate=createTitleGenerator({complete:async(model,context,options)=>{request={model,context,options};return{stopReason:'stop',content:[{type:'text',text:'Сайт пекарни'}]};},resolveModel:()=>({id:'m',provider:'router'})});
 const title=await generate('Сделай сайт пекарни');
 assert.equal(title,'Сайт пекарни');
 assert.equal(request.options.maxTokens,64);
 assert.equal(request.options.cacheRetention,'none');
 assert.match(request.context.systemPrompt,/только название/i);
 assert.match(request.context.messages[0].content[0].text,/<<</);
 assert.match(buildTitlePrompt('x'.repeat(2000)),/<<</);
});

test('title generator rejects empty, truncated and failed responses',async()=>{
 const make=(response)=>createTitleGenerator({complete:async()=>response,resolveModel:()=>({id:'m'})});
 await assert.rejects(make({stopReason:'error',errorMessage:'router down',content:[]})('x'),/router down/);
 await assert.rejects(make({stopReason:'length',content:[]})('x'),/обрезан/);
 await assert.rejects(make({stopReason:'stop',content:[]})('x'),/пустой/);
 const noModel=createTitleGenerator({complete:async()=>({}),resolveModel:()=>undefined});
 await assert.rejects(noModel('x'),/Нет доступной модели/);
});
