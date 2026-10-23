# Correção do cofre concorrente do agente — 2026-10-20

Continuação da [falha reproduzida](2026-10-20-agent-vault-concurrency-failure.md).
Nenhum cofre operacional foi acessado. Deploy/instalador permanecem bloqueados.

## Implementação

O agente mantém `flutter_secure_storage`. O backend Windows 4.2.2 foi incorporado
com sua licença em `plug_agente/third_party/flutter_secure_storage_windows`,
fixado por override local no `pubspec.yaml` e lockfile. O cache Pub global não
foi alterado. README local identifica origem, diferenças e limites.

- Toda operação da plataforma adquire lock de arquivo no mesmo diretório do
  cofre antes de ler/modificar o mapa. Espera máxima de dez segundos; só erros
  Windows de compartilhamento/bloqueio entram na espera.
- A cifra completa é escrita e descarregada num arquivo irmão com nome único.
  `MoveFileExW`, com substituição e write-through, publica o novo arquivo.
  A escrita normal não trunca o arquivo vigente.
- Falhas de leitura, decifragem ou estrutura JSON são propagadas sem apagar
  conteúdo nem tratar arquivo ilegível como mapa vazio.
- Formato DPAPI, nome do arquivo e chaves permanecem compatíveis.

Hash SHA-256 do backend modificado:
`d1e5c2600bf09b688056f6e8ca7c94b36917f7622198c00ce44ff48d811db1e1`.
Identifica esse arquivo; não é inventário integral, commit ou release.

## Regressões executadas

O runner `scripts/homologation/probe-persona-agent-vault.ps1` passou com:

1. Dois processos gravando cem chaves sintéticas distintas cada um; terceiro
   processo recuperando todas as duzentas.
2. Outro processo mantendo o lock: tentativa de gravação expira em dez segundos
   e conserva os bytes cifrados.
3. Encerramento forçado apenas do proprietário criado pela fixture: a verificação
   seguinte consegue adquirir o lock e reler os dados.
4. Arquivo inválido: leitura e gravação recusadas, bytes preservados. Restauração
   explícita apenas da cópia sintética permite reler as chaves anteriores.

Os diretórios temporários foram removidos. Análise estática do backend:
sem problemas. A primeira tentativa de compilação acusou tipos Win32 de strings;
foi corrigida antes das rodadas aprovadas.

O alvo desktop isolado foi recompilado. Os dois cenários nativos (perfil vazio e
configurado) passaram, início 13:13:26, 81,81 segundos, incluindo reinício,
restauração de credenciais e renovação da sessão. Hub usa autoridade em memória;
o alvo de banco configurado é deliberadamente inacessível. Não certifica a
cadeia Prisma. DTD não encontrou processo de depuração para hot reload: foram
usados executável recompilado e processos novos.

SHA-256 do `data/flutter_assets/kernel_blob.bin` dessa fixture debug:
`bd4a355ab938c21a858460ce968c0a7ae01b3ef41934d492c56018067a98bb1c`.
O executável nativo conserva o hash anterior; sozinho não identifica o código
Dart atualizado. Logs `persona-vault-desktop-build.log` e
`persona-vault-desktop-current.log` ficam no cache local.

## Limites de aceite

Não transforma múltiplas chaves em transação nem certifica falta de energia ou
ciclo instalado de upgrade/desinstalação. Arquivos `.next` órfãos cifrados não são
promovidos; sua manutenção permanece separada. Nunca apagar o caminho do lock
com um proprietário ativo. Binários antigos não respeitam essa proteção: parar
todos os consumidores do cofre antes da atualização coordenada.

Resta repetir a cadeia persistente dos três motores com o agente modificado,
além da homologação operacional restante. Não reutilizar evidência do agente
anterior como aceite automático desta revisão. Nenhum gate encerrado.

Atualização posterior: a [rodada integral da cadeia](2026-10-20-candidate-vault-full-chain.md)
passou nos 79 cenários com este backend. A homologação operacional e o aceite
formal restantes continuam abertos.
