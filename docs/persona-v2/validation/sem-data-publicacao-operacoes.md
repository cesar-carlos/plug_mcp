# Publicação de operações e transporte REST

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: Não individualizada. Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada anterior: publicação de operações e MCP ligado ao REST

`composePersonaV2` fornece autoridade publicada, store cifrado e adaptador REST
concretos. Contrato inicial somente_parametros, sem SQL livre, com identidade,
concorrência, colunas/efeitos concedidos, recortes do servidor e limites. Mudanças
de contrato/fonte exigem relatório atual e nova concessão. O fluxo padrão legado
e a proibição de produção na composição nova foram preservados.

O runner separado cria banco PostgreSQL aleatório, executa SQL de fixtures,
confere condições, linhas afetadas e dados finais, confirma rollback e remove seu
banco. Não abre fonte cadastrada. A suíte cobre INSERT/SELECT/UPDATE/DELETE,
identificador retornado e passagem tipada entre etapas. Isso não homologa ODBC.

- PostgreSQL persona-v2: **59 passaram**, sem skips, incluindo publicação,
  casos obsoletos, concessões restritas, aprovação Client, HTTP real contra hub
  sintético e consulta ao journal sem reexecução. Quatro arquivos, bancos próprios.
- Unitários persona-v2: **154 passaram**, incluindo disputa entre confirmação
  via journal e falha tardia da execução original; confirmação comprovada prevalece.
- MCP completo: **1.018 passaram, 91 omitidos já existentes**; lint, tipos,
  build, formatação e compilador TypeScript 7.0.2 passaram.
- Hub: **17 testes específicos passaram**; tipos de produção/testes e contrato
  aditivo conferidos. Detalhe Client/Agent expõe limites v1 ou null depois do portão
  de acesso, com snapshot local e revalidação no dispatch.
- Hub completo no modo padrão `auto`: **2.156 passaram, 18 omitidos**. O harness
  opt-in está entre os omitidos e foi executado separadamente com sucesso.
- Hub: lint, build e tipos passaram usando TypeScript 7 instalado no MCP; contrato
  gerado e formatação dos arquivos desta etapa passaram. As seis divergências
  globais de formatação já registradas na rodada anterior foram preservadas.
- Node/Dart: harness Socket.IO real repetido e aprovado, oito chamadas REST/relay,
  journal SQLite temporário e transação simulada; não acessa base de negócio.
- Ensaio adicional do hub com `CONTAINER_PERSISTENCE_MODE=prisma` forçado:
  **52 falharam, 2.106 passaram, 16 omitidos**. Há fixtures sintéticas com valores
  maiores que as colunas, entre outras falhas da suíte nesse modo. Não foi alterado
  o domínio público do hub para acomodá-las. Esse ensaio não está validado.

As 41 migrations do hub foram aplicadas em banco descartável desta rodada.
Nenhuma migration nova foi necessária para o contrato de publicação: baseline,
publicações/fontes, relatórios e migration 0003 já suportavam essas entidades.

Pendências de aceite: SQL adaptável de escrita, runners de outros dialetos,
conciliação por chave de negócio, worker de retenção, console/OAuth v2 e integrações,
homologação ODBC dos quatro motores, contratos/ref imutável do hub e corte. Node
local continua abaixo de 24.21 e o gate da base fixada acusa alteração do hub;
esses portões não foram contornados. Os três manifestos continuam `ready:false`.
O contêiner exclusivo desta rodada foi removido ao terminar; o PostgreSQL
`plug_mcp-postgres-1` existente permaneceu intacto.
