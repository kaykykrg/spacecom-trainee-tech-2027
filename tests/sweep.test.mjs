import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectGroup as reference } from '../src/reference-detector.mjs';
import { detectGroup as sweep, detectRecords, MAX_DELTA_LATITUDE } from '../src/sweep-detector.mjs';
import { runOptimized } from '../src/optimized-runner.mjs';
import { runReference } from '../src/json-writer.mjs';
import { compareEvents } from '../src/validate-official.mjs';
import { HEADER } from '../src/parser.mjs';
const row=(id,latitude=0,longitude=0,extra={})=>({idMonitorado:id,latitude,longitude,timestamp:'2024-01-01 00:00:00',faccaoMonitorado:'',medidaProtetiva:false,idsRestricaoMedida:new Set(),...extra});
const normalized=events=>[...events].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.monitoradosEncontro[0]-b.monitoradosEncontro[0]||a.monitoradosEncontro[1]-b.monitoradosEncontro[1]);
function equivalent(rows) {
  const before=[...rows], actual=normalized(sweep(rows)), expected=normalized(reference(rows));
  assert.deepEqual(actual,expected); // Exact Number equality, no tolerance.
  assert.deepEqual(rows,before);
  assert.deepEqual(normalized(sweep([...rows].reverse())),expected);
}
test('sweep: near-20m boundaries, longitude boundary, identical coordinates, poles and antimeridian',()=>{
  for(const lat of [-90,-89.999,-45,0,45,89.999]) for(const delta of [-1e-10,-1e-12,0,1e-12,1e-10]) {
    equivalent([row(2,lat),row(1,lat+MAX_DELTA_LATITUDE+delta)]);
  }
  for(const delta of [-1e-12,0,1e-12]) equivalent([row(2),row(1,0,MAX_DELTA_LATITUDE+delta)]);
  for(const rows of [[row(1,90,180),row(2,90,-180)], [row(2,0,179.99999),row(1,0,-179.99999)], [row(1,-90,-170),row(2,-90,170)], Array.from({length:30},(_,i)=>row(i))]) equivalent(rows);
  assert.equal([...sweep([row(1),row(2,MAX_DELTA_LATITUDE)])].length,0);
});
test('sweep: seeded differential distributions, classification, permutation and safe large IDs',()=>{
  let seed=904231;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const n of [0,1,2,3,10,20,40,80,120,240]) for(const kind of ['global','cluster','latitude-band','antimeridian','polar']) for(let trial=0;trial<10;trial++) {
    const rows=Array.from({length:n},(_,i)=>{
      let lat=(rand()-.5)*180,lon=(rand()-.5)*360;
      if(kind==='cluster'){lat=-23+(rand()-.5)*.001;lon=-46+(rand()-.5)*.001;}
      if(kind==='latitude-band')lat=1+(rand()-.5)*1e-5;
      if(kind==='polar')lat=89.99999-rand()*1e-5;
      if(kind==='antimeridian'){lat=(rand()-.5)*.0003;lon=(rand()>.5?1:-1)*(180-rand()*.0002);}
      return row(3000000000+i,lat,lon,{faccaoMonitorado:i%3===0?'A':'',medidaProtetiva:i%7===0,idsRestricaoMedida:new Set([3000000000+(i+1)%n,3000000000+(i+2)%n])});
    });equivalent(rows);
  }
});
test('sweep: all retained real windows match reference exactly',async()=>{
  for(let n=1;n<=7;n++) {
    const sample=JSON.parse(await readFile(new URL(`../benchmarks/sample${n}.json`,import.meta.url),'utf8'));
    for(const g of sample.groups) equivalent(g.map(r=>({...r,idsRestricaoMedida:new Set(r.idsRestricaoMedida)})));
  }
});
test('sweep rejects duplicate IDs, mixed timestamps and descending input',async()=>{
  for(const rows of [[row(1),row(1)], [row(1),row(1,1)], [row(1),row(2,0,0,{timestamp:'2024-01-01 00:00:01'})]]) assert.throws(()=>[...sweep(rows)]);
  await assert.rejects(async()=>{for await(const e of detectRecords([row(1,0,0,{timestamp:'2024-01-01 00:00:01'}),row(2)])) void e;},/Desordem/);
});
test('sweep stream keeps timestamps separate and allows the same pair at another instant',async()=>{
  const later='2024-01-01 00:00:05', collect=async rows=>{const events=[];for await(const e of detectRecords(rows))events.push(e);return events;};
  assert.equal((await collect([row(1),row(2,0,0,{timestamp:later})])).length,0);
  const events=await collect([row(1),row(2),row(1,0,0,{timestamp:later}),row(2,0,0,{timestamp:later})]);
  assert.equal(events.length,2);assert.notEqual(events[0].timestamp,events[1].timestamp);
});
test('sweep writer preserves previous output on late failure; empty JSON and profiling counts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-sweep-'));const input=join(dir,'input'),output=join(dir,'output');
  try {
    await writeFile(input,HEADER+'\n');await runOptimized(input,output);assert.deepEqual(JSON.parse(await readFile(output,'utf8')),[]);
    await writeFile(output,'previous');
    const line='1;;2024-01-01 00:00:00;0;0;false;';
    for(const bad of [line.replace('2024','2023'),line.replace('00:00:00','00:00:05')+'\n'+line.replace('00:00:00','00:00:05')]) {
      await writeFile(input,HEADER+'\n'+line+'\n'+line.replace('1;','2;')+'\n'+bad);
      await assert.rejects(runOptimized(input,output));assert.equal(await readFile(output,'utf8'),'previous');assert.deepEqual((await readdir(dir)).sort(),['input','output']);
    }
    await writeFile(input,HEADER+'\n'+line+'\n'+line.replace('1;','2;'));
    const result=await runOptimized(input,output,{profile:true});assert.equal(result.pairs,1);assert.equal(result.haversine,1);assert.equal(result.records,2);assert.equal(result.events,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('sweep official datasets: full equivalence with reference and 4/6 oracle events',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-oracle-'));
  try {for(const n of [1,2]) {
    const output=join(dir,`${n}.json`);await runOptimized(fileURLToPath(new URL(`../data/dataset${n}.txt`,import.meta.url)),output);
    const actual=JSON.parse(await readFile(output,'utf8'));
    const referenceOutput=join(dir,`reference${n}.json`);
    await runReference(fileURLToPath(new URL(`../data/dataset${n}.txt`,import.meta.url)),referenceOutput);
    assert.deepEqual(normalized(actual),normalized(JSON.parse(await readFile(referenceOutput,'utf8'))));
    const oracle=JSON.parse(await readFile(new URL(`../data/respostas${n}.json`,import.meta.url),'utf8'));
    assert.equal(compareEvents(actual,oracle).actual,n===1?4:6);
  }} finally {await rm(dir,{recursive:true,force:true});}
});
