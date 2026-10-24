# Biblioteca editorial — revalidação e limites

Rodada de 2026-10-14, America/Cuiaba. Complementa a
[entrega anterior](2026-10-14-knowledge-library.md), sem reescrever seus resultados.
Não houve branch, commit, push, publicação de imagem ou deploy. Os manifestos
continuam com `ready: false`, catorze gates exigidos e nenhum concluído.

## Correções e contrato

Datasets agora conferem o tipo lógico do template mesmo sem linhas. Tipos
desconhecidos ou nativos ambíguos exigem revisão humana; não há conversão entre
motores. Decimais respeitam precisão/escala declaradas sem conversão para Number,
arredondamento ou truncamento. Proveniência, limites, cifragem, CAS e autorização
editorial permanecem obrigatórios. Validação editorial não prova todas as
constraints, unicidade ou limites nativos.

DDL importado confere os limites do modelo compartilhado, incluindo nomes,
identificadores e até dezesseis pares por FK; recusa o marcador técnico reservado.
Grão ausente permanece explícito para revisão. Nenhum arquivo é executado,
nenhuma declaração prova enforcement e nenhuma importação publica/adota sozinha.
Sem migration nova ou alteração das migrations aplicadas. [Contrato](../knowledge-library.md).

Instruções/base v2 avançam para `persona-v2-knowledge-library-2`; hash é derivado
do conteúdo. Templates continuam criando somente rascunhos privados de consulta
com origem e mapeamento explícitos, exemplos candidatos e sem autoridade herdada.
Consumo delegado, outros tipos de skill e runners genéricos continuam pendentes.

## Verificações

A regressão geral passou em 1.229 casos de 138 arquivos; 91 casos opcionais em
seis arquivos ficaram ignorados. Esses opcionais não certificam ambientes ou
motores obrigatórios. A linha de unitários abaixo é um subconjunto da regressão.

| Verificação             | Resultado e alcance                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unitários persona-v2    | 319 passaram em trinta arquivos; inclui recusas de tipo, precisão, escala, DDL e diagnóstico sem segredos    |
| Persistência PostgreSQL | 184 passaram em doze arquivos; bancos efêmeros, autoridade sintética, recusa sem gravar dataset inválido     |
| Chromium                | Um caso dirigido de biblioteca passou: template, rascunho, dataset, arquivo DDL, descarte e erro JSON seguro |
| Contrato do hub         | `training:check` passou após revisão explícita do commit-base                                                |

Node 24.21.0, TypeScript 7 real, lint, tipos, builds e validação documental são
verificados nesta rodada. O build web produziu avisos de anotações de dependência
Zod/Rollup, sem erro de compilação. Uma primeira tentativa PostgreSQL e uma
conferência do hub foram recusadas pela sandbox; repetidas com acesso autorizado
à fixture/checkout local, passaram. Uma regra de lint foi corrigida e repetida.

PostgreSQL/Chromium não certificam os quatro motores, o aplicativo desktop,
leitor de tela, zoom real de 200%, plugin privado ou IA consumidora. A rodada
dirigida do navegador não equivale a repetir toda a matriz do console.

## Contrato revisado e cadeia real

O commit-base do hub foi revisado de `0d2c6b4` para
`bfb40becd42c5452b19b0df13698d212a0238ddc`. Foram conferidos contrato consumido,
capabilities/validadores e igualdade dos bytes do contrato e patch local.
Contrato 1.12.0 mantém SHA-256
`45589c3da2f94639c097893abf73e91360f0cbe2a3c48399ee36444be39f1092`;
patch mantém `4a46ee3db954130fafa74736824678ed7e66efccf72928def5345d19f7122493`.
Isso não converte snapshot em commit upstream nem permite atualização automática.

Antes das correções editoriais desta rodada, a fixture nova
`se7e_persona_62250b8377ea_test` passou no preflight e executou a cadeia persistente:
**13 casos passaram e 17 falharam**, além de falha no encerramento. Após reinício,
o companion saiu com código 79; diagnóstico seguro do hub registrou os quatro
agentes desconectados e capabilities ausentes. Foram recusadas consultas com
`CAPABILITY_UNAVAILABLE`; não houve fallback, bypass ou reenvio de escrita incerta.
Essa rodada falhou e não comprova o candidato editorial posterior.

O diagnóstico de fixture guarda somente horários, estado HTTP/conexão,
versões de capabilities e códigos de saída. Exige loopback explícito e recusa
redirect; não persiste token, resposta bruta, SQL ou dados de negócio.
A causa completa da falha de reinício ainda precisa de correção e repetição
em fixture nova. Não se atribui a falha automaticamente às mudanças externas
do hub/agente. Nenhum motor ausente/falho é considerado skip de aceite.

## Candidato e pendências

[Inventário de hashes](2026-10-14-knowledge-library-validation-files.json)
identifica o recorte e revisões observadas. Alterações posteriores não ficam
certificadas. Versões dos motores/drivers não foram recoletadas; não há nova
homologação integral. Logs e manifestos com credenciais sintéticas ficam fora
da documentação. O checkout do agente mudou externamente durante o trabalho;
o inventário registra a revisão observada na coleta, sem atribuí-la à cadeia
executada antes. A fixture foi removida pelo controlador restrito aos próprios
caminhos, labels, volumes, processos e DSN, preservando os recursos operacionais.

Ainda faltam integração com runners, consumo delegado da biblioteca e a matriz
integral do [plano restante](../remaining-plan.md). Compartilhar conhecimento não
compartilha resultados ou credenciais. Nenhuma estrutura Data7 foi inventada.
Todos os gates permanecem pendentes de aceite; deploy permanece bloqueado.
