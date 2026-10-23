# Orientação e ensaio do treinamento manual — 2026-10-23

## Correção

A instrução v2 enviada à IA ainda classificava runners genéricos implementados
como pendentes. O onboarding também anunciava integrações e setups delegados de
tokens como indisponíveis, e descrevia o grafo como futuro. As interfaces reais
estão nos contratos de catálogo, OAuth, integrações e conhecimento compartilhado.

As orientações agora distinguem implementação, alcance delegado e aceite:
runners são CLIs exclusivos do operador em fixtures, sem execução/aprovação por
MCP; segredos e confirmação humana dos setups permanecem no navegador. Busca e
grafo utilizam somente snapshots concedidos. Nenhuma autorização foi ampliada.

Uma regressão reproduziu a orientação antiga: um teste falhou e onze passaram.
Após a correção, os doze testes do arquivo passaram. Typecheck, lint dos arquivos
afetados, contrato fixado do hub e documentação passaram. O primeiro comando de
formatação recusou a extensão `.mdc`; a regra foi conferida em seguida com parser
Markdown explícito, sem alteração de conteúdo. A consulta inicial ao Git do hub
foi recusada pelo sandbox; repetida com acesso ao checkout adjacente autorizado,
`training:check` passou sem mudar referência ou hashes.

## Imagem e primeira rodada

Imagem candidata construída somente no Docker local:
`se7e-persona-v2:manual-20261023`.
ID resolvido pelo lançador:
`sha256:30db0a0dc31a23cbce24bf32433d2e51cd3f390fe712d5b6a0811171a941b4c2`.
Build TypeScript 7.0.2 e frontend incluídos na montagem. Não houve push/deploy.

Em fixture privada `se7e_persona_7be70f6ffcaa_test`, as duas verificações passaram
em 102,74 segundos: recusa de ACL aberta sem alteração da pasta e percurso
Chromium de persona vazia, três bases, treinamento privado, publicação com prazo
humano, token, conexão, validação e SELECT nos três motores. O valor sintético
conhecido, resultado vazio e recusa de DELETE foram verificados. Não houve fonte
do usuário, DML experimental ou aprovação técnica inventada.

**A primeira rodada não certifica candidato estável:** o guard terminou com código

1. O agente mudou entre 14:18:22 e 14:20:06 UTC. Seu hash passou de
   `7837f7b4b176096997e79bc0a3495be8d5af45368816d207ac03d1d07ff591c5`
   para `3f0ee84f8e87588eae70e4dc9281ce9e7029cd0dc2ab2e973f89441f1e9c55ab`.
   MCP e hub ficaram estáveis. O registro completo é
   `node_modules/.cache/persona-chain-sources-c0b1b089332e4514bda68f610249c0ca.json`.

O controlador confirmou parada limpa do servidor/worker e companions. O limpador
guardado removeu somente essa fixture. A aprovação dos testes não superou a
recusa do inventário. Uma janela sem edições foi coordenada antes da repetição.

## Repetição aprovada

Nova fixture `se7e_persona_ee0a1fae2d11_test`, mesma imagem candidata, autoridade
Prisma e credenciais próprias. Duas verificações passaram, sem omissões, em
**42,51 segundos**. O lançador terminou com código zero; os três inventários
permaneceram iguais entre **14:22:56 e 14:23:40 UTC**.

| Projeto | Commit-base                                | SHA-256 do snapshot local                                          | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `010fcacd8f71a999ce011d223822ab4e69ee55c8f9179f2077e06fa15dfca97c` | 1111     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `438017738cdb26215c29b588c9846ce5738fc3fde37cf9d859790a72b9c9d878` | 2716     |

Commit-base não substitui o snapshot com alterações locais. A evidência precede
este relatório e as demais atualizações documentais posteriores. Não certifica
edições futuras da outra tarefa ou do candidato.

A infraestrutura usou as imagens de fixture `postgres:17-alpine`,
`mcr.microsoft.com/mssql/server:2022-latest` e `redis:7.4-alpine`, além de SQL
Anywhere 16 e drivers locais explícitos. Essas referências de configuração não
substituem uma matriz ampliada de versões nativas/driver ou teste de carga.

