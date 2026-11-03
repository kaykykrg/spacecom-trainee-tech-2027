import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runOptimized } from '../src/optimized-runner.mjs';
import { verifyDelivery } from './verify-delivery.mjs';
const input=process.argv[2]??'data',output=process.argv[3]??'generated';
if(resolve(output)===resolve('outputs'))throw Error('Use a separate folder to preserve approved outputs');
await mkdir(output,{recursive:true});const results=[];
for(let n=1;n<=7;n++) {
  const result=await runOptimized(resolve(input,`dataset${n}.txt`),resolve(output,`respostas${n}.json`));
  results.push({dataset:n,...result});console.error(`dataset${n}: ${result.events} events in ${result.totalMs.toFixed(1)} ms`);
}
const verification=await verifyDelivery(output,input);
await mkdir('validation',{recursive:true});await writeFile('validation/reproduction.json',JSON.stringify({results,verification},null,2));
console.log('All seven regenerated outputs match the approved hashes and independent semantics.');
