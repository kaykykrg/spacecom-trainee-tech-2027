import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
export const HEADER = 'idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida';
function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') || v.startsWith("'")) {
    if (v.at(-1) !== v[0] || v.length < 2) throw new Error('Aspas inválidas');
    return v.slice(1, -1);
  }
  if (/["']/.test(v)) throw new Error('Aspas inválidas');
  return v;
}
function integer(value) {
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`ID inteiro seguro inválido: ${value}`);
  return Number(value);
}
function coordinate(value, bound) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new Error('Coordenada inválida');
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > bound) throw new Error('Coordenada fora da faixa');
  return result;
}
function timestamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error('Timestamp inválido');
  const [, y, month, day, h, min, s] = m.map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || h > 23 || min > 59 || s > 59) throw new Error('Timestamp inválido');
  return value;
}
export function createParser() {
  let lastValidated;
  const cachedTimestamp = value => {
    if (value !== lastValidated) { timestamp(value); lastValidated = value; }
    return value;
  };
  return function parseRecord(line) {
  const fields = line.replace(/\r$/, '').split(';');
  if (fields.length !== 7) throw new Error(`Esperados 7 campos; encontrados ${fields.length}`);
  const [id, faction, time, lat, lon, protective, restrictions] = fields.map(unquote);
  if (protective !== 'true' && protective !== 'false') throw new Error('medidaProtetiva deve ser true ou false');
  const ids = restrictions === '' ? [] : restrictions.split(',').map(v => integer(v.trim()));
  if (new Set(ids).size !== ids.length) throw new Error('ID repetido em idsRestricaoMedida');
  return { idMonitorado: integer(id), faccaoMonitorado: faction, timestamp: cachedTimestamp(time), latitude: coordinate(lat, 90), longitude: coordinate(lon, 180), medidaProtetiva: protective === 'true', idsRestricaoMedida: new Set(ids) };
}
}
export const parseRecord = createParser();
export async function* readRecords(path, metrics) {
  const parseRecord = createParser();
  const input = createReadStream(path, { encoding: 'utf8' });
  const hash = metrics ? createHash('sha256') : undefined;
  if (hash) input.on('data', chunk => hash.update(chunk, 'utf8'));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let inputError;
  input.on('error', error => { inputError = error; lines.close(); });
  let lineNumber = 0;
  try {
    for await (const raw of lines) {
      lineNumber++;
      const line = lineNumber === 1 ? raw.replace(/^\uFEFF/, '') : raw;
      if (lineNumber === 1) {
        if (line !== HEADER) throw new Error('Cabeçalho inválido');
        continue;
      }
      try {
        const started = metrics ? performance.now() : 0;
        const record = parseRecord(line);
        if (metrics) { metrics.parsingMs += performance.now() - started; metrics.records++; }
        yield record;
      }
      catch (error) { throw new Error(`${path}:${lineNumber}: ${error.message}`, { cause: error }); }
    }
    if (inputError) throw inputError;
    if (!lineNumber) throw new Error('Arquivo vazio: cabeçalho ausente');
  } finally { if (metrics) { metrics.bytesRead = input.bytesRead; metrics.inputSha256 = hash.digest('hex'); } lines.close(); input.destroy(); }
}
