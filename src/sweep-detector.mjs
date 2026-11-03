import { classify } from './classifier.mjs';
import { haversine, isEncounterDistance, EARTH_RADIUS_METERS } from './haversine.mjs';

export const MAX_DELTA_LATITUDE = 20 / EARTH_RADIUS_METERS * 180 / Math.PI;
// ~0.1 micrometre: conservative allowance for degree/radian floating-point
// arithmetic. This only admits extra candidates; the final distance stays <20.
export const LATITUDE_MARGIN = 1e-12;

export function* detectGroup(group, metrics) {
  const ids = new Set();
  for (const row of group) {
    if (row.timestamp !== group[0].timestamp) throw new Error('Grupo contém timestamps diferentes');
    if (ids.has(row.idMonitorado)) throw new Error(`ID duplicado ${row.idMonitorado} em ${row.timestamp}`);
    ids.add(row.idMonitorado);
  }
  // Do not mutate the input: the reference and differential tests reuse it.
  const sorted = [...group].sort((a,b) => a.latitude - b.latitude || a.idMonitorado - b.idMonitorado);
  for (let i=0; i<sorted.length; i++) {
    for (let j=i+1; j<sorted.length; j++) {
      if (metrics) metrics.latitudeChecks = (metrics.latitudeChecks ?? 0) + 1;
      if (sorted[j].latitude - sorted[i].latitude > MAX_DELTA_LATITUDE + LATITUDE_MARGIN) break;
      if (metrics) metrics.pairs++;
      const first = sorted[i], second = sorted[j];
      const a = first.idMonitorado < second.idMonitorado ? first : second;
      const b = a === first ? second : first;
      const tipo = classify(a,b);
      if (!tipo) continue;
      if (metrics) metrics.haversine++;
      // Exactly the same operand order/formula as the reference; no rounding.
      const distanciaMetros = haversine(a.latitude,a.longitude,b.latitude,b.longitude);
      if (!isEncounterDistance(distanciaMetros)) continue;
      yield { tipo, monitoradosEncontro:[a.idMonitorado,b.idMonitorado], timestamp:a.timestamp,
        posicoes:{[a.idMonitorado]:{lat:a.latitude,lon:a.longitude},[b.idMonitorado]:{lat:b.latitude,lon:b.longitude}}, distanciaMetros };
    }
  }
}

export async function* detectRecords(records, metrics) {
  let group=[];
  function* flush() {
    if (!group.length) return;
    if (metrics) { metrics.groups++; metrics.maxGroup=Math.max(metrics.maxGroup,group.length); }
    const iterator=detectGroup(group,metrics);
    while(true) {
      const started=metrics ? performance.now() : 0;
      const result=iterator.next();
      if(metrics) metrics.detectionMs+=performance.now()-started;
      if(result.done) break;
      yield result.value;
    }
  }
  for await (const row of records) {
    if(group.length && row.timestamp<group[0].timestamp) throw new Error(`Desordem temporal: ${row.timestamp} após ${group[0].timestamp}; ordenação externa não implementada`);
    if(group.length && row.timestamp!==group[0].timestamp) { yield* flush(); group=[]; }
    group.push(row);
  }
  yield* flush();
}
