import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecords } from './parser.mjs';

async function sha256File(path) {
  const hash = createHash('sha256');
  let bytesRead = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytesRead += chunk.length; }
  return { sha256: hash.digest('hex'), bytesRead };
}

export async function verifyDataset(path, dataset) {
  const before = await stat(path);
  const hash = await sha256File(path);
  const started = performance.now();
  let records = 0, timestampRuns = 0, maxContiguousGroup = 0;
  let currentTimestamp, previousTimestamp, currentGroupSize = 0;
  let descendingTransitions = 0, duplicateIdsWithinContiguousGroup = 0;
  let minTimestamp, maxTimestamp;
  const currentIds = new Set();
  // Sets retain only timestamp keys, never complete records or all positions.
  const timestamps = new Set();
  for await (const row of readRecords(path)) {
    records++;
    timestamps.add(row.timestamp);
    if (minTimestamp === undefined || row.timestamp < minTimestamp) minTimestamp = row.timestamp;
    if (maxTimestamp === undefined || row.timestamp > maxTimestamp) maxTimestamp = row.timestamp;
    if (previousTimestamp !== undefined && row.timestamp < previousTimestamp) descendingTransitions++;
    previousTimestamp = row.timestamp;
    if (row.timestamp !== currentTimestamp) {
      timestampRuns++;
      currentTimestamp = row.timestamp;
      currentIds.clear();
      currentGroupSize = 0;
    }
    if (currentIds.has(row.idMonitorado)) duplicateIdsWithinContiguousGroup++;
    currentIds.add(row.idMonitorado);
    currentGroupSize++;
    maxContiguousGroup = Math.max(maxContiguousGroup, currentGroupSize);
  }
  const after = await stat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || hash.bytesRead !== after.size) throw new Error(`Arquivo mudou durante verificação: ${path}`);
  const nondecreasing = descendingTransitions === 0;
  return { dataset, path, sizeBytes: after.size, ...hash, records, distinctTimestamps: timestamps.size,
    timestampRuns, minTimestamp, maxTimestamp, nondecreasing, descendingTransitions,
    maxContiguousGroup, duplicateIdsWithinContiguousGroup,
    maxSimultaneousPositions: nondecreasing ? maxContiguousGroup : null,
    duplicateIdsPerTimestamp: nondecreasing ? duplicateIdsWithinContiguousGroup : null,
    globalGroupMetricsVerified: nondecreasing,
    parserErrors: 0, parseDurationMilliseconds: performance.now() - started };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    const results = [];
    for (let n = 1; n <= 7; n++) {
      const result = await verifyDataset(resolve(root, `data/dataset${n}.txt`), n);
      results.push(result);
      console.error(`dataset${n}: ${result.records} registros; ${result.distinctTimestamps} timestamps; monotônico=${result.nondecreasing}`);
    }
    const report = { generatedAt: new Date().toISOString(), node: process.version, method: 'Independent production parser full streaming pass, plus separate streaming SHA-256 pass; no encounter detection', results };
    await writeFile(resolve(root, 'outputs/parser-crosscheck.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('outputs/parser-crosscheck.json');
  } catch (error) { console.error(error); process.exitCode = 1; }
}
