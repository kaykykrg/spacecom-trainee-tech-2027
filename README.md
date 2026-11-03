# Spacecom — detecção de encontros

Solução em JavaScript para o desafio Trainee Tech Spacecom 2027. Processa localizações em streaming e produz um array JSON por dataset, preservando timestamps, coordenadas e precisão numérica. Os sete resultados estão em `outputs/respostas1.json` até `outputs/respostas7.json`.

O texto fornecido pela empresa está transcrito em [ENUNCIADO_ORIGINAL.md](ENUNCIADO_ORIGINAL.md). [REQUIREMENTS.md](REQUIREMENTS.md) separa exigências expressas, evidências dos oráculos e decisões da implementação. Todos os dados do desafio são fictícios.

## Ambiente e início rápido

Instale **Node.js 24 LTS, versão 24.22.2 ou posterior da linha 24**, com npm, pela [distribuição oficial](https://nodejs.org/en/download). A entrega foi testada com o binário oficial Node v24.22.2 e npm 11.19.1 no Windows x64. Não depende de editor, Python, módulos globais ou serviços. Não há dependências de terceiros: não é necessário `npm install`.

Extraia o ZIP e abra um terminal **na pasta que contém package.json**:

```sh
node --version
npm --version
npm test
npm run validate
```

Os 45 testes executam offline. Os pequenos datasets 1 e 2, seus oráculos e amostras necessárias aos testes estão incluídos. O validador confere os sete outputs com hashes aprovados, esquema exato e conjunto independente de encontros.

## Executar um dataset

```sh
node src/cli.mjs data/dataset1.txt resultado1.json
node src/cli.mjs data/dataset1.txt referencia1.json --reference
```

O padrão é sweep por latitude; `--reference` seleciona a referência exaustiva O(n²). O diretório de destino deve existir. Um arquivo final existente só é substituído após sucesso. Mensagens e métricas vão para stderr, sem contaminar o JSON. Erros retornam status diferente de zero.

## Reproduzir os sete resultados

Os datasets 3–7 somam mais de 1 GB e não estão no ZIP. Baixe-os das URLs oficiais com verificação de tamanho e SHA-256:

```sh
npm run download
npm run reproduce
```

O download requer HTTPS ao bucket da Spacecom e grava temporários antes da verificação e rename. `npm run download -- --all` baixa também 1 e 2. URLs e hashes estão em `evidence/inputs.json`.

Se já possuir os arquivos, coloque `dataset1.txt` até `dataset7.txt` em `data/`, ou aponte outra pasta:

```sh
npm run reproduce -- caminho-dos-inputs resultados-regenerados
```

A reprodução lê todos os arquivos, grava em `generated/` por padrão, confere os sete hashes e localiza novamente as posições dos encontros nos inputs. Recalcula distância e classificação com implementação independente. Os outputs aprovados em `outputs/` são preservados. Evidências novas ficam em `validation/`.

## Regras e formato

- IDs distintos, **timestamp exatamente igual** e **distância estritamente menor que 20 m**. O intervalo de 5 segundos descrito no enunciado não autoriza comparar timestamps vizinhos.
- Um evento por par não ordenado e timestamp. O mesmo par pode gerar outro evento em outro instante. IDs são emitidos em ordem crescente; essa ordem não é exigida pelo desafio.
- Protetiva: exatamente uma vítima cuja lista de restrições contém o ID da outra pessoa. Entre dois não vítimas, facção igual e não vazia gera `faccao`; demais pares geram `generico`.
- Vítima sem vínculo e duas vítimas não geram evento. A aplicação de genérico exclusivamente a não vítimas é uma interpretação documentada: os oráculos são compatíveis, mas não resolvem universalmente a ambiguidade. A regra está isolada em `classifier.mjs`.

Cada objeto tem exatamente `tipo`, `monitoradosEncontro`, `timestamp`, `posicoes` e `distanciaMetros`. `tipo` é `generico`, `faccao` ou `protetiva`; `posicoes` associa cada ID a `lat` e `lon`. Não se arredondam coordenadas/distâncias nem se acrescentam metadados ao array. Arquivos sem encontros produzem `[]`.

## Arquitetura

- `src/cli.mjs`: argumentos, seleção de modo e erros.
- `src/parser.mjs`: leitura incremental e validação dos sete campos, IDs seguros, calendário, booleanos e coordenadas. Aceita BOM, CRLF/LF, aspas e última linha sem quebra.
- `src/sweep-detector.mjs`: agrupamento temporal, IDs únicos e seleção espacial de candidatos.
- `src/reference-detector.mjs`: enumeração exaustiva preservada para comparação.
- `src/classifier.mjs` e `src/haversine.mjs`: regras e distância compartilhadas pela referência e sweep.
- `src/json-writer.mjs`: escrita aguardada por evento, temporário exclusivo, sync e rename; remoção do temporário em falhas.
- `src/optimized-runner.mjs`: execução e métricas; profiling detalhado é opcional e desativado no benchmark final.
- `audit/phase2_5/independent.mjs`: parser, regras e Haversine próprios, sem importar funções da solução principal.
- `scripts/verify-delivery.mjs`: esquema, conjunto, hashes e registros-fonte; `scripts/reproduce.mjs`: reprodução completa.

Diagramas editáveis: [fluxo](diagrams/processo.mmd) e [sequência](diagrams/sequencia.mmd). A validação de entrega é separada da CLI; a CLI não executa automaticamente a auditoria exaustiva.

## Algoritmo e precisão

O pipeline retém somente a janela do timestamp atual. Verifica IDs, ordena uma cópia por latitude e examina pares até a separação superar `20 / 6371000` radianos, acrescida da margem conservadora de `1e-12` grau. A distância geodésica é pelo menos o arco de diferença de latitude, portanto pares além da faixa não podem ser encontros. A margem só admite candidatos adicionais; a decisão final permanece estritamente `<20`.

Para cada candidato elegível, com latitudes φ e diferença de longitude Δλ em radianos:

```text
a = sin²(Δφ/2) + cos(φ1) cos(φ2) sin²(Δλ/2)
d = 2 × 6371000 × atan2(sqrt(a), sqrt(1-a))
```

O termo `a` é limitado a [0,1] para proteger raízes de arredondamentos. Diferenças de coordenadas são calculadas antes da conversão para radianos. Nenhuma tolerância é aplicada à decisão booleana; tolerância de comparação com distâncias publicadas é distinta desse limite.

Por janela de n posições e k candidatos, a detecção custa **O(n log n + k)**; o pior caso continua O(n²), por exemplo com todos os pontos na mesma faixa estreita de latitude. Memória da detecção: **O(n)**, além de buffers e runtime. A referência custa O(n²). Entrada e saída são progressivas; encontros não são acumulados durante a geração.

Desordem temporal ou ID repetido na mesma janela causa erro, inclusive duplicata idêntica. Não há ordenação externa: os sete inputs auditados estão ordenados. A escrita espera cada operação, limitando o volume pendente; em erro, preserva uma saída anterior.

## Testes e evidências

Testes cobrem parsing, classificação, fronteiras de 20 m, coordenadas idênticas, polos, antimeridiano, permutações, densidades variadas, grupos inicial/final, duplicatas, desordem, JSON e falhas tardias. Incluem os 10 encontros dos oráculos, testes diferenciais e erros deliberados no auditor para conferir sua sensibilidade.

Resultados por dataset: **4, 6, 10, 15, 21, 27 e 35 encontros**. A auditoria independente percorreu integralmente 21.530.020 registros e 1.163.510.590 pares: 118 eventos confirmados, sem extras, ausências ou divergências sob as regras documentadas. Não se atribui a esses números certificação externa ou pontuação oficial.

Para repetir o verificador exaustivo (requer os sete inputs; pode levar vários minutos):

```sh
npm run audit
```

Fonte e conjuntos independentes estão incluídos; snapshots e logs de desenvolvimento não estão. [FINAL_VALIDATION.md](FINAL_VALIDATION.md) documenta a reprodução; [DELIVERY_REPORT.md](DELIVERY_REPORT.md) lista conteúdo e limites; `evidence/approved-outputs.json` contém os hashes.

## Benchmark e decisões

O sweep foi escolhido após medição, mantendo a referência. No benchmark anterior, o dataset 3 completo passou de mediana de 602 ms na referência para 452 ms no sweep. Pré-cálculo e arrays tipados não tiveram vantagem nas amostras; filtro pelo termo `a` e reutilização de buffers não justificaram complexidade adicional. Nenhuma dessas micro-otimizações foi adotada.

O benchmark **histórico da versão original** usa Node oficial, três execuções sequenciais por dataset e processos independentes. Mede só o pipeline otimizado, sem profiling por registro: leitura, parsing, detecção, escrita, sync e rename. Exclui auditoria O(n²), início do processo e validação posterior. Cache do SO não é limpo. Médias, dispersão, pico RSS e ambiente estão em [FINAL_BENCHMARK.md](FINAL_BENCHMARK.md).

```sh
npm run benchmark
```

Requer os sete inputs, grava em `generated/`, verifica hashes em cada execução e salva `validation/final-benchmark.json`. Não se generalizam os tempos para outro hardware ou distribuições mais densas.

## Uso de IA e limitações

IA auxiliou implementação, testes adversariais, inspeção e documentação. As decisões foram verificadas por execução, oráculos, comparação diferencial e auditoria independente; o candidato deve compreender e defender a solução. O verificador usa a mesma interpretação de negócio, com implementação própria; não resolve ambiguidades do enunciado. A aritmética é IEEE-754, não precisão arbitrária. Esta entrega não realiza envio automático de e-mail.

## Fase 4 — cache de validação de timestamp

Esta versão adiciona apenas um cache de um timestamp validado por parser/stream. A função createParser cria estado privado; toda mudança de texto executa a validação integral de calendário. IDs, aspas, coordenadas, restrições, desordem temporal, sweep, classificação e Haversine continuam iguais. O cache não armazena registros nem compartilha Sets. Memória adicional O(1). Os sete JSONs continuam idênticos aos aprovados.

O benchmark A/B de seis repetições por variante/dataset resultou em soma 46.539 s → 35.459 s (23.81%); condições, dispersão e limites em [PERFORMANCE_AB_REPORT.md](PERFORMANCE_AB_REPORT.md). A diferença para os tempos históricos não é toda atribuível à mudança. [PERFORMANCE_DIAGNOSIS.md](PERFORMANCE_DIAGNOSIS.md) e [PERFORMANCE_EQUIVALENCE.md](PERFORMANCE_EQUIVALENCE.md) registram os gates. Evidências medidas ficam em evidence/phase4-*.json.

Para reproduzir a comparação no pacote, com todos os inputs em data/ (pode levar vários minutos):

~~~sh
npm run benchmark:ab
# Alternativamente: diretório, datasets, repetições pares e nome do relatório
node benchmarks/phase4.mjs caminho-dos-inputs 1,2,3,4,5,6,7 6 ab-final
~~~

O baseline de parsing está preservado em tests/baseline-parser.mjs, usado também nos testes diferenciais; benchmarks/baseline-writer.mjs e baseline-runner.mjs usam esse parser e o detector inalterado. A variante b é o código desta entrega. O comando valida todos os hashes e salva medições individuais em validation/ab-final.json. npm run benchmark mede somente a versão nova, com a metodologia simples histórica de três repetições; não confundir com o A/B.

O ZIP original permanece disponível separadamente; este pacote é uma nova versão para revisão. Nenhum e-mail é enviado.
