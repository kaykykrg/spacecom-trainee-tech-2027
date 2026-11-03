# Equivalência e decisão — Fase 4

## Gates de correção concluídos

- ZIP aprovado preservado por SHA-256: 6f144e7140744527eeac88c7f10c7a86487a015f13d15ac610359829d63523bc. Fontes baseline idênticas às aprovadas; somente src/parser.mjs difere no candidato. Sem bibliotecas externas, mudanças de regras ou dependência do editor.
- Parser original versus cache: **21.530.020 registros**, sete datasets inteiros. IDs, facção, timestamp, latitude, longitude, booleano comparados com Object.is; Sets comparados por tamanho e sequência. Inputs confirmados pelos SHA-256 oficiais auditados. Nenhuma divergência.
- Testes existentes e variantes isoladas: 77 aprovados. Na versão integrada em pasta limpa: **45 testes aprovados**, incluindo todos os 43 originais e dois testes adicionais de calendário/cache, entradas sintéticas inválidas e independência mutável das restrições.
- Reprodução completa com Node oficial v24.22.2, sem instalação de dependências: sete outputs, **118 encontros**, hashes idênticos aos aprovados; semântica independente e registros-fonte conferidos.
- Auditoria independente reexecutada integralmente sobre os outputs regenerados: **1.163.510.590 pares**, 21.530.020 registros, 118 encontros. Zero ausências, extras ou classificações divergentes. O auditor usa parser próprio e Haversine próprio, sem filtro espacial.

- Dataset 1: 5.000 registros, 22.500 pares, 4 encontros; SHA-256 b90d1b753bb5cad0f33a8d6ca01c6500bdf271f37d55e952b622008a2703fa99.
- Dataset 2: 25.000 registros, 237.500 pares, 6 encontros; SHA-256 e550a77cf6b11f7df908ac414183c56c847e9aaf8776809dfa34dd5ad76c677c.
- Dataset 3: 100.000 registros, 1.950.000 pares, 10 encontros; SHA-256 27cdc3c5719287341b05d7c07fa1b55487cbf08650d617ec6f51206ece9aaae3.
- Dataset 4: 400.020 registros, 11.800.590 pares, 15 encontros; SHA-256 449b5c0f300c9a246713b163c5c556b5a09594d326d9676628d30f30ccf614c2.
- Dataset 5: 1.000.000 registros, 39.500.000 pares, 21 encontros; SHA-256 df4588a2c0db2dd2dc4c4dc87498552e5547d4b71044e1346324db0bd90e0ac8.
- Dataset 6: 8.000.000 registros, 396.000.000 pares, 27 encontros; SHA-256 1b71d65ffee707d818d30b8767ad4a6883024494a9d27e0efe6c1a5053005201.
- Dataset 7: 12.000.000 registros, 714.000.000 pares, 35 encontros; SHA-256 325e3182d675bb4c77e75cc20cc3263cf88c06a8b0faace80f16d05152a44040.

## Alteração e limites

O cache guarda somente o último texto de timestamp cuja validação de calendário teve sucesso. Cada readRecords cria um parser próprio; createParser também está disponível para consumidores que precisem de estado isolado. A API parseRecord usa uma instância privada. Mudança de texto revalida tudo; desordem continua rejeitada pelo detector. Uma falha de outro campo não transforma um timestamp inválido em válido. Não há Set compartilhado, arredondamento, substituição de fórmulas, permissividade nova ou crescimento de cache com o arquivo.

As evidências são completas para os sete datasets e cobrem casos sintéticos; não são prova formal para qualquer string possível. O comportamento existente de aspas foi preservado, inclusive suas particularidades, sem ampliar o escopo para corrigir regras não solicitadas.

## Recomendação técnica: ADOTAR NOVA VERSÃO

Soma A/B 46.539 → 35.459 s, redução 23.81%; dataset 6 reduz 22.43%. As faixas de tempo de A e B não se sobrepõem nos datasets 6 e 7 nesta rodada. Pico RSS máximo caiu nesses dois datasets; pequenas oscilações em inputs menores (por exemplo +1,62 MiB no dataset 3) não indicam regressão material. O ganho de poucos milissegundos no dataset 1 deve ser interpretado com cautela. Condições não controladas do sistema limitam generalização.

A adoção técnica é justificada por alteração pequena, equivalência completa, auditoria independente e ganho A/B reproduzido. Preparar ZIP novo e versionado para revisão, preservando o original. **A decisão de envio da nova versão depende da aprovação explícita do usuário.** Nenhum e-mail foi enviado e a entrega original não foi substituída.

Evidências da distribuição: evidence/phase4-parser-equivalence-b.json, phase4-clean-audit-summary.json, phase4-freeze-check.json, phase4-ab-final.json e phase4-ab-summary.json. Logs completos, scripts de preparação e perfis CPU permanecem no workspace perf-experiments/spacecom-encontros/perf/. Para repetir testes/reprodução/auditoria no pacote: npm test, npm run reproduce, npm run audit; baixar inputs grandes primeiro conforme README. Para repetir A/B: npm run benchmark:ab.
