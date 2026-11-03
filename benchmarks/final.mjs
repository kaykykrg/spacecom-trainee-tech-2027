import { spawnSync } from 'node:child_process';
import { cpus,platform,release,totalmem } from 'node:os';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runOptimized } from '../src/optimized-runner.mjs';
if(process.argv[2]==='child') {
  const n=Number(process.argv[3]),input=process.argv[4],output=`generated/respostas${n}.json`;
  const start=performance.now();const run=await runOptimized(`${input}/dataset${n}.txt`,output);
  const wallMs=performance.now()-start;
  const sha256=createHash('sha256').update(await readFile(output)).digest('hex');
  console.log(JSON.stringify({dataset:n,totalMs:wallMs,peakRssKiB:run.peakRssKiB,events:run.events,sha256}));
} else {
  const input=process.argv[2]??'data',repetitions=Number(process.argv[3]??3);
  if(!Number.isInteger(repetitions)||repetitions<3)throw Error('At least 3 repetitions required');
  await mkdir('generated',{recursive:true});await mkdir('validation',{recursive:true});
  const approved=JSON.parse(await readFile('evidence/approved-outputs.json','utf8'));
  const report={node:process.version,npm:process.env.npm_config_user_agent??null,platform:platform(),os:release(),cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),repetitions,method:'Optimized pipeline only, no profiling/hash inside timed region; isolated process per run; sequential runs; no cache clearing or explicit warmup; includes input reading/parsing/detection/JSON writing/sync/rename, excludes process startup and output hash verification. Peak RSS native process high-water mark.',results:[]};
  for(let n=1;n<=7;n++) {
    const trials=[];
    for(let trial=1;trial<=repetitions;trial++) {
      const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'child',String(n),input],{encoding:'utf8'});
      if(child.status!==0)throw Error(child.stderr||child.error);
      const result=JSON.parse(child.stdout);
      if(result.sha256!==approved[n-1].sha256)throw Error(`Output hash mismatch dataset${n}`);
      trials.push({trial,...result});console.error(`dataset${n} trial${trial}: ${(result.totalMs/1000).toFixed(3)} s`);
    }
    const times=trials.map(t=>t.totalMs),meanMs=times.reduce((s,t)=>s+t,0)/times.length;
    report.results.push({dataset:n,trials,meanMs,minMs:Math.min(...times),maxMs:Math.max(...times),stddevMs:Math.sqrt(times.reduce((s,t)=>s+(t-meanMs)**2,0)/times.length),peakRssKiB:Math.max(...trials.map(t=>t.peakRssKiB)),events:trials[0].events});
    await writeFile('validation/final-benchmark.json',JSON.stringify(report,null,2));
  }
}
