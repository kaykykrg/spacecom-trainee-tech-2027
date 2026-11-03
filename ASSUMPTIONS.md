# Premissas e limites comprovados

Atualização da entrega: 02/11/2026. O enunciado original foi fornecido na Fase 3 e está em `ENUNCIADO_ORIGINAL.md`; `REQUIREMENTS.md` distingue exigências expressas e interpretações. Evidências portáteis em `evidence/inputs.json`, `evidence/inspection-results.json`, `evidence/independent-summary.json` e `FINAL_VALIDATION.md`. A primeira inspeção incorreta não fundamenta nenhuma conclusão. Nenhuma regra do algoritmo foi alterada nesta atualização documental.

- **Ordenação:** os sete arquivos auditados estão em ordem não decrescente por timestamp. Isso vale para os SHA-256 documentados, não para entradas futuras. O processador continua detectando e rejeitando regressões. Ordenação externa não é necessária nesses arquivos e não foi implementada.
- **Memória:** ler incrementalmente, manter apenas um grupo de timestamp para detecção. Auditoria mantém adicionalmente contadores por timestamp; não mantém o conteúdo integral nem todos os pares ID/timestamp.
- **Formato:** exatamente sete campos separados por `;`, cabeçalho validado, aspas externas, timestamp `YYYY-MM-DD HH:MM:SS` preservado, sem conversão de fuso. Suporte a BOM UTF-8, LF/CRLF e última linha sem quebra. Ausência de newline final não prova truncamento: integridade depende de bytes e checksum remoto.
- **IDs:** inteiros seguros em JavaScript (`Number.isSafeInteger`), sem truncar para Int32. Repetição do mesmo ID em timestamps diferentes é normal. Dois registros do mesmo ID no mesmo timestamp são rejeitados, inclusive duplicatas idênticas. Nenhuma duplicata desse tipo foi encontrada na auditoria.
- **Coordenadas:** números finitos em latitude [-90,90] e longitude [-180,180], preservados sem arredondamento artificial.
- **Distância:** Haversine com raio 6.371.000 metros. O limiar é estritamente `< 20`. A tolerância de 1e-7 metro se aplica somente à comparação com distâncias dos oráculos, nunca à decisão de encontro.
- **Pares:** diferentes IDs, mesmo timestamp textual, no máximo um evento por par não ordenado e timestamp. Novo timestamp permite novo encontro do mesmo par.
- **Classificação exclusiva:** `protetiva` quando exatamente uma pessoa é vítima e sua lista contém o ID da outra; caso contrário, dois não vítimas da mesma facção não vazia geram `faccao`; dois não vítimas sem essa condição geram `generico`; demais casos não geram encontro.
- **Ambiguidade de negócio:** o enunciado distingue monitorados/agressores e vítimas, mas o campo idMonitorado abrange ambos. Exclusão de vítima de encontros genéricos e exclusão de pares de duas vítimas são interpretações compatíveis com os oráculos, não comprovadas universalmente por eles. Eventual esclarecimento oficial exige mudar a regra isolada e reexecutar os testes.
- **Facção vazia:** nunca caracteriza mesma facção. Lista de restrições é conjunto de IDs; entradas repetidas são erro de parsing.
- **Inconsistências:** auditoria examina esquema, calendário, coordenadas, booleanos, IDs seguros, restrições repetidas, autorrestrições, não vítima com restrições e vítima sem restrições. Ausência dessas inconsistências não comprova toda a semântica de negócio imaginável.
- **Escopo Fase 1:** a referência O(n²) valida correção e os dois oráculos. Não há resultado oficial de encontros dos datasets3–7 disponível neste escopo; auditoria de entrada não equivale à validação dos encontros desses arquivos.

## Limites da entrega

Referência, sweep e verificador independente estão incluídos. O sweep foi selecionado por medição; a auditoria exaustiva cobriu integralmente os sete inputs. A classificação mantém as premissas acima, sem alegação de certificação oficial dos datasets 3–7. Novos arquivos fora das propriedades auditadas podem exigir outras decisões; não há suporte implícito a ordenação externa.
