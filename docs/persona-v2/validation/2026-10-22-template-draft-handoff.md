# Abertura do treinamento importado — 2026-10-22

## Correção e alcance

A biblioteca importava o template, mas a lista de rascunhos da persona já
carregada permanecia desatualizada. A ação explícita **Abrir treinamento criado**
agora relê a persona de destino e o rascunho salvo antes de substituir o contexto.
Não importa novamente, publica, concede acesso ou executa SQL.

Alterações pendentes exigem confirmação. Cancelamento, destino suspenso ou
falha de leitura preservam a edição e o contexto anteriores. A navegação usa o
ID confirmado pela importação, verifica o destino e apresenta a revisão salva
mais recente. O foco aguarda o editor disponível, sem espera fixa. Referência,
edição e segredos continuam somente em memória.

Não houve migration, alteração de contrato do hub/agente ou mudança de
autorização. O carregamento comum do console passou a concluir as leituras antes
de aplicar o novo contexto.

## Verificações

- Chromium: **56/56**, com PostgreSQL de controle isolado e hub sintético.
  O novo cenário cobre destino diferente, edição pendente/cancelamento,
  suspensão/recuperação, revisão alterada, foco e ausência de POST na abertura.
- Frontend: lint, tipos, **86/86** testes e build. Uma repetição intermediária
  falhou por arquivos temporários ausentes do executor antes de carregar cinco
  suítes; a repetição com pasta temporária exclusiva passou.
- Lint e tipos do servidor passaram; documentação e formatação dos arquivos
  alterados foram verificadas. O bloqueio de release continua obrigatório.

O teste dirigido inicialmente revelou foco solicitado enquanto o editor ainda
estava desabilitado pelo carregamento dos componentes. A correção passou no
cenário dirigido e na suíte completa. A primeira execução também precisou de
seletor inequívoco para o nome da skill, sem alterar comportamento do produto.

## Imagem e cadeia persistente

Imagem local `se7e-persona-v2-candidate:draft-handoff-20261022`, ID
`sha256:26a4919f77126996f0a69c54a0539d3a68e252d2ac8e3850089deaacbab6e8bb`.

Rodada de 20:06:06 a 20:07:02 UTC: **4 passaram**, 75 fora do filtro de 79.
Filtro: `Chromium cria persona|inspeciona metadados pela conexão`.
Inclui o percurso básico de criação/treinamento/publicação/consulta no navegador
e inspeção nativa nos três motores, via MCP → hub Prisma → agente → banco.
O novo botão foi exercitado pela suíte Chromium com hub sintético, não por esse
recorte persistente. Não é repetição integral dos 79 cenários.

Versões observadas: PostgreSQL `17.0.11`, SQL Server `16.00.4236` e
SQL Anywhere `16.00.0000`. Inventários antes/depois idênticos:

| Projeto | Commit-base                                | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `c5f64e8e6a7c50aa77dfb2df9ca3db3e36424e66c3316fb96bcedd42c88e3315` | 1093     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `b2b2f82798d683cbab2270fcf6b3e60911afad89d943911cc6ebdf3f5bfd3ecb` | 2670     |

São snapshots locais, não commits novos. O wrapper retornou zero,
`unchanged: true`, `result: passed` e confirmou remoção somente da fixture.
O relatório e os links documentais finais são posteriores ao inventário;
não certificam retroativamente outro candidato. Nenhuma fonte operacional foi usada.

## Limites

Não encerra jornadas editoriais restantes, acessibilidade integral, instalador
elevado do agente, avaliação da IA ou aceite dos gates. HTTPS e conexão ChatGPT
continuam para validação manual. `ready: false` permanece, sem publicação de
imagem ou deploy de produção.