O controlador confirmou `processesStopped:true` e `success:true`; o limpador
guardado removeu a fixture própria. Não ficou sessão humana aberta ou URL ativa
desta rodada. Os dados e treinamentos experimentais foram descartados.

## Alcance para o teste humano

A [sessão contínua](../homologation-chain.md#sessão-contínua-para-treinamento-manual)
permite iniciar novo ambiente vazio, privado e com prazo, usando a imagem exata
acima. Seguir o [roteiro humano](../onboarding.md#roteiro-manual-de-treinamento-no-candidato-isolado),
incluindo casos, tokens distintos e revogação. O ensaio automático inicial
usou um token para as três consultas. A ampliação abaixo verifica também dois
consumidores e retirada de concessão; não substitui esses passos humanos nem
toda a suíte de 79 cenários da cadeia, cuja evidência anterior permanece separada.

## Ampliação: tokens distintos e retirada de concessão

O helper Chromium passou a emitir outro token com somente a primeira consulta,
conferir a lista descoberta e chamar diretamente a segunda skill por MCP, usando
JSON ou SSE reais. Depois remove a concessão no editor de tokens, salva, confirma
descoberta vazia e recusa da chamada direta à primeira skill. O token independente
conserva as três concessões e consulta o valor conhecido. Logout verifica ausência
de tabela de resultados e de conteúdo em localStorage/sessionStorage.

A primeira tentativa ampliada, `se7e_persona_700772682dd9_test`, falhou na etapa
dos tokens: um teste passou e outro falhou em 50,72 segundos, com inventários
estáveis. O helper esperava somente campo não vazio após a segunda emissão, mas
o campo ainda podia conter o primeiro Bearer enquanto a resposta estava em curso.
A espera passou a exigir novo valor confirmado antes da captura. Os resultados
da tentativa falha foram mantidos; a fixture confirmou parada limpa e foi removida.
Não se atribuiu a falha a uma violação de autorização da aplicação.

A repetição usou nova fixture `se7e_persona_cc43591cf5f8_test` e a mesma imagem
candidata. **Dois testes passaram, sem omissões, em 45,40 segundos**, de
**14:35:22 a 14:36:09 UTC**. O guard confirmou fontes estáveis e código zero.

| Projeto | Commit-base                                | SHA-256 do snapshot local                                          | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `4cb769c279c14feb7f6f4ec11ec1868a165f532166ce421c6b229cf89d902671` | 1111     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `f88b767542d8e51be17771e3ab7d77c2059fc263acab7350f20d47dea158f61c` | 2716     |

As chamadas diretas recusadas retornaram `AUTHORIZATION_DENIED`; não foram
substituídas por interceptação de rede ou mocks. A consulta posterior do consumidor
independente passou pela cadeia real. Não se infere, deste recorte, ausência de
todo SQL auxiliar na recusa ou certificação da matriz de concorrência.

O supervisor confirmou `processesStopped:true` e `success:true`; somente a fixture
própria foi removida. Bearers ficaram na memória do processo/navegador, sem
screenshots, traces, armazenamento local ou relatórios. A nova cobertura foi
incorporada ao helper compartilhado pela suíte manual e pelo cenário Chromium da
cadeia integral; esta rodada executou a suíte manual, não os 79 cenários integrais.

O ensaio automatizado não é avaliação da IA ou aceite humano. HTTPS e conexão
privada ChatGPT seguem para validação manual. Instalação do aplicativo desktop,
recuperação automática e gates de produção têm evidências próprias.
`ready:false` permanece obrigatório.

Ao finalizar a documentação, `docs:check` passou com 273 documentos e 1.245 links,
sem problemas; formatação dos arquivos afetados passou. `persona:release-check`
continuou recusando publicação com código 1 por aceite incompleto. Esse é o
bloqueio esperado, não evidência de liberação ou falha do percurso manual.
