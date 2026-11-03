import { mkdir,open,rename,rm,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('data',{recursive:true});
const inputs=JSON.parse(await readFile('evidence/inputs.json','utf8'));
for(const item of inputs.filter(i=>process.argv.includes('--all')||i.dataset>=3)) {
  const target=`data/dataset${item.dataset}.txt`,temporary=target+'.download';
  const response=await fetch(item.url);if(!response.ok)throw Error(`HTTP ${response.status}: ${item.url}`);
  const file=await open(temporary,'wx'),hash=createHash('sha256');let bytes=0;
  try {
    for await(const chunk of response.body){await file.writeFile(chunk);hash.update(chunk);bytes+=chunk.length;}
    if(bytes!==item.bytes||hash.digest('hex')!==item.sha256)throw Error(`Integrity failure dataset${item.dataset}`);
    await file.sync();await file.close();await rename(temporary,target);
  } catch(error){await file.close().catch(()=>{});await rm(temporary,{force:true});throw error;}
  console.log(`${target}: ${bytes} bytes verified`);
}
