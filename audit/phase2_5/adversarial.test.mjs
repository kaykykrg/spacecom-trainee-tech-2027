import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,rm,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distance,category,exhaustive,windows,key,parse,audit } from './independent.mjs';
// Production functions are used only as the subject of differential tests;
// the independent verifier itself imports none of them.
import { detectGroup as production } from '../../src/sweep-detector.mjs';
const row=(id,lat=0,lon=0,extra={})=>({id,lat,lon,ts:'2024-01-01 00:00:00',faction:'',victim:false,restrictions:[],...extra});
const prod=r=>({idMonitorado:r.id,latitude:r.lat,longitude:r.lon,timestamp:r.ts,faccaoMonitorado:r.faction,medidaProtetiva:r.victim,idsRestricaoMedida:new Set(r.restrictions)});
const signatures=events=>events.map(e=>key(e)).sort();
function compare(rows,count){const a=[...exhaustive(rows)],b=[...production(rows.map(prod))];assert.deepEqual(signatures(a),signatures(b));if(count!==undefined)assert.equal(a.length,count);return a;}
const header='idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida';
const line=r=>[r.id,r.faction,r.ts,r.lat,r.lon,r.victim,r.restrictions.join(',')].join(';');
const collect=async path=>{const events=[];for await(const g of windows(path))events.push(...exhaustive(g));return events;};

