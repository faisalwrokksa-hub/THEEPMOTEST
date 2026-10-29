import test from 'node:test';
import assert from 'node:assert/strict';
import {previewImport,validateMapping} from './import-preflight.mjs';
const schema=[{key:'project',name:'Project',shape:'single',columns:[{key:'code',required:true},{key:'name',required:true}]}];
test('valid workbook preview is read-only',()=>{const r=previewImport({sheets:{project:[{code:'P1',name:'Test'}]},problems:[],notes:[]},schema);assert.equal(r.ok,true);assert.equal(r.readOnly,true)});
test('required missing fields block preview',()=>assert.equal(previewImport({sheets:{project:[{code:'P1'}]},problems:[],notes:[]},schema).canImport,false));
test('ambiguous mapping rejected',()=>assert.throws(()=>validateMapping({a:'code',b:'code'},['code','name'])));
test('unknown target rejected',()=>assert.throws(()=>validateMapping({a:'secret'},['code'])));
test('valid explicit mapping',()=>assert.deepEqual(validateMapping({'Project ID':'code'},['code']),{'Project ID':'code'}));
