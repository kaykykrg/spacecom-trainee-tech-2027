# Requisitos e rastreabilidade

Fonte primária: `ENUNCIADO_ORIGINAL.md`, transcrição fornecida pelo candidato na Fase 3. Os relatórios das fases anteriores registram corretamente que essa fonte ainda não estava disponível naquele momento; esse limite documental foi resolvido agora, sem alteração do algoritmo.

## Expressos pela Spacecom

- JavaScript/TypeScript em Node.js ou similar; IA permitida, com compreensão e defesa da solução.
- Sete campos separados por ponto e vírgula; timestamp no formato informado; latitude/longitude com cinco casas nos inputs.
- Haversine com R = 6.371.000 metros; distância estritamente menor que 20 metros.
- Comparar apenas timestamps exatamente iguais; não aproximar por intervalos de 5 segundos.
- Um encontro por par e timestamp, sem relevância da ordem dos IDs.
- Tipos genérico, facção e protetiva conforme descrições do enunciado. Apenas usuários de tornozeleira têm facção preenchida; listas de restrição identificam os agressores da vítima.
- Array JSON com exatamente `tipo`, `monitoradosEncontro`, `timestamp`, `posicoes` e `distanciaMetros`; `posicoes` associa cada ID a `lat`/`lon`.
- Entrega de fonte, README e resultados em ZIP ou link; prazo de 03/11/2026 às 23:59:59. O e-mail não explicita o fuso; não se presume prorrogação.

## Confirmados empiricamente

- Oráculos oficiais: quatro eventos no dataset 1 e seis no dataset 2, com correspondência de todos os campos.
- Eventos de facção não aparecem também como genéricos para o mesmo par/timestamp. Isso apoia classificação exclusiva junto com a unicidade exigida.
- Sete inputs auditados estão em ordem temporal não decrescente, com no máximo 120 posições por janela. É uma propriedade desses arquivos, não uma garantia geral do enunciado.
- Auditoria independente exaustiva verificou 1.163.510.590 pares e os 118 eventos nos sete arquivos. Nenhum par próximo foi excluído pelas premissas de vítima sem vínculo/duas vítimas; portanto, os dados não resolvem esses cenários ambíguos.

## Decisões de implementação e premissas

- Protetiva: exatamente uma vítima e presença do outro ID em sua lista. Duas vítimas ou vítima sem vínculo não geram evento.
- Genérico e facção são aplicados somente entre dois não vítimas. Embora o desafio distinga monitorados/agressores e vítimas, o campo `idMonitorado` abrange ambos; a extensão de “quaisquer dois monitorados” a vítimas não é totalmente explícita. Essa interpretação permanece documentada e isolada no classificador.
- Facção exige identificadores iguais e não vazios. Em cenário sintético de sobreposição de facção com vítima, prevalece protetiva vinculada; o enunciado não prevê tal preenchimento para vítimas.
- IDs inteiros seguros; coordenadas finitas; calendário válido; rejeição de IDs duplicados na mesma janela, inclusive cópias idênticas; falha explícita em desordem. Essas validações são decisões defensivas, não garantias adicionais atribuídas à empresa.
- Não se arredondam coordenadas ou distâncias. Ordem crescente de IDs e ordem temporal dos eventos são convenções determinísticas.

## Verificações na entrega

`scripts/verify-delivery.mjs` verifica SHA-256, esquema exato, unicidade e equivalência com o conjunto independente. Com inputs disponíveis, confirma novamente as duas posições de cada evento diretamente nas linhas originais e recalcula distância/classificação por implementação independente. `npm test` cobre os oráculos e os casos adversariais. `FINAL_VALIDATION.md` registra a reprodução em pasta limpa.
