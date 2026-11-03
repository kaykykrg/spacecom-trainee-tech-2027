# Comparação A/B — Fase 4

Node oficial v24.22.2, Intel(R) Core(TM) Ultra 7 155H, Windows 10.0.26300. Uma execução de aquecimento por dataset/variante, excluída; seis execuções contabilizadas por variante/dataset, processos novos, ordem ABBA repetida três vezes, sequencial. Nenhum profiling por registro. Cache do SO não limpo; aplicativos externos, frequência e temperatura não controlados. Mesmo input e disco por par. Tempo inclui leitura, parsing, detecção, escrita, sync e rename; exclui carregamento inicial do módulo, processo e hash posterior. Mesma instrumentação de parede/CPU/heap/RSS para A e B. Todos os 98 outputs (84 contabilizados + 14 aquecimentos) coincidiram com SHA-256 aprovado.

A = fonte aprovada sem alteração. B = cache de validação de um timestamp por parser/stream; demais regras e código idênticos. O JIT de cada processo começa novo; o aquecimento prévio afeta principalmente caches externos. Medições completas: evidence/phase4-ab-final.json. p95 nearest-rank, baixa resolução com seis amostras.

- **Dataset 1:** histórico 0.052 s; A atual 0.028 s → B 0.025 s; redução A/B **11.69%**. Medianas 0.027 / 0.025 s; p95 0.032 / 0.026 s; desvios 0.002 / 0.001 s; pico RSS 49.160 / 49.230 MiB.

- **Dataset 2:** histórico 0.141 s; A atual 0.076 s → B 0.061 s; redução A/B **19.80%**. Medianas 0.077 / 0.061 s; p95 0.080 / 0.065 s; desvios 0.002 / 0.002 s; pico RSS 58.516 / 57.496 MiB.

- **Dataset 3:** histórico 0.454 s; A atual 0.241 s → B 0.189 s; redução A/B **21.57%**. Medianas 0.233 / 0.187 s; p95 0.263 / 0.195 s; desvios 0.014 / 0.004 s; pico RSS 67.285 / 68.902 MiB.

- **Dataset 4:** histórico 1.503 s; A atual 0.985 s → B 0.753 s; redução A/B **23.50%**. Medianas 0.964 / 0.739 s; p95 1.108 / 0.843 s; desvios 0.068 / 0.061 s; pico RSS 84.137 / 81.945 MiB.

- **Dataset 5:** histórico 4.337 s; A atual 2.216 s → B 1.693 s; redução A/B **23.62%**. Medianas 2.206 / 1.702 s; p95 2.285 / 1.878 s; desvios 0.047 / 0.100 s; pico RSS 114.176 / 85.063 MiB.

- **Dataset 6:** histórico 45.317 s; A atual 17.305 s → B 13.424 s; redução A/B **22.43%**. Medianas 17.202 / 13.158 s; p95 18.111 / 14.847 s; desvios 0.379 / 0.641 s; pico RSS 169.738 / 164.309 MiB.

- **Dataset 7:** histórico 25.386 s; A atual 25.689 s → B 19.315 s; redução A/B **24.81%**. Medianas 25.561 / 19.363 s; p95 26.357 / 19.944 s; desvios 0.379 / 0.393 s; pico RSS 168.914 / 166.559 MiB.

**Soma das médias A: 46.539 s. B: 35.459 s. Redução controlada: 23.81%.** Soma histórica: 77,191 s, em condições distintas. A diferença entre o histórico e A atual não é atribuída à otimização. Não se promete desempenho idêntico em outro computador ou outra condição térmica/energética.

Diagnóstico e decisão de escopo em PERFORMANCE_DIAGNOSIS.md. A validação de correção e a recomendação final dependem de concluir a auditoria e reprodução do pacote, documentadas em PERFORMANCE_EQUIVALENCE.md. Os experimentos A/C/D/E não foram adotados: o cache elimina o hotspot de calendário repetido com alteração pequena; o resultado não justifica ampliar a superfície de risco da entrega.

Reprodução no pacote: `npm run benchmark:ab`. O baseline está incluído como fixture; consulte README.md. Resumo estatístico: evidence/phase4-ab-summary.json. Perfis brutos e scripts experimentais completos permanecem no workspace de desenvolvimento.
