import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
const [inputDir='data',datasets='1,2,3,4,5,6,7',repetitions='6',label='ab-final']=process.argv.slice(2);
const count=Number(repetitions);if(!Number.isInteger(count)||count<2||count%2)throw Error('Even repetitions >=2 required');
await mkdir('validation/phase4-generated',{recursive:true});
const approved=JSON.parse(await readFile('evidence/approved-outputs.json'));
const result={node:process.version,os:os.release(),cpu:os.cpus()[0].model,repetitions:count,runs:[]};
async function run(dataset,mode,warmup){
 const args=['benchmarks/phase4-worker.mjs',resolve(inputDir,`dataset${dataset}.txt`),`validation/phase4-generated/${mode}${dataset}.json`,mode];
 const data=await new Promise((ok,no)=>{let out='',err='';const p=spawn(process.execPath,args);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',no);p.on('exit',c=>c?no(Error(err)):ok(JSON.parse(out)));});
 if(data.sha256!==approved[dataset-1].sha256)throw Error('Output mismatch');result.runs.push({dataset,warmup,at:new Date().toISOString(),...data});await writeFile(`validation/${label}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({dataset,mode,warmup,seconds:data.wallMs/1000}));
}
for(const dataset of datasets.split(',').map(Number)){
 for(const mode of ['baseline','b'])await run(dataset,mode,true);
 for(let round=0;round<count/2;round++)for(const mode of ['baseline','b','b','baseline'])await run(dataset,mode,false);
}
