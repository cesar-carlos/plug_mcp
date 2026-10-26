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

O servidor de teste recebeu a imagem do commit `7b147ea` após aprovação integral
do [CI 40353764526](https://github.com/cesar-carlos/plug_mcp/actions/runs/40353764526).
Servidor e worker saudáveis, sem reinícios, migração `0045_persona_icon_revision.sql`
aplicada e configuração preservada; `/health`, `/ready` e `/app/` responderam 200.
Backup foi verificado antes da ativação. As 62 jornadas integradas passaram em
fixture isolada. Na suíte PostgreSQL remota, 325/332 passaram inicialmente;
as duas suítes que exigem localhost foram repetidas na rede do banco descartável,
com 18/18 aprovados. O CI posterior aprovou a suíte completa.

O diagnóstico HTTPS revelou uma divergência do verificador: usava GET no
transporte v2 que aceita somente POST. POST sem credenciais devolveu 401 com
o challenge correto. O diagnóstico passa a usar POST vazio somente nessa etapa,
sem autenticar, enviar tools ou alterar a descoberta GET e as guardas de rede.
Após a correção, as três etapas HTTPS públicas passaram; 21 testes dos diagnósticos
v2/legado, lint, tipos e validação documental também passaram. A revisão `6d5eee5`
foi aprovada pelo [CI 40368444812](https://github.com/cesar-carlos/plug_mcp/actions/runs/40368444812)
e publicada pelo [deploy 40372373749](https://github.com/cesar-carlos/plug_mcp/actions/runs/40372373749).
Servidor e worker confirmaram essa revisão, ambos saudáveis e sem reinícios;
configuração preservada, migração 0045 presente e os três endpoints HTTP responderam 200. Descoberta HTTPS repetida após essa publicação aprovou as três etapas.
Registros privados do servidor: `/root/deploy-records/plug-mcp-20261026-6d5eee5`;
backup anterior à ativação: `/root/deploy-records/plug-mcp-20261026-7b147ea`.

A mesma corrida de fechamento reapareceu em conhecimento compartilhado, após
332 testes aprovados. O ajuste sem FORCE também cobre as limpezas restantes
de conhecimento, upgrade, baseline e delegação: todas já encerravam seus pools
antes do DROP. Conexão vazada continua falhando, em vez de ser interrompida.

Na preparação remota, o CI expôs formatação pendente em nove documentos e uma
corrida na limpeza da fixture de curadoria física: os 332 testes PostgreSQL
passaram, mas o DROP com FORCE interrompeu uma conexão ainda em fechamento.
A limpeza agora encerra o pool e usa DROP sem FORCE, mantendo a recusa se houver
conexões remanescentes. Essa correção de teste não altera o runtime nem aprova
o deploy por si só; a publicação exige nova rodada CI bem-sucedida.

O CI também revelou que o comando de navegador herdava `NODE_ENV=test` ao
compilar o frontend. Em container Linux isolado, o build normal passou nos
25 testes; o build herdando test reproduziu três falhas nos seletores SQL.
O comando web agora fixa production somente em seu processo de compilação.
Repetir o cenário com `NODE_ENV=test` no chamador passou nos 25 testes (35,5 s),
sem retirar testes ou mudar expectativas. Falhas anteriores de ícone/reflow do
runner permanecem no histórico; o aceite da revisão exige CI completo.

A rodada seguinte confirmou os seletores corrigidos, mas manteve falhas de
reflow e sincronização do teste de ícone. O cabeçalho permite quebra e o texto
do console quebra palavras longas sem recorte; o teste cobre também fonte larga.
A recriação de ícone aguarda confirmação e campo habilitado, pois `setInputFiles`
pode preencher controles ainda bloqueados. Os 25 testes passaram em Linux com
`NODE_ENV=test` (29,6 s). A evidência remota final depende da rodada completa.

A conexão sintética ChatGPT ainda não existe, conforme informado pelo responsável.
[Roteiro preparado](../plugin-client-validation.md), sem aprovação real do modelo.
Não foi executada nova cadeia de homologação PostgreSQL/SQL Server/SQL Anywhere
nesta rodada. O banco de controle PostgreSQL não substitui essa evidência.
Nenhum gate integral para clientes foi aprovado e nenhum pacote remoto foi
instalado. Contratos de efeitos e aprovação Client permanecem exigidos.
