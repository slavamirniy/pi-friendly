import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createModelPreference} from './model-preference.mjs';
test('model preference survives new sessions and gracefully skips unavailable models',t=>{
 const root=mkdtempSync(join(tmpdir(),'pi-model-test-'));t.after(()=>{assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});});
 const file=join(root,'model.json'),store=createModelPreference(file),model={id:'chosen',provider:'router',name:'Chosen'};
 assert.equal(store.resolve([model]),undefined);store.save(model);
 assert.deepEqual(createModelPreference(file).read(),{id:'chosen',provider:'router'});
 assert.equal(createModelPreference(file).resolve([model]),model);assert.equal(store.resolve([]),undefined);
 writeFileSync(file,'bad json');assert.equal(store.read(),undefined);
});
