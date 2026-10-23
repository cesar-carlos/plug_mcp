# Redis e múltiplas instâncias MCP — 2026-10-16

Evidência parcial de desenvolvimento, sem aceite de produção. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985` e agente base
`7d00ae8a8f822605d76e775fb5659f27e29df539`, com alterações locais preservadas.
O [inventário SHA-256](2026-10-16-redis-multi-instance-files.json) identifica
arquivos desta frente e dependências; não representa commit ou candidato integral.
Nenhum branch, commit, push, imagem, instalação ChatGPT ou deploy foi realizado.

## Correções e alcance

1. O coordenador reconfere o resultado depois de adquirir o claim Redis. Outra
   instância pode publicar entre miss e lock; o novo proprietário usa a entrada
   vigente e libera somente seu claim, evitando SELECT duplicado.
2. Envelope versão 2 autentica criação e vencimento. Cada leitor aplica seu TTL
   à idade desde a criação, além do vencimento original. Configuração menor não
   aceita entrada antiga no final do TTL maior nem renova a entrada.
3. Namespace `se7e:persona-v2:query:v3:` não lê envelopes anteriores. Não há
   conversão ou limpeza ampla de Redis. Revalidação, recortes, identidade, policy,
   fonte/credencial, publicações, fences e limites permanecem obrigatórios.
4. A fixture ganhou duas instâncias MCP independentes sob uma origem canônica,
   com composição real, banco de controle e Redis comuns. Não usa override de
   gateway, SQL simulado ou autoridade em memória.
5. Porta Redis é fixada no provisionamento para permanecer estável após reinício.
   O runner admite filtro explícito de nome para repetir cenários afetados;
   seleção não substitui a matriz completa e não omite infraestrutura obrigatória.

Não há migrations novas. Auditoria continua somente de metadados. Base técnica
`persona-v2-redis-cache-1`, instruções do runtime, rules e contrato de cache foram
sincronizados. Entradas antigas permanecem cifradas até expirar; resultados e
credenciais não são compartilhados entre consumidores.

## Cadeia e cenários

Rodada completa: fixture `se7e_persona_f3661ccff226_test`, sessão
`chain-0400ae82bc4f412bbcf2596fc630b352`. Hub PostgreSQL/Prisma separado do
controle MCP, autenticação Client/ClientAgentAccess, REST/Socket.IO/RPC, policy,
ODBC, configuração Drift, cofre Windows DPAPI e journals reais de fixture.
Versões observadas por inspeção RPC: PostgreSQL `17.0.11`, SQL Server
`16.00.4236` e SQL Anywhere `16.00.0000`. Redis nativo `7.4.11`, política
noeviction e maxmemory=0 nesta fixture; não é configuração aprovada de infraestrutura.

Nos três motores, o mesmo consumidor envia uma consulta a cada processo MCP.
Uma barreira exclusiva de fixture segura a publicação depois do SELECT nativo;
outra sinaliza claim recusado ao seguidor. Não altera SQL, parâmetros, resultado,
autorização ou comandos Redis. O observador registra somente metadados.

Os cenários conferem:

- Um SELECT, líder fresh e seguidor singleflight, com linhas, readAt e proveniência
  iguais; hit posterior cache conserva a leitura e revalida portões remotos.
- Outro token com a mesma skill executa leitura própria, sem reutilizar resultado
  do primeiro consumidor. Revogação durante espera impede entrega ao líder e ao
  seguidor; nova chamada revogada também não envia SQL.
- Queda real do Redis depois do SELECT preserva o resultado autorizado do líder.
  Seguidor expira sem takeover ou reenvio. Novo pedido explícito com Redis fora
  executa uma leitura autorizada fresca, sem cache.
- Retorno do Redis à porta original é confirmado por nova conexão e PONG na
  fixture final. Não houve teste de DNS/TLS público, proxy instalado ou ChatGPT.

O PostgreSQL dirigido também usa Redis explícito e duas composições para conferir
invalidação física em personas distintas e unknown impedindo reuso. A mudança
de revisão usa o store transacional; o unknown dessa suíte é metadata sintética
de journal, sem efeito de negócio. Não é apresentado como DML incerto real.
A matriz completa da cadeia conserva seus testes reais de DML/journal.

## Resultados

Comandos executados com scripts/with-project-node.ps1. Cadeia pelo runner padrão
prisma com manifesto, Flutter e diretórios dos drivers explícitos; training:check
antes de processos/migrations. Nenhum .env, cofre, DSN ou fonte operacional foi aberto.

| Verificação                                              | Resultado                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cadeia persistente completa, três motores                | **78/78**, **579,17 s**, sem skips                                                              |
| Redis nativo, dois coordenadores, fencing, corrida e TTL | **8/8**, **1,06 s**, sem skips                                                                  |
| PostgreSQL/MCP com Redis e duas composições              | **67/67**, **19,43 s**, sem skips                                                               |
| Regressão geral MCP                                      | **1.468 aprovados, 91 não executados**, 160 arquivos aprovados/seis não executados; **85,04 s** |
| Unitários de cache e guardas do manifesto                | **18/18**, **0,685 s**                                                                          |
| Runtime/compiler                                         | Node **24.21.0**, TypeScript real **7.0.2**                                                     |
| Gates locais                                             | lint, tipos, build, formatação, docs:check e training:check aprovados                           |

Confirmação final da porta estável: fixture `se7e_persona_520e12ce3672_test`, sessão
`chain-0f04e1403c9f420ab97c41aa7f9074c7`, filtro `^Redis coordena`:
**1/1**, **43,72 s**. Os outros 77 cenários foram excluídos pelo filtro, não por
ausência de motor; a rodada completa acima já os executou. O cenário selecionado
instancia os três bancos e dois processos MCP reais e confirma PONG após reinício.
Totais sobrepostos não são somados. As não execuções da configuração geral
continuam sem certificar ambientes obrigatórios.

Rodadas intermediárias não foram aceitas: uma expressão de privacidade confundia
parte de timestamp com decimal de resultado; a comparação passou a exigir valor
exato, conservando detecção de SQL/segredos. A porta Docker dinâmica mudou no
primeiro restart Redis, causando recusa de conexão e falhas de cache esperadas.
Foi corrigido o provisionamento, repetida a matriz nativa com Redis conectado e
confirmado o reinício em nova fixture. Não se retirou a exigência de Redis nem
se apresentou fallback local como homologação distribuída.

## Limites e limpeza

Limpeza das duas fixtures confirmada pelo removedor com conferência de raiz,
nomes, labels, volumes exclusivos, DSN e processo SQL Anywhere. Nenhum recurso
de teste desta rodada permanece ativo.

Homologação comprova os cenários descritos em loopback com infraestrutura própria.
Não certifica Redis/proxy/frota instalados, carga/OOM, todos os tipos de queda de
processo ou partição, backups/restauração, imagens candidatas, instalação desktop
ou avaliação da IA. Cache estrutural e cruzamentos continuam fora do reuso.
Credenciais, dados sensíveis e resultados não entram em chaves, auditoria ou logs.

HTTPS público e conexão ChatGPT permanecem para validação manual. Manifestos dos
três projetos conservam ready:false, treze gates exigidos e nenhum concluído.
Evidência parcial de identidade, consulta, motores e corte; não libera deploy.