test('independent oracle gate: all fields and canonical sets match the official 4+6',async()=>{
  for(const n of [1,2]) {
    const expected=(await readFile(`audit/phase2_5/expected${n}.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
    const official=JSON.parse(await readFile(`data/respostas${n}.json`,'utf8'));
    assert.deepEqual(signatures(expected),signatures(official));assert.equal(expected.length,n===1?4:6);
    for(const e of expected){const o=official.find(o=>key(o)===key(e));assert.deepEqual(e.posicoes,o.posicoes);assert.ok(Math.abs(e.distanciaMetros-o.distanciaMetros)<=1e-10);}
  }
});
test('independent Haversine: zero, known equator arc and antipodes',()=>{
  assert.equal(distance(row(1),row(2)),0);
  assert.ok(Math.abs(distance(row(1),row(2,0,90))-6371000*Math.PI/2)<1e-8);
  assert.equal(distance(row(1),row(2,0,180)),6371000*Math.PI);
});
test('immediately below/above 20m, both latitude and longitude, with asserted absence',()=>{
  for(const d of [19.9999999,19.999999999,20,20.000000001,20.0000001]) {
    const deg=d/6371000*180/Math.PI;
    for(const p of [row(2,deg),row(2,0,deg)]) {
      const got=distance(row(1),p);assert.ok(Math.abs(got-d)<1e-12);
      compare([row(1),p],d<20?1:0);
    }
  }
});
test('precision boundary: adjacent representable degree values around 20m',()=>{
  const buf=new ArrayBuffer(8),v=new DataView(buf),angle=20/6371000*180/Math.PI;
  v.setFloat64(0,angle);const bits=v.getBigUint64(0);
  for(let step=-16n;step<=16n;step++) {
    v.setBigUint64(0,bits+step);const lat=v.getFloat64(0);
    const d=distance(row(1),row(2,lat));
    // Compare decisions, not merely distances within a tolerance.
    const e=[...exhaustive([row(1),row(2,lat)])];assert.equal(e.length,d<20?1:0);
    compare([row(1),row(2,lat)]);
  }
});
test('same/different/empty faction and exclusive victim linkage',()=>{
  assert.equal(category(row(1),row(2)),'generico');
  assert.equal(category(row(1,0,0,{faction:'X'}),row(2,0,0,{faction:'Y'})),'generico');
  assert.equal(category(row(1,0,0,{faction:'X'}),row(2,0,0,{faction:'X'})),'faccao');
  const victim=row(10,0,0,{victim:true,faction:'X',restrictions:[1]});
  assert.equal(category(victim,row(1,0,0,{faction:'X'})),'protetiva');
  assert.equal(category(row(1),victim),'protetiva');
  assert.equal(category(victim,row(11)),null);compare([victim,row(11)],0);
  assert.equal(category(victim,row(1,0,0,{victim:true,restrictions:[10]})),null);
  const reversed=row(10,0,0,{victim:true,restrictions:[11]});compare([reversed,row(1)],0);compare([reversed,row(11)],1);
});
test('coincident different IDs and dense populations: exactly n(n-1)/2 pairs',()=>{
  for(const n of [2,3,10,120])compare(Array.from({length:n},(_,i)=>row(i)),n*(n-1)/2);
});
test('near poles and antimeridian: valid encounters and far pairs',()=>{
  compare([row(1,89.999999,0),row(2,89.999999,180)],1);
  compare([row(1,0,179.99999),row(2,0,-179.99999)],1);
  compare([row(1,0,179),row(2,0,-179)],0);
  compare([row(1,-89.999999,-180),row(2,-89.999999,180)],1);
});
test('varying density and deterministic random geographies match production',()=>{
  let seed=2502;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const n of [1,5,20,60,120])for(const span of [0.00001,0.001,1,90])for(let k=0;k<10;k++) {
    compare(Array.from({length:n},(_,i)=>row(i,(random()-.5)*span,(random()-.5)*span,{faction:i%3===0?'A':'',victim:i%11===0,restrictions:[i+1]})));
  }
});
test('streaming first and last windows, 5-second separation, consecutive same pair',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-independent-')),path=join(dir,'input');
  try {
    const later='2024-01-01 00:00:05';
    await writeFile(path,'\uFEFF'+header+'\r\n'+[row(1),row(2),row(1,0,0,{ts:later}),row(2,0,0,{ts:later})].map(line).join('\r\n'));
    const events=await collect(path);assert.equal(events.length,2);assert.equal(events[0].timestamp,'2024-01-01 00:00:00');assert.equal(events[1].timestamp,later);
    await writeFile(path,header+'\n'+[row(1),row(2,0,0,{ts:later})].map(line).join('\n'));assert.equal((await collect(path)).length,0);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('independent parser rejects duplicate/conflicting IDs, malformed fields and disorder',async()=>{
  for(const s of ['1;2',line(row(1)).replace(';0;0;',';NaN;0;'),line(row(1)).replace('2024-01-01','2024-02-30')])assert.throws(()=>parse(s));
  const dir=await mkdtemp(join(tmpdir(),'spacecom-independent-')),path=join(dir,'input');
  try {
    for(const rows of [[row(1),row(1)],[row(1),row(1,1)],[row(1,0,0,{ts:'2024-01-01 00:00:05'}),row(2)]]) {
      await writeFile(path,header+'\n'+rows.map(line).join('\n'));await assert.rejects(collect(path));
    }
  }finally {await rm(dir,{recursive:true,force:true});}
});
test('independent audit detects injected missing, extra, wrong type, coordinates, distance and duplication',async()=>{
  const root=await mkdtemp(join(tmpdir(),'spacecom-audit-mutations-'));
  try {
    for(const path of ['data','outputs','audit/phase2_5'])await mkdir(join(root,path),{recursive:true});
    const input=header+'\n'+[row(1),row(2)].map(line).join('\n');
    await writeFile(join(root,'data/dataset1.txt'),input);
    await writeFile(join(root,'outputs/inspection-results.json'),JSON.stringify([{records:2,distinct_timestamps:1,brute_force_pair_candidates:1,bytes_read:Buffer.byteLength(input),sha256:createHash('sha256').update(input).digest('hex')}]));
    const event=[...exhaustive([row(1),row(2)])][0];
    const run=async events=>{await writeFile(join(root,'outputs/respostas1.json'),JSON.stringify(events));return audit(1,root);};
    assert.equal((await run([event])).pass,true);
    assert.equal((await run([])).missing.length,1);
    assert.equal((await run([event,{...event,monitoradosEncontro:[1,3]}])).extra.length,1);
    assert.equal((await run([{...event,tipo:'faccao'}])).classificationDifferences.length,1);
    assert.equal((await run([{...event,posicoes:{1:{lat:1,lon:0},2:{lat:0,lon:0}}}])).suspectEvents,1);
    assert.equal((await run([{...event,distanciaMetros:1}])).suspectEvents,1);
    assert.equal((await run([event,event])).duplicates.length,1);
  } finally {await rm(root,{recursive:true,force:true});}
});
