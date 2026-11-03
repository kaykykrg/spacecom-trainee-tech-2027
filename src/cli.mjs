import { runReference } from './json-writer.mjs';
import { runOptimized } from './optimized-runner.mjs';
const [, , input, output, mode, ...extra] = process.argv;
if (!input || !output || extra.length || (mode && mode!=='--reference')) {
  console.error('Uso: node src/cli.mjs <dataset.txt> <saida.json> [--reference]'); process.exitCode = 1;
} else {
  try { console.error(JSON.stringify(await (mode==='--reference'?runReference:runOptimized)(input, output))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
