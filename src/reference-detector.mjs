import { classify } from './classifier.mjs';
import { haversine, isEncounterDistance } from './haversine.mjs';
export function* detectGroup(group, metrics) {
  const ids = new Set();
  for (const row of group) {
    if (row.timestamp !== group[0].timestamp) throw new Error('Grupo contém timestamps diferentes');
    if (ids.has(row.idMonitorado)) throw new Error(`ID duplicado ${row.idMonitorado} em ${row.timestamp}`);
    ids.add(row.idMonitorado);
  }
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (metrics) metrics.pairs++;
      const [a, b] = group[i].idMonitorado < group[j].idMonitorado ? [group[i], group[j]] : [group[j], group[i]];
      const tipo = classify(a, b);
      if (!tipo) continue;
      if (metrics) metrics.haversine++;
      const distanciaMetros = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
      if (!isEncounterDistance(distanciaMetros)) continue;
      yield { tipo, monitoradosEncontro: [a.idMonitorado, b.idMonitorado], timestamp: a.timestamp,
        posicoes: { [a.idMonitorado]: { lat: a.latitude, lon: a.longitude }, [b.idMonitorado]: { lat: b.latitude, lon: b.longitude } }, distanciaMetros };
    }
  }
}
export async function* detectRecords(records) {
  let group = [];
  for await (const row of records) {
    if (group.length && row.timestamp < group[0].timestamp) throw new Error(`Desordem temporal: ${row.timestamp} após ${group[0].timestamp}; ordenação externa não implementada`);
    if (group.length && row.timestamp !== group[0].timestamp) { yield* detectGroup(group); group = []; }
    group.push(row);
  }
  yield* detectGroup(group);
}
