import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HEADER, parseRecord, readRecords } from '../src/parser.mjs';
import { classify } from '../src/classifier.mjs';
import { haversine, isEncounterDistance, EARTH_RADIUS_METERS } from '../src/haversine.mjs';
import { detectGroup, detectRecords } from '../src/reference-detector.mjs';
import { runReference } from '../src/json-writer.mjs';
import { compareEvents, validateOfficial } from '../src/validate-official.mjs';
const row = (id, overrides = {}) => ({ idMonitorado: id, faccaoMonitorado: '', timestamp: '2024-01-01 00:00:00', latitude: 0, longitude: 0, medidaProtetiva: false, idsRestricaoMedida: new Set(), ...overrides });
const line = '1;;"2024-01-01 00:00:00";0;0;false;';
const collect = async stream => { const values = []; for await (const value of stream) values.push(value); return values; };
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'spacecom-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('parser: sete campos, aspas, restrições e ID maior que Int32', () => {
  const p = parseRecord('3000000000;"A";"2024-02-29 23:59:59";-90;180;true;"2, 3"');
  assert.equal(p.idMonitorado, 3000000000); assert.equal(p.faccaoMonitorado, 'A');
  assert.deepEqual([...p.idsRestricaoMedida], [2,3]);
  assert.equal(parseRecord(line).medidaProtetiva, false);
});
for (const [label, bad] of Object.entries({ fields: '1;2', id: line.replace('1;', '9007199254740992;'), fractional: line.replace('1;', '1.5;'), emptyCoordinate: line.replace(';0;0;', ';;0;'), nan: line.replace(';0;0;', ';NaN;0;'), range: line.replace(';0;0;', ';91;0;'), bool: line.replace('false', 'False'), date: line.replace('2024-01-01', '2023-02-29'), timezone: line.replace('00:00:00', '00:00:00Z'), quote: line.replace('";', ';'), restriction: line.replace('false;', 'true;2,x'), duplicateRestriction: line.replace('false;', 'true;2,2') })) {
  test(`parser rejeita ${label}`, () => assert.throws(() => parseRecord(bad)));
}
test('stream aceita BOM, CRLF, LF, última linha sem newline', async () => fixture(async dir => {
  const path = join(dir, 'input');
  await writeFile(path, '\uFEFF' + HEADER + '\r\n' + line + '\n' + line.replace('1;', '2;'));
  assert.equal((await collect(readRecords(path))).length, 2);
}));
test('stream rejeita arquivo ausente, vazio, cabeçalho e linha vazia', async () => fixture(async dir => {
  const path = join(dir, 'input');
  await assert.rejects(collect(readRecords(path)));
  for (const text of ['', 'wrong\n', HEADER + '\n\n']) { await writeFile(path, text); await assert.rejects(collect(readRecords(path))); }
}));
test('Haversine: zero, centímetros, 19.99, 20, 20.01 m e antípodas', () => {
  for (const d of [0, 0.01, 19.99, 20, 20.01]) {
    const calculated = haversine(0, 0, d / EARTH_RADIUS_METERS * 180 / Math.PI, 0);
    assert.ok(Math.abs(calculated - d) < 1e-12);
    if (d !== 20) assert.equal(isEncounterDistance(calculated), d < 20);
  }
  assert.equal(isEncounterDistance(20), false);
  assert.equal(isEncounterDistance(20 - 1e-12), true);
  assert.equal(isEncounterDistance(20 + 1e-12), false);
  assert.equal(haversine(0,0,0,180), Math.PI * EARTH_RADIUS_METERS);
});
test('Haversine alta latitude e antimeridiano', () => {
  assert.ok(haversine(89.999, 0, 89.999, 1) < 20);
  assert.ok(haversine(0, 179.99999, 0, -179.99999) < 20);
  assert.equal(haversine(10, 20, 11, 21), haversine(11,21,10,20));
});
test('classificação exclusiva, facção vazia, vítimas e restrições', () => {
  assert.equal(classify(row(1), row(2)), 'generico');
  assert.equal(classify(row(1,{faccaoMonitorado:'A'}), row(2,{faccaoMonitorado:'B'})), 'generico');
  assert.equal(classify(row(1,{faccaoMonitorado:'A'}), row(2,{faccaoMonitorado:'A'})), 'faccao');
  const victim = row(1,{medidaProtetiva:true, idsRestricaoMedida:new Set([2,3]), faccaoMonitorado:'A'});
  assert.equal(classify(victim, row(2,{faccaoMonitorado:'A'})), 'protetiva');
  assert.equal(classify(row(3), victim), 'protetiva');
  assert.equal(classify(victim, row(4)), null);
  assert.equal(classify(victim, row(2,{medidaProtetiva:true})), null);
  assert.equal(classify(row(1),row(1)), null);
});
test('pares únicos, IDs canônicos, invariância à permutação e limite estrito', () => {
  const rows = [row(3),row(1),row(2)];
  const result = [...detectGroup(rows)];
  assert.equal(result.length, 3);
  for (const e of result) assert.ok(e.monitoradosEncontro[0] < e.monitoradosEncontro[1]);
  compareEvents([...detectGroup([...rows].reverse())], result);
  assert.equal(haversine(0,0,20 / EARTH_RADIUS_METERS * 180 / Math.PI,0),20);
  for (const d of [0.01,19.99,20,20.01,100]) assert.equal([...detectGroup([row(1),row(2,{latitude:d / EARTH_RADIUS_METERS * 180 / Math.PI})])].length, d < 20 ? 1 : 0);
});
test('grupo rejeita IDs repetidos idênticos/conflitantes e timestamps diferentes', () => {
  for (const second of [row(1), row(1,{latitude:1}), row(2,{timestamp:'2024-01-01 00:00:01'})]) assert.throws(() => [...detectGroup([row(1), second])]);
});
test('timestamp exato, mesmo par em outro instante e desordem', async () => {
  assert.equal((await collect(detectRecords([row(1),row(2,{timestamp:'2024-01-01 00:00:01'})]))).length,0);
  assert.equal((await collect(detectRecords([row(1),row(2),row(1,{timestamp:'2024-01-01 00:00:05'}),row(2,{timestamp:'2024-01-01 00:00:05'})]))).length,2);
  await assert.rejects(collect(detectRecords([row(1,{timestamp:'2024-01-01 00:00:05'}),row(2)])), /Desordem temporal/);
});
test('JSON vazio válido e falha preserva saída anterior e limpa temporário', async () => fixture(async dir => {
  const input = join(dir, 'input'), output = join(dir, 'output');
  await writeFile(input, HEADER + '\n'); await runReference(input, output);
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')), []);
  await writeFile(output, 'existing');
  await writeFile(input, HEADER + '\n' + line + '\n' + line.replace('1;', '2;') + '\n' + line.replace('2024-', '2023-'));
  await assert.rejects(runReference(input,output), /Desordem/);
  assert.equal(await readFile(output,'utf8'), 'existing');
  assert.deepEqual((await readdir(dir)).sort(), ['input','output']);
  const later = line.replace('00:00:00', '00:00:05');
  for (const duplicate of [later, later.replace(';0;0;', ';1;0;')]) {
    await writeFile(input, HEADER + '\n' + line + '\n' + line.replace('1;', '2;') + '\n' + later + '\n' + duplicate);
    await assert.rejects(runReference(input,output), /ID duplicado/);
    assert.equal(await readFile(output,'utf8'), 'existing');
    assert.deepEqual((await readdir(dir)).sort(), ['input','output']);
  }
  await assert.rejects(runReference(input,input));
}));
test('comparador detecta extra, ausente, duplicata, tipo, coordenadas e distância', () => {
  const events = [...detectGroup([row(1),row(2)])];
  for (const bad of [[], [...events,...events], [{...events[0],tipo:'faccao'}], [{...events[0],posicoes:{}}], [{...events[0],distanciaMetros:1}]]) assert.throws(() => compareEvents(bad, events));
  assert.throws(() => compareEvents(events, []));
});
test('regressão integral dos dois oráculos oficiais: exatamente 4 e 6', async () => {
  const report = await validateOfficial();
  assert.deepEqual(report.results.map(r=>r.actual), [4,6]);
});
