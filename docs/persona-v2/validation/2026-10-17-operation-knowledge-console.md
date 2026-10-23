# Conhecimento visual em operações SQL — 2026-10-17

Evidência parcial de desenvolvimento. Revisões-base: MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985`, agente
`7d00ae8a8f822605d76e775fb5659f27e29df539`. Alterações locais preservadas;
snapshot não é commit. [Inventário SHA-256](2026-10-17-operation-knowledge-console-files.json)
identifica os arquivos desta frente. Sem branch, commit, push, publicação de imagem ou deploy.

## Entrega

O editor de operações tem seletores de tabelas/campos, cardinalidade, associação,
significado, pares compostos ordenados, IDs, intermediárias e elos N:N ordenados.
Diagrama tem lista acessível. Edição conserva referências; remover/renomear um elo
não repara caminhos silenciosamente. O servidor recusa caminhos incompletos;
declaração não comprova constraint nem habilita JOIN no DML.

Adotar conhecimento reutiliza seletor de versões, inspeção e comparação existentes.
Inclui padrão e perfil físico de versão exata, prova da mesma fonte vigente,
campos livres e confirmação. Atualiza significado/grão/regras/relações no rascunho;
preserva tipos, identidade, concorrência, chaves únicas, parâmetros, etapas,
limites, aprovação e escrita. Novas tabelas/campos exigem declaração explícita
anterior; sem conversão automática. PK/UNIQUE/FK e tipos permanecem sujeitos ao
servidor na publicação/execução. Não cria relatórios, publicação ou concessões.

Seleção/inspeção pendentes protegem troca de fonte, rascunho, navegação e saída.
Trocar fonte com vínculo pede confirmação e remove somente referência local,
sem reassociar perfil. Remover vínculo conserva conteúdo privado e snapshot.
Respostas antigas são descartadas; erros mantêm edição e foco acessível.

Corrigida inicialização do seletor: quando monta bloqueado por outra requisição,
aguarda liberação para ler catálogos. A primeira rodada de navegador identificou
a lista vazia; repetição dirigida passou após a correção. Nenhuma adoção ou
mutação é repetida automaticamente. JSON continua como alternativa avançada.

Não houve novo endpoint, schema de negócio, migração ou mudança de transporte.
SQL de negócio continua exclusivamente MCP → plug_server → plug_agente.
SQL direto nos testes pertence apenas ao controle MCP e ao runner de fixture.

## Validação

Node 24.21.0, TypeScript real 7.0.2, PostgreSQL 17.11 e Chromium 153.0.8010.12.
Fixture Docker `se7e-operation-knowledge-fce045b67c72`, loopback/label próprios;
controle, bases sintéticas e runner usam nomes aleatórios `_test`. Não usa
fontes ou credenciais do usuário. Hub do navegador é sintético, com metadados
de PostgreSQL dedicado; não certifica transporte/driver dos três motores.

- Frontend: preservação de contrato/escrita, tipos, classificação, perfil exato,
  fonte/validade, caminho N:N e pares compostos; rejeição de lacunas sem inferência.
- Navegador: edição visual dos três elos N:N, salvamento e leitura do contrato;
  exclusão de elo direto recusada pelo servidor, mantendo foco/edição.
- Adoção: publicação privada anterior produzida por runner separado em banco
  dedicado; padrão/perfil preparados como fixture autorizada. O fluxo visual
  inspeciona/compara e aplica ao rascunho, sem alterar comandos/permissões ou
  ID/hash ativos. Após salvar, relatório antigo fica obsoleto.
- Troca de fonte pode ser recusada sem perder vínculo; remoção do vínculo
  conserva conteúdo e navegação protege edição. Layout sem rolagem horizontal
  em 360/390/768/1280px no cenário de relacionamentos.
- Regressões de catálogo/perfis/publicação em PostgreSQL nativo, além das
  jornadas anteriores do console, tipos/lint/build e regressão geral.

| Verificação                                         | Resultado                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Chromium, suíte final completa                      | **36/36**, sem skips, **3,4 minutos**                                           |
| Chromium, cenários novos dirigidos                  | **2/2**, **9,8 s**                                                              |
| PostgreSQL nativo, catálogo/perfis e publicação SQL | **28/28**, **15,72 s**                                                          |
| Frontend nativo                                     | **53/53**, **0,812 s**                                                          |
| Regressão geral nativa                              | **1.471 aprovados, 91 não executados**, **74,25 s**                             |
| Checks locais                                       | Node/compiler, training:check, lint, tipos e builds servidor/frontend aprovados |

Na primeira regressão completa, o teste antigo confundiu dois avisos de status
(salvamento e leitura de versões); o seletor do teste agora exige a confirmação
específica. A suíte inteira foi repetida e passou. Padronização de blocos nos
arquivos novos não alterou o bundle final `persona-tzxKcFxY.js`, conferido em
novo build após o Chromium. Avisos PURE do Zod são do empacotador, sem falha no build.
Documentação/formatação são conferidas novamente após fechar o inventário.

## Limpeza

Após encerrar os processos de teste, nome, label e bases foram conferidos.
Treze bases de fixture/controle de rodadas dirigidas e completas permaneceram no
contêiner próprio, todas com nomes permitidos. Contêiner, volume anônimo e
diretório temporário com credencial sintética foram removidos e a ausência do
volume foi confirmada. Bases privadas do runner foram removidas ao fim dos
cenários. Nenhum recurso operacional ou arquivo de configuração do usuário foi alterado.

As não execuções preexistentes da configuração geral não certificam infraestrutura
obrigatória. Parser, mocks e suíte PostgreSQL não substituem os três motores.
Avaliação de IA, leitor de tela e zoom real de 200% continuam separados.

## Liberação

Os três manifestos mantêm `ready: false`, com zero gates concluídos. Não substitui
entrada/worker legados nem autoriza corte. HTTPS e ChatGPT permanecem para
validação manual; instalação operacional e aceite integral continuam pendentes.
