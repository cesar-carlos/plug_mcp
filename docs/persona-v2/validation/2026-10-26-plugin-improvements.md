# Compatibilidade do plugin e composição editorial — 2026-10-26

Base: `f521585d40e9a844984b143101b928676614d519`, checkout com alterações locais
anteriores preservadas. Esta rodada não representa commit, push ou deploy.

## Implementação

- Guia consumidor único incluído no runtime e gerado em cada skill do pacote v2.
  Orienta erros, recuperação e cenários sintéticos sem conceder autoridade.
- `compatibility.json` e `obter_capacidades.pluginCompatibility` identificam
  variante, instruções, guia e catálogo por hashes. `plugin:compare` compara
  artefato e resposta salva; não verifica pacote instalado no ChatGPT.
- Composição explícita de até quatro datasets por fonte, preservando ordem e
  duplicatas. Tabelas sobrepostas exigem template/colunas compatíveis; limites
  agregados, papéis, fonte, publicação e origem são revalidados ao salvar.
- Cruzamentos admitem seleção direta da biblioteca pela consulta publicada,
  sem exigir rascunho importado. Só altera sementes editoriais, sem executar SQL.

## Evidência técnica

- 60 testes unitários direcionados: pacote, guia/CLI, origens e composição.
- 56 testes PostgreSQL de conhecimento compartilhado/OAuth, em banco descartável
  próprio desta tarefa; incluem composição, importação direta e recusas.
- 1 teste direcionado de capacidades em source-query; 48 testes excluídos pelo
  filtro explícito. Não representa execução integral dessa suíte.
- 94 testes unitários do console e 25 testes de navegador passaram. Navegador
  usa respostas controladas e não comprova execução SQL nos três motores.
- Lint e verificação de tipos de servidor/console passaram.
- Builds de servidor e console passaram. O build web emitiu avisos de anotações
  de otimização do Zod, sem impedir a geração dos artefatos.
- `docs:check`: 300 arquivos, 1.367 links, 19 rules e 13 gates examinados,
  sem problemas. `git diff --check` passou.
- Após o ajuste final das instruções, os 41 testes de pacote/guia foram repetidos
  e passaram; são subconjunto dos 60, não testes adicionais.
- Container descartável `plug-mcp-plugin-improvements-20261026` removido após
  conferir a etiqueta exclusiva da tarefa. Outros containers foram preservados.

## Limites

Na preparação remota, o CI expôs formatação pendente em nove documentos e uma
corrida na limpeza da fixture de curadoria física: os 332 testes PostgreSQL
passaram, mas o DROP com FORCE interrompeu uma conexão ainda em fechamento.
A limpeza agora encerra o pool e usa DROP sem FORCE, mantendo a recusa se houver
conexões remanescentes. Essa correção de teste não altera o runtime nem aprova
o deploy por si só; a publicação exige nova rodada CI bem-sucedida.

A conexão sintética ChatGPT ainda não existe, conforme informado pelo responsável.
[Roteiro preparado](../plugin-client-validation.md), sem aprovação real do modelo.
Não foi executada nova cadeia de homologação PostgreSQL/SQL Server/SQL Anywhere
nesta rodada. O banco de controle PostgreSQL não substitui essa evidência.
Nenhum gate integral para clientes foi aprovado e nenhum pacote remoto foi
instalado. Contratos de efeitos e aprovação Client permanecem exigidos.
