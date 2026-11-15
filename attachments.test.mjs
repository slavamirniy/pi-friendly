import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentBlock,splitAttachments,buildOutgoingText,stripAttachments} from './web/attachments.js';

test('attachment markers round-trip text, names and absolute paths',()=>{
 const items=[
  {name:'index.html',path:'C:\\Users\\User\\site\\index.html',size:1234},
  {name:'фото 1.png',path:'C:\\Users\\User\\Desktop\\фото 1.png'},
 ];
 const text=buildOutgoingText('Посмотри файлы',items);
 assert.match(text,/Посмотри файлы/);
 const parsed=splitAttachments(text);
 assert.equal(parsed.text,'Посмотри файлы');
 assert.deepEqual(parsed.attachments,items);
 assert.equal(stripAttachments(text),'Посмотри файлы');
});

test('attachment-only messages keep an empty visible text',()=>{
 const text=buildOutgoingText('',[{name:'a.pdf',path:'C:\\a.pdf',size:42}]);
 const parsed=splitAttachments(text);
 assert.equal(parsed.text,'');
 assert.equal(parsed.attachments.length,1);
 assert.equal(parsed.attachments[0].path,'C:\\a.pdf');
 assert.equal(parsed.attachments[0].size,42);
});

test('plain messages and malformed attachment lines are harmless',()=>{
 assert.deepEqual(splitAttachments('Привет'),{text:'Привет',attachments:[]});
 const malformed='Текст\n\n[[ATTACHMENTS]]\n{broken}\n[[/ATTACHMENTS]]';
 const parsed=splitAttachments(malformed);
 assert.equal(parsed.text,'Текст');
 assert.deepEqual(parsed.attachments,[]);
});

test('attachment block appends to the end of the outgoing text',()=>{
 const text=buildOutgoingText('Сделай сайт',[{name:'brief.txt',path:'D:\\brief.txt'}]);
 assert.ok(text.startsWith('Сделай сайт'));
 assert.ok(text.trimEnd().endsWith('[[/ATTACHMENTS]]'));
});