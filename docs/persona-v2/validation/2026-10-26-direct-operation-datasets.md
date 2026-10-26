# Importação direta de datasets para operação SQL — 2026-10-26

Checkout local sobre `f521585d40e9a844984b143101b928676614d519`, com alterações
acumuladas ainda sem commit. Windows, Node 24.21.0, PostgreSQL 17 em contêiner
descartável dedicado. Esta rodada não publica mudanças no servidor de teste.

## Entrega

Seleção direta de catálogo/dataset/versão no editor de casos SQL, sem criar
consulta intermediária. Listagem paginada, leitura da versão explícita, prévia,
aplicação e gravação separadas. A origem própria fixa template/dataset e fonte,
sem herdar autoridade ou relatório. O serviço reconfere Client, papel editorial,
revisão, integridade, fonte e tipos; edição sem origem preserva a já registrada.

## Verificações

| Verificação                       | Resultado e alcance                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL de controle            | 24 testes aprovados, incluindo nova jornada direta e regressões da biblioteca/cruzamentos                                           |
| Navegador Chromium                | 25 testes aprovados com APIs simuladas, incluindo seleção direta, paginação, versão anterior, falha/recuperação e gravação separada |
| Unitários de sementes/operações   | 14 testes aprovados; nomes físicos, tipos, classificação e limites da conversão editorial                                           |
| Unitários da interface            | 94 testes aprovados em 24 arquivos                                                                                                  |
| Build, tipos, lint e documentação | Verificados nesta rodada                                                                                                            |

A jornada persistente comprova ausência de consulta intermediária, casos ou
relatórios criados pela preparação; recusa sem sessão/CSRF, outro responsável,
papel somente leitor, revisão/hash/versão incorretos e origem adulterada. Após
salvar, os hashes/status são recalculados; omitir origem preserva a linhagem e
editar valores marca `modified`. Mudança de versão da fonte, suspensão ou perda
do papel editorial bloqueiam leitura/edição. Remover caso autorizado não relê
dados editoriais revogados. Alterações diretas de fonte nesse teste pertencem
exclusivamente à fixture PostgreSQL, não são procedimento de recuperação real.

O primeiro comando de persistência usou a configuração genérica, que exclui as
suítes v2; foi repetido com a configuração específica, sem omissões. A fixture
de navegador foi corrigida para localizar selects pelo nome acessível e preencher
parâmetros válidos antes de validar o payload completo. Não houve aumento de
timeout nem relaxamento do contrato para aprovar a jornada.

## Limites e continuação

Sem migration nova. Sem consulta SQL de negócio, runner de publicação ou prova
dos três motores nesta rodada. Sem nova capability ou tool MCP, instalação
ChatGPT, aceite integral de clientes ou deploy. Persistência usa autoridade
sintética de fixture; não substitui a cadeia MCP/hub/agente.

Importação direta para cruzamentos, combinação de múltiplos datasets e
homologação ampliada continuam no plano. A importação entregue copia sementes
para casos, não cria contrato/steps de operação a partir de template.
