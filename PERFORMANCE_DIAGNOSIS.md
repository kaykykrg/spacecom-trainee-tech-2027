# Diagnóstico de performance — Gates 0 e 1

Medição em 03/11/2026. ZIP original preservado, SHA-256 `6f144e7140744527eeac88c7f10c7a86487a015f13d15ac610359829d63523bc`. Baseline extraído desse arquivo: 43 testes e validação dos sete outputs passaram. Nenhuma alteração em `src/`.

## A inversão histórica não foi reproduzida

Seis execuções por dataset, processos novos, após uma execução de aquecimento por dataset, ordem 6,7,7,6 repetida. Node oficial v24.22.2, Windows 10.0.26300, Intel Core Ultra 7 155H, 22 CPUs lógicas, 31,5 GiB de RAM; mesmo disco, entradas verificadas por SHA-256 antes das medições. Não houve outros benchmarks desta tarefa em paralelo. Cache, frequência, temperatura e outros aplicativos do computador não foram controlados.

- Dataset 6: média **15,779470 s**, mediana 16,025647 s, p95 16,502124 s, mínimo 14,755305 s, máximo 16,502124 s, desvio padrão populacional 0,608430 s. CPU média 15,737333 s; maior pico RSS 169,617 MiB.
- Dataset 7: média **24,028359 s**, mediana 24,458884 s, p95 24,896777 s, mínimo 22,432997 s, máximo 24,896777 s, desvio padrão populacional 0,899473 s. CPU média 23,458333 s; maior pico RSS 169,652 MiB.

Os 45,317 s históricos do dataset 6 caíram sem alteração de código. Isso **não é ganho de otimização**. A causa mais provável da inversão histórica é variação das condições de execução daquela rodada; não há telemetria antiga suficiente para distinguir frequência/energia, escalonamento, carga concorrente, antivírus ou I/O. Não se atribui causalidade específica a nenhuma dessas possibilidades. As novas medições não mostram patologia persistente do dataset 6.

CPU soma threads do processo; pode superar parede por GC/trabalho paralelo. Sua diferença para parede não mede isoladamente espera por disco. p95 nearest-rank com seis amostras coincide com o máximo e tem pouca resolução. Heap antes/depois e todas as amostras constam em `evidence/phase4-gate1.json`; resumo em `evidence/phase4-gate1-summary.json`.

## Onde o tempo é gasto

Perfis CPU, GC e estágios foram executados separadamente dos benchmarks. O perfil V8 do dataset 6 atribui aproximadamente 3,653 s de amostras à validação de timestamp, 3,614 s a parseRecord, 0,998 s a unquote, 0,922 s a coordinate, 0,808 s a detectGroup. São atribuições amostradas de frames, sujeitas a inlining, e não medições exatas de duração de funções. Perfis brutos e rankings: `perf/results/dataset*.cpuprofile` e `hotspots*.json`.

Diagnóstico por lotes de 10.000 linhas, sem relógio por registro:

- Dataset 6: parsing/validação 10,483 s; agrupamento/detecção e contadores 1,947 s; leitura/decodificação/readline/esperas 3,469 s. Passagem separada só de leitura/decodificação: 0,517 s. Escrita/sync/rename em passagem separada: 0,008 s.
- Dataset 7: parsing/validação 16,138 s; agrupamento/detecção e contadores 2,863 s; leitura/decodificação/readline/esperas 5,393 s. Só leitura/decodificação: 0,728 s. Escrita/sync/rename: 0,030 s.

A instrumentação por lotes modifica a distribuição de alocações e inclui manutenção dos contadores. Esses tempos não substituem o benchmark do pipeline original, nem podem ser subtraídos dele para uma decomposição exata. As passagens adicionais de leitura usam cache do SO e não representam disco frio.

GC observado: dataset 6, 800 eventos, duração somada 239,297 ms, maior 4,026 ms; dataset 7, 1.047 eventos, 388,707 ms, maior 54,887 ms. GC é um custo mensurável, mas não explica a anomalia histórica nem domina a rodada atual. Isso não contabiliza todo o custo de alocação de objetos.

## Características reais dos inputs

- Dataset 6: 8.000.000 registros, 80.000 janelas de 100, 480.000 vítimas (6%), 6.560.000 facções vazias (82%), 7.520.000 restrições vazias (94%), 480.000 IDs em restrições. 4.134 pares na faixa de latitude; 3.751 Haversines; 27 eventos.
- Dataset 7: 12.000.000 registros, 100.000 janelas de 120, 700.000 vítimas (5,833%), 9.600.000 facções vazias (80%), 11.300.000 restrições vazias (94,167%), 700.000 IDs em restrições. 6.843 pares na faixa; 6.229 Haversines; 35 eventos.

Esses contadores determinísticos são associados às execuções pelos hashes dos inputs/outputs, sem instrumentar cada linha do benchmark. A densidade de candidatos não torna o dataset 6 excepcionalmente caro. Não há evidência para trocar o sweep, mudar Haversine ou otimizar JSON.

## Decisão incremental

Priorizar o **experimento B**, cache de um único timestamp já validado por parser/stream: maior hotspot individual, 100/120 repetições por janela, alteração menor que reescrever o parser inteiro. A validação completa continua em toda mudança de texto; falhas não atualizam o cache. Parsing de IDs, booleanos, coordenadas, aspas e restrições permanece idêntico, assim como a rejeição de desordem na detecção.

Essa inversão da sequência A/B é deliberada e fundamentada no perfil. Reescrita por delimitadores (A), alteração de coleções (C), leitor incremental (D) e mudanças no detector (E) ficam condicionadas a necessidade e benefício adicionais; não serão combinadas sem evidência. Não compartilhar Sets mutáveis entre registros. Primeiro comparar B isolado e exigir equivalência integral e auditoria independente antes de recomendar qualquer pacote novo.

Os perfis V8 brutos e rankings citados acima permanecem na pasta de experimentos, fora do ZIP. As métricas GC, CPU, estágios e escrita estão incluídas em evidence/phase4-*.json.
