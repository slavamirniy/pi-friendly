import test from 'node:test';
import assert from 'node:assert/strict';
import {readClipboardText} from './clipboard.mjs';
test('clipboard uses platform tools without shell interpolation and preserves text',async()=>{
 for(const platform of ['win32','darwin','linux']){let calls=0;const text='Привет\n$(not a command)\n';assert.equal(await readClipboardText({platform,execute:async(file,args,options)=>{calls++;assert.ok(Array.isArray(args));assert.equal(options.windowsHide,true);assert.equal(options.timeout,5000);return{stdout:text};}}),text);assert.equal(calls,1);}
});
test('clipboard failures try Linux fallbacks and report errors',async()=>{
 let count=0;assert.equal(await readClipboardText({platform:'linux',execute:async()=>{if(++count<3)throw Error();return{stdout:'text'};}}),'text');
 await assert.rejects(readClipboardText({platform:'win32',execute:async()=>{throw Error();}}),/буфер/);
});
