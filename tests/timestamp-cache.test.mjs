import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecord as original} from './baseline-parser.mjs';
import {createParser} from '../src/parser.mjs';
test('B: cached date never bypasses validation of changed dates or other fields',()=>{
 const parse=createParser(),base=['1','','2024-02-29 00:00:00','-0','1e-2','false',''];
 const variants=['','0','-0','NaN','Infinity','9007199254740992','2023-02-29 00:00:00','2024-01-32 00:00:00','2024-01-01 24:00:00','2024-01-01 00:60:00','2024-01-01 00:00:60','0000-02-29 00:00:00','true','false','"A"',"'é'",'"x\'y"','2,2','1, 2','+1','1;2','1\r',' 1 '];
 for(let repeat=0;repeat<3;repeat++)for(let col=0;col<7;col++)for(const value of variants){const fields=[...base];fields[col]=value;for(const line of [base.join(';'),fields.join(';'),base.join(';')]){let a,b,ae,be;try{a=original(line);}catch(e){ae=e;}try{b=parse(line);}catch(e){be=e;}assert.equal(!!be,!!ae,line);if(!ae)assert.deepEqual(b,a);}}
});
test('B: parsers and restriction sets remain independent and mutable per record',()=>{
 const p=createParser(),q=createParser(),line='1;;2024-01-01 00:00:00;0;0;false;';
 const a=p(line),b=p(line),c=q(line);a.idsRestricaoMedida.add(9);assert.equal(b.idsRestricaoMedida.size,0);assert.equal(c.idsRestricaoMedida.size,0);
 assert.throws(()=>q(line.replace('2024-01-01','2024-02-30')));assert.deepEqual(p(line),original(line));
});
