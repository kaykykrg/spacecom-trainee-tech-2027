import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runReference } from './json-writer.mjs';
export function compareEvents(actual, expected) {
  const key = e => `${e.timestamp}|${[...e.monitoradosEncontro].sort((a,b)=>a-b).join('|')}`;
  const makeMap = events => {
    const map = new Map();
    for (const event of events) {
      assert.deepEqual(Object.keys(event).sort(), ['tipo','monitoradosEncontro','timestamp','posicoes','distanciaMetros'].sort());
      assert.equal(event.monitoradosEncontro.length, 2);
      assert.ok(event.monitoradosEncontro.every(Number.isSafeInteger));
      assert.notEqual(event.monitoradosEncontro[0], event.monitoradosEncontro[1]);
      assert.ok(Number.isFinite(event.distanciaMetros) && event.distanciaMetros >= 0 && event.distanciaMetros < 20);
      assert.ok(!map.has(key(event)), `Par/timestamp duplicado: ${key(event)}`);
      map.set(key(event), event);
    }
    return map;
  };
  const a = makeMap(actual), e = makeMap(expected);
  const missing = [...e.keys()].filter(k => !a.has(k));
  const extra = [...a.keys()].filter(k => !e.has(k));
  assert.deepEqual(missing, [], 'Encontros ausentes');
  assert.deepEqual(extra, [], 'Falsos positivos');
  let maxDistanceErrorMeters = 0;
  for (const [k, actualEvent] of a) {
    const expectedEvent = e.get(k);
    assert.equal(actualEvent.tipo, expectedEvent.tipo);
    assert.deepEqual(actualEvent.posicoes, expectedEvent.posicoes);
    const delta = Math.abs(actualEvent.distanciaMetros - expectedEvent.distanciaMetros);
    assert.ok(delta <= 1e-7, `Distância divergente em ${k}: ${delta}`);
    maxDistanceErrorMeters = Math.max(maxDistanceErrorMeters, delta);
  }
  return { actual: a.size, expected: e.size, missing: missing.length, extra: extra.length, maxDistanceErrorMeters, distanceToleranceMeters: 1e-7 };
}
export async function validateOfficial(root = fileURLToPath(new URL('../', import.meta.url))) {
  const results = [];
  for (const n of [1,2]) {
    const input = resolve(root, `data/dataset${n}.txt`);
    const oracle = resolve(root, `data/respostas${n}.json`);
    const output = resolve(root, `outputs/respostas${n}.json`);
    await runReference(input, output);
    const actualBytes = await readFile(output), expectedBytes = await readFile(oracle);
    const result = compareEvents(JSON.parse(actualBytes), JSON.parse(expectedBytes));
    assert.equal(result.actual, n === 1 ? 4 : 6);
    results.push({ dataset: n, input, oracle, output, oracleSha256: createHash('sha256').update(expectedBytes).digest('hex'), outputSha256: createHash('sha256').update(actualBytes).digest('hex'), ...result });
  }
  return { node: process.version, generatedAt: new Date().toISOString(), results };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await validateOfficial();
    await writeFile(new URL('../outputs/validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
