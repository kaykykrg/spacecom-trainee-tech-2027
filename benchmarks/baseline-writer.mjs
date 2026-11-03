import { open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readRecords } from '../tests/baseline-parser.mjs';
import { detectRecords } from '../src/reference-detector.mjs';
// Await every write: at most one event's serialized JSON is pending.
export async function runReference(inputPath, outputPath) {
  return runDetector(inputPath, outputPath, detectRecords);
}
export async function runDetector(inputPath, outputPath, detector, metrics) {
  if (resolve(inputPath) === resolve(outputPath)) throw new Error('Entrada e saída devem ser diferentes');
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  let handle;
  let count = 0;
  try {
    handle = await open(temporary, 'wx');
    await handle.writeFile('[');
    for await (const event of detector(readRecords(inputPath, metrics), metrics)) {
      const started = metrics ? performance.now() : 0;
      await handle.writeFile(`${count ? ',' : ''}\n${JSON.stringify(event)}`);
      if(metrics) { metrics.writingMs += performance.now() - started; metrics.byType[event.tipo]++; }
      count++;
    }
    await handle.writeFile(count ? '\n]\n' : ']\n');
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, outputPath);
    return { events: count };
  } catch (error) {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
}
