export function classify(a, b) {
  if (a.idMonitorado === b.idMonitorado) return null;
  if (a.medidaProtetiva !== b.medidaProtetiva) {
    const [victim, other] = a.medidaProtetiva ? [a, b] : [b, a];
    return victim.idsRestricaoMedida.has(other.idMonitorado) ? 'protetiva' : null;
  }
  if (a.medidaProtetiva) return null;
  return a.faccaoMonitorado !== '' && a.faccaoMonitorado === b.faccaoMonitorado ? 'faccao' : 'generico';
}
