# Correção do orçamento das jornadas compartilhadas

Arquivo da correção testada em 23/10/2026, coordenado entre os chats do agente e
MCP. A matriz completa passou 85/85 em 643,56 segundos, sem filtro. O cenário de
adoção MSSQL levou 40,261 segundos; o limite permanece 60 segundos.

## Escopo do salvamento

As fontes em `source/` são cópias exatas dos arquivos corrigidos, com extensão
adicional `.txt`. Elas preservam a implementação para revisão e integração
posterior; não fazem parte dos testes executáveis deste checkout publicado.
O baseline persona-v2 e suas dependências ainda estavam pendentes no checkout
de trabalho. Publicar somente os imports dos testes deixaria dependências
ausentes; publicar o baseline completo incluiria trabalho fora desta correção.

Portanto este commit é um arquivo de fontes e evidências, **não a integração da
correção ao runtime ou à suíte executável da main**. A integração futura exige o
baseline completo e novos gates proporcionais. Não há cópia anterior disponível
para produzir um patch exato; nenhum diff reconstruído foi apresentado como original.

O arquivo principal conserva adoção, biblioteca, curadoria e histórico Bearer.
A bateria OAuth foi movida para três jornadas independentes, com preparação
própria dentro do prazo: 82 casos passam a 85, sem eliminar verificações.
O helper OAuth original é incluído como dependência de referência e não foi
alterado nesta correção. O config arquivado conserva os prazos originais.

## Evidências e limites

- [Relatório da execução](report.md): falha anterior, correspondência dos casos,
  tempos, versões, limites e restrições do diagnóstico.
- [Inventário das fontes arquivadas](sources.json): caminhos originais e SHA-256.
- [Resultados e inventários dos três projetos](runs.json): comparação inicial e
  final, saída zero e resumos da rodada focada e da rodada integral.
- [Tempos da rodada focada](oauth-budget-targeted-timings.jsonl).
- [Tempos da rodada integral](full-85-chain-timings.jsonl).

Somente metadados foram exportados dos logs: nenhum manifesto privado, segredo,
SQL retornado ou dado operacional foi publicado. As fixtures foram removidas.
Os hashes de checkout incluem trabalho local e não equivalem aos commits-base.
Os resultados pertencem aos snapshots identificados, não ao código legado deste
checkout nem à imagem de produção. A rodada anterior não registrou fases e não
permite determinar a chamada responsável pelo timeout.

Nenhum limite SQL, de aprovação ou de tempo foi aumentado. As cotas de tráfego
preexistentes da fixture não comprovam as cotas padrão de produção. Os manifestos
locais dos três projetos permanecem `ready:false`; este arquivo não concede aceite,
não altera workflows, não publica imagem/appcast e **mantém o deploy bloqueado**.
