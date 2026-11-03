import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateOutput } from '../src/validate-output.mjs';
test('output validator rejects truncation, duplicates, trailing/missing commas and distance corruption',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-output-')),path=join(dir,'out');
  const e={tipo:'generico',monitoradosEncontro:[1,2],timestamp:'2024-01-01 00:00:00',posicoes:{1:{lat:0,lon:0},2:{lat:0,lon:0}},distanciaMetros:0},s=JSON.stringify(e);
  try {
    for(const good of ['[]\n','[\n]\n',`[\n${s}\n]\n`]) {await writeFile(path,good);await validateOutput(path);}
    for(const bad of ['', '[\n',`[\n${s}`,`[\n${s},\n]\n`,`[\n${s}\n${s}\n]\n`,`[\n${s},\n${s}\n]\n`,`[\n${JSON.stringify({...e,distanciaMetros:1})}\n]\n`,'[]\n[]']) {await writeFile(path,bad);await assert.rejects(validateOutput(path));}
    await assert.rejects(validateOutput(join(dir,'missing')));
  } finally {await rm(dir,{recursive:true,force:true});}
});
