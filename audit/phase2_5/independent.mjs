// Deliberately independent: no imports from src/, no spatial filtering/index.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { open,readFile,writeFile,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const RADIUS=6371000;
export function distance(p,q) {
  const phi=p.lat*Math.PI/180, psi=q.lat*Math.PI/180;
  const halfLat=(q.lat-p.lat)*Math.PI/360;
  const halfLon=(q.lon-p.lon)*Math.PI/360;
  const h=Math.sin(halfLat)*Math.sin(halfLat)+Math.cos(phi)*Math.cos(psi)*Math.sin(halfLon)*Math.sin(halfLon);
  return RADIUS*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function category(p,q) {
  if(p.id===q.id)return null;
  if(p.victim&&q.victim)return null;
  if(p.victim)return p.restrictions.includes(q.id)?'protetiva':null;
  if(q.victim)return q.restrictions.includes(p.id)?'protetiva':null;
  if(p.faction.length>0 && p.faction===q.faction)return 'faccao';
  return 'generico';
}
function field(s) {
  s=s.trim();
  if(s[0]==='"'||s[0]==="'") {if(s.at(-1)!==s[0]||s.length<2)throw Error('Unbalanced quotes');s=s.slice(1,-1);}
  if(/["']/.test(s))throw Error('Embedded quotes');return s;
}
function id(s) {if(!/^-?\d+$/.test(s)||!Number.isSafeInteger(Number(s)))throw Error('Invalid ID');return Number(s);}
export function parse(line,lineNumber=0) {
  const columns=line.split(';');if(columns.length!==7)throw Error('Expected seven fields');
  const [i,f,t,a,b,v,restriction]=columns.map(field);
  if(!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(t))throw Error('Timestamp format');
  const date=new Date(t.replace(' ','T')+'Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19).replace('T',' ')!==t)throw Error('Invalid calendar');
  if(!a||!b||!Number.isFinite(Number(a))||!Number.isFinite(Number(b))||Math.abs(Number(a))>90||Math.abs(Number(b))>180)throw Error('Invalid coordinates');
  if(v!=='true'&&v!=='false')throw Error('Invalid boolean');
  const restrictions=restriction?restriction.split(',').map(s=>id(s.trim())):[];
  if(new Set(restrictions).size!==restrictions.length)throw Error('Duplicate restriction');
  return {id:id(i),faction:f,ts:t,lat:Number(a),lon:Number(b),victim:v==='true',restrictions,lineNumber,raw:line};
}
export async function* windows(path,stats={}) {
  const stream=createReadStream(path),hash=createHash('sha256');
  stream.on('data',chunk=>hash.update(chunk));
  const rl=createInterface({input:stream,crlfDelay:Infinity});
  let error;stream.on('error',e=>{error=e;rl.close();});
  let group=[],previous,lineNumber=0,ids=new Set();
  try {
    for await(let line of rl) {
      lineNumber++;
      if(lineNumber===1) {line=line.replace(/^\uFEFF/,'');if(line!=='idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida')throw Error('Header');continue;}
      const p=parse(line,lineNumber);
      if(previous && p.ts<previous)throw Error(`Timestamp order at line ${lineNumber}`);
      if(previous && p.ts!==previous) {yield group;group=[];ids.clear();}
      if(ids.has(p.id))throw Error(`Duplicate/conflicting ID at line ${lineNumber}`);
      ids.add(p.id);group.push(p);previous=p.ts;
      stats.records=(stats.records??0)+1;
    }
    if(error)throw error;if(!lineNumber)throw Error('Empty input');
    if(group.length)yield group;
    stats.bytes=stream.bytesRead;stats.sha256=hash.digest('hex');
  } finally {rl.close();stream.destroy();}
}
const pairKey=(t,a,b)=>`${t}|${Math.min(a,b)}|${Math.max(a,b)}`;
export const key=e=>pairKey(e.timestamp,...e.monitoradosEncontro)+'|'+e.tipo;
export function* exhaustive(group,stats={}) {
  const seen=new Set();
  for(const r of group){if(seen.has(r.id)||r.ts!==group[0].ts)throw Error('Invalid group');seen.add(r.id);}
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++) {
    stats.pairs=(stats.pairs??0)+1;
    const p=group[i].id<group[j].id?group[i]:group[j],q=p===group[i]?group[j]:group[i];
    const d=distance(p,q);stats.distanceCalculations=(stats.distanceCalculations??0)+1;
    const margin=Math.abs(d-20);
    if(stats.nearestBoundary===undefined||margin<stats.nearestBoundary.marginMeters)stats.nearestBoundary={marginMeters:margin,distanceMeters:d,timestamp:p.ts,ids:[p.id,q.id]};
    if(d>=20)continue;
    const tipo=category(p,q);
    if(!tipo){stats.excludedClosePairs=(stats.excludedClosePairs??0)+1;continue;}
    yield {tipo,monitoradosEncontro:[p.id,q.id],timestamp:p.ts,posicoes:{[p.id]:{lat:p.lat,lon:p.lon},[q.id]:{lat:q.lat,lon:q.lon}},distanciaMetros:d};
  }
}
export async function audit(dataset,root=resolve('.'),inspectionPath=resolve(root,'outputs/inspection-results.json')) {
  const prefix=resolve(root,'audit/phase2_5'),input=resolve(root,`data/dataset${dataset}.txt`),output=resolve(root,`outputs/respostas${dataset}.json`);
  if((await stat(output)).size>10*1024*1024)throw Error('Audit output cap exceeded');
  const outputBytes=await readFile(output),actual=JSON.parse(outputBytes);
  const actualByTimestamp=new Map(),actualKeys=new Map(),actualPairs=new Map(),duplicates=[];
  for(const e of actual){
    const k=key(e),pair=pairKey(e.timestamp,...e.monitoradosEncontro);
    if(actualPairs.has(pair))duplicates.push(pair);
    actualKeys.set(k,e);actualPairs.set(pair,e);
    if(!actualByTimestamp.has(e.timestamp))actualByTimestamp.set(e.timestamp,[]);actualByTimestamp.get(e.timestamp).push(e);
  }
  const report={dataset,input,output,outputSha256:createHash('sha256').update(outputBytes).digest('hex'),actualEvents:actual.length,expectedEvents:0,windows:0,records:0,pairs:0,distanceCalculations:0,excludedClosePairs:0,duplicates,missing:[],extra:[],classificationDifferences:[],eventAudits:[],coordinateDifferences:[],maxDistanceDifferenceMeters:0,byType:{generico:0,faccao:0,protetiva:0}};
  const matched=new Set();let lastProgress=performance.now();const started=lastProgress;
  const expectedFile=await open(resolve(prefix,`expected${dataset}.jsonl`),'w');
  try {
    for await(const group of windows(input,report)) {
      report.windows++;const ts=group[0].ts;
      for(const e of actualByTimestamp.get(ts)??[]) {
        const [a,b]=e.monitoradosEncontro,p=group.find(r=>r.id===a),q=group.find(r=>r.id===b),issues=[];
        if(!p||!q)issues.push('Position not found in source');
        let independentDistance,independentType;
        if(p&&q) {
          independentDistance=distance(p,q);independentType=category(p,q);
          if(!(independentDistance<20)||a===b)issues.push('Not a distinct pair strictly below 20m');
          if(independentType!==e.tipo)issues.push('Classification mismatch');
          for(const r of [p,q])if(e.posicoes?.[r.id]?.lat!==r.lat||e.posicoes?.[r.id]?.lon!==r.lon)issues.push(`Source coordinate mismatch ${r.id}`);
          const delta=Math.abs(independentDistance-e.distanciaMetros);report.maxDistanceDifferenceMeters=Math.max(report.maxDistanceDifferenceMeters,delta);
          if(!Number.isFinite(delta)||delta>1e-7)issues.push('Numerical distance mismatch');
        }
        report.eventAudits.push({key:key(e),approved:issues.length===0,issues,independentDistance,independentType,sourcePositions:[p,q]});
      }
      actualByTimestamp.delete(ts);
      for(const e of exhaustive(group,report)) {
        await expectedFile.writeFile(JSON.stringify({key:key(e),...e})+'\n');report.expectedEvents++;report.byType[e.tipo]++;
        const k=key(e),existing=actualKeys.get(k),other=actualPairs.get(pairKey(e.timestamp,...e.monitoradosEncontro));
        if(!existing){report.missing.push(k);if(other)report.classificationDifferences.push({expected:k,actual:key(other)});}
        else {
          matched.add(k);
          for(const id of e.monitoradosEncontro)if(e.posicoes[id].lat!==existing.posicoes?.[id]?.lat||e.posicoes[id].lon!==existing.posicoes?.[id]?.lon)report.coordinateDifferences.push(k);
        }
      }
      if(performance.now()-lastProgress>10000){console.error(`audit${dataset}: ${report.windows} windows, ${report.pairs} exhaustive pairs`);lastProgress=performance.now();}
    }
  } finally {await expectedFile.close();}
  for(const [ts,events] of actualByTimestamp)for(const e of events)report.eventAudits.push({key:key(e),approved:false,issues:[`Timestamp ${ts} missing from source`]});
  report.extra=[...actualKeys.keys()].filter(k=>!matched.has(k));
  report.approvedEvents=report.eventAudits.filter(e=>e.approved).length;report.suspectEvents=report.eventAudits.length-report.approvedEvents;
  report.elapsedSeconds=(performance.now()-started)/1000;report.peakRssKiB=process.resourceUsage().maxRSS;
  const inspected=JSON.parse(await readFile(inspectionPath,'utf8'))[dataset-1];
  report.complete=report.records===inspected.records&&report.windows===inspected.distinct_timestamps&&report.pairs===inspected.brute_force_pair_candidates&&report.sha256===inspected.sha256&&report.bytes===inspected.bytes_read;
  report.pass=report.complete&&!report.missing.length&&!report.extra.length&&!report.duplicates.length&&!report.classificationDifferences.length&&!report.coordinateDifferences.length&&!report.suspectEvents;
  await writeFile(resolve(prefix,`dataset${dataset}.json`),JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  for(const n of process.argv.slice(2).map(Number)) {
    const r=await audit(n);console.log(JSON.stringify({dataset:n,pass:r.pass,complete:r.complete,events:r.expectedEvents,pairs:r.pairs,seconds:r.elapsedSeconds}));
    if(!r.pass)process.exitCode=1;
  }
}
