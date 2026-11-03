import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { haversine } from './haversine.mjs';
import { parseRecord } from './parser.mjs';

// Validates the writer's JSON-array format, one compact object per line.
// Retains only pair keys in the current timestamp, never the full event array.
export async function validateOutput(path) {
  const input=createReadStream(path,{encoding:'utf8'}), hash=createHash('sha256');
  input.on('data',chunk=>hash.update(chunk,'utf8'));
  const lines=createInterface({input,crlfDelay:Infinity});
  let inputError;input.on('error',e=>{inputError=e;lines.close();});
  let state='start', previousComma=false, events=0, timestamp, pairs=new Set();
  const byType={generico:0,faccao:0,protetiva:0};
  try {
    for await(const raw of lines) {
      const line=raw.trim();
      if(state==='start') {
        assert.ok(line==='['||line==='[]','Array opening');state=line==='[]'?'done':'events';continue;
      }
      assert.notEqual(state,'done','Trailing content');
      if(line===']') {assert.equal(previousComma,false,'Trailing comma');state='done';continue;}
      if(events) assert.equal(previousComma,true,'Missing comma');
      previousComma=line.endsWith(',');
      const e=JSON.parse(previousComma?line.slice(0,-1):line);
      assert.deepEqual(Object.keys(e).sort(),['tipo','monitoradosEncontro','timestamp','posicoes','distanciaMetros'].sort());
      assert.ok(Object.hasOwn(byType,e.tipo));assert.equal(e.monitoradosEncontro.length,2);
      const [a,b]=e.monitoradosEncontro;assert.ok(Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a<b);
      assert.deepEqual(Object.keys(e.posicoes).sort(),[String(a),String(b)].sort());
      for(const id of [a,b]) {
        const p=e.posicoes[id];assert.deepEqual(Object.keys(p).sort(),['lat','lon']);
        assert.equal(typeof p.lat,'number');assert.equal(typeof p.lon,'number');
        parseRecord(`${id};;${e.timestamp};${p.lat};${p.lon};false;`);
      }
      assert.ok(Number.isFinite(e.distanciaMetros)&&e.distanciaMetros>=0&&e.distanciaMetros<20);
      assert.equal(e.distanciaMetros,haversine(e.posicoes[a].lat,e.posicoes[a].lon,e.posicoes[b].lat,e.posicoes[b].lon));
      if(timestamp!==undefined) assert.ok(e.timestamp>=timestamp,'Output temporal order');
      if(e.timestamp!==timestamp) {pairs.clear();timestamp=e.timestamp;}
      const key=`${a}|${b}`;assert.ok(!pairs.has(key),'Duplicate pair/timestamp');pairs.add(key);
      events++;byType[e.tipo]++;
    }
    if(inputError) throw inputError;
    assert.equal(state,'done','Truncated JSON');
    return {events,byType,bytes:input.bytesRead,sha256:hash.digest('hex'),schemaValid:true,duplicatePairs:0,distanceRecomputationExact:true};
  } finally {lines.close();input.destroy();}
}
