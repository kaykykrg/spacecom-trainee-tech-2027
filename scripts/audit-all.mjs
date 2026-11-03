import { resolve } from 'node:path';
import { audit } from '../audit/phase2_5/independent.mjs';
for(let n=1;n<=7;n++) {
  const result=await audit(n,resolve('.'),resolve('evidence/inspection-results.json'));
  if(!result.pass)throw Error(`Independent audit failed: dataset${n}`);
  console.log(`dataset${n}: ${result.pairs} exhaustive pairs, ${result.expectedEvents} events, complete match`);
}
