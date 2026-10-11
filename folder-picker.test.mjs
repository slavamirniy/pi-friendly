import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {pickProjectFolder} from './folder-picker.mjs';
function spawnMock(output,code=0,stderr=''){return(command,args,options)=>{assert.equal(options.windowsHide,true);assert.equal(options.shell,undefined);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(output));child.stderr.emit('data',Buffer.from(stderr));child.emit('close',code);});return child;};}
test('native picker returns Unicode paths intact and cancellation creates nothing',async()=>{
 assert.equal(await pickProjectFolder({platform:'win32',spawnProcess:spawnMock('C:\\Работа\\Мой проект\r\n')}),'C:\\Работа\\Мой проект');
 assert.equal(await pickProjectFolder({platform:'win32',spawnProcess:spawnMock('')}),undefined);
 assert.equal(await pickProjectFolder({platform:'darwin',spawnProcess:spawnMock('',1,'User canceled. (-128)')}),undefined);
 assert.equal(await pickProjectFolder({platform:'linux',spawnProcess:spawnMock('',1)}),undefined);
});
