import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOutput } from '../src/validate-output.mjs';
import { parse,distance,category,key } from '../audit/phase2_5/independent.mjs';
export async function verifyDelivery(outputDir='outputs',inputDir) {
  const manifests=JSON.parse(await readFile('evidence/approved-outputs.json','utf8'));
  const inputs=JSON.parse(await readFile('evidence/inputs.json','utf8'));
  const semantic=JSON.parse(await readFile('evidence/source-events.json','utf8'));
  const results=[];
  for(const entry of manifests) {
    const n=entry.dataset,path=resolve(outputDir,entry.file),validation=await validateOutput(path);
    assert.equal(validation.sha256,entry.sha256,`Approved bytes dataset${n}`);
    const events=JSON.parse(await readFile(path,'utf8'));
    const expected=(await readFile(`audit/phase2_5/expected${n}.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.deepEqual(events.map(key).sort(),expected.map(key).sort());
    for(const e of events) {
      const x=expected.find(x=>key(x)===key(e));assert.deepEqual(e.posicoes,x.posicoes);
      assert.ok(Math.abs(e.distanciaMetros-x.distanciaMetros)<=1e-10);
    }
    let inputHash,sourceRows=0;
    if(inputDir) {
      const wanted=new Map();
      for(const e of semantic[n-1].events)for(const p of e.sourcePositions)wanted.set(p.lineNumber,p);
      const found=new Map(),hash=createHash('sha256'),input=createReadStream(resolve(inputDir,`dataset${n}.txt`));
      input.on('data',chunk=>hash.update(chunk));
      const lines=createInterface({input,crlfDelay:Infinity});let lineNumber=0;
      input.on('error',error=>lines.emit('error',error));
      try {
        for await(const line of lines){lineNumber++;if(wanted.has(lineNumber)){const p=parse(line,lineNumber);assert.equal(line,wanted.get(lineNumber).raw);found.set(lineNumber,p);}}
      } finally {lines.close();input.destroy();}
      inputHash=hash.digest('hex');assert.equal(inputHash,inputs[n-1].sha256);
      assert.equal(found.size,wanted.size);sourceRows=found.size;
      for(const e of semantic[n-1].events) {
        const [p,q]=e.sourcePositions.map(p=>found.get(p.lineNumber)),output=events.find(x=>key(x)===e.key);
        assert.ok(output);assert.equal(p.ts,output.timestamp);assert.equal(q.ts,output.timestamp);
        assert.equal(category(p,q),output.tipo);assert.ok(distance(p,q)<20);
        assert.deepEqual(output.posicoes,{[p.id]:{lat:p.lat,lon:p.lon},[q.id]:{lat:q.lat,lon:q.lon}});
        assert.ok(Math.abs(distance(p,q)-output.distanciaMetros)<=1e-10);
      }
    }
    results.push({dataset:n,...validation,independentSetMatches:true,sourceChecked:Boolean(inputDir),sourceRows,inputSha256:inputHash});
  }
  return {node:process.version,results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await verifyDelivery(process.argv[2]??'outputs',process.argv[3]);
  await mkdir('validation',{recursive:true});await writeFile('validation/delivery-check.json',JSON.stringify(result,null,2));
  console.log(`Verified ${result.results.length} outputs; ${result.results.reduce((s,r)=>s+r.events,0)} events; source check=${Boolean(process.argv[3])}`);
}
