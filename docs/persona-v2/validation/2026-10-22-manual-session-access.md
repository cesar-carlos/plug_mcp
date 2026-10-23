# Proteção e repetição da sessão manual — 2026-10-22

## Alteração

O controlador agora verifica a ACL Windows real antes de criar o diretório da
sessão, gravar sua chave ou iniciar serviços. Exige raiz própria em Temp,
proprietário atual, herança desabilitada e somente usuário atual/SYSTEM com
permissões herdáveis. Não corrige permissões de pasta existente. Erro é seguro,
sem propagar descritor, caminho privado ou conteúdo do manifesto.

O runner versionado aceita `-Suite manual-training`, com Prisma e imagem
candidata explícitos. O padrão continua `chain`, sem prazo estendido. Contrato
e comandos estão na [cadeia](../homologation-chain.md#repetir-a-validação-técnica-da-sessão-manual).
Os blocos de limpeza do lançador foram organizados sem mudar a sua ordem.

## Evidência

- Teste Windows independente: **1/1**, 6,19 segundos. Recusou pasta sem proteção,
  preservou seu descritor e recusou concessão adicional para Users. A chamada
  direta do controlador encerrou antes de criar `chain-*`, sem expor o marcador
  privado. ACL privada correta foi aceita. Runner sem imagem ou com autoridade
  em memória foi recusado antes de iniciar a cadeia.
- Suíte manual completa pelo runner versionado: **2/2**, 45,28 segundos, sem
  filtro ou skips. Incluiu a fronteira de ACL e Chromium criando persona vazia,
  cadastrando três fontes, treinando/publicando e consultando pela cadeia real.
  Servidor/worker e companions encerraram, e a fixture própria foi removida.
- Contrato de prazo e supervisor: **5/5** unitários. Tipos, build e lint dos
  arquivos afetados aprovados; lint completo também aprovado.
- `release:check` terminou com código zero: Node 24.21.0, TypeScript 7.0.2,
  documentação, contrato do hub, lint, formatação, tipos, testes, builds e
  frontend. Raiz: **1593 aprovados e 91 omitidos** por ambiente condicional;
  web: **86/86**. Essa invocação não prova os 91 condicionais. Build web preserva
  aviso de tamanho do chunk principal; não se alterou o limite para ocultá-lo.
- Repetição da raiz com serviços próprios: **1684/1684**, 180 arquivos, sem skips,
  99,17 segundos. PostgreSQL 16.15 e Redis 7.4.9 descartáveis, nomes aleatórios
  com verificação de propriedade na limpeza. Resolve as omissões condicionais da
  invocação anterior; não certifica a matriz privada v2 ou o aplicativo instalado.
- Modo padrão `chain`: **6/6 selecionados**, 39,50 segundos, com filtro
  `consulta publicada, SQL adaptado|inspeciona metadados`. Os outros **73/79**
  cenários não foram repetidos nessa regressão dirigida. Confirma inspeção e
  consulta reais nos três motores, sem exigir ACL/prazo manual no modo padrão.

O primeiro teste no sandbox foi recusado pelo ambiente Windows/temporários do
executor. Fora dele, o teste inicialmente herdou módulos de outro PowerShell;
passou a usar o ambiente isolado de ferramentas. A preparação do cenário de ACL
adicional também revelou exigência de privilégio de auditoria no Set-Acl 5.1:
o teste usa icacls somente na sua pasta nova, sem ampliar privilégios. Essas
falhas não foram convertidas em skips nem em fallback do controlador.

## Revisões e ambiente

Janela da suíte completa: UTC **21:54:58–21:55:45**. Inventário antes/depois
estável, em
`node_modules/.cache/persona-chain-sources-f7a7cfffb2fd4308a76abcb3e59d2647.json`:

| Projeto | Commit-base                                | SHA-256 efetivo                                                    | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `a919c9155c303b16d885937ba070714bc3de19c4cd757c829273bc66be99bb07` | 1108     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `c1f21e992eb82ef1843fea007d671a972f371b6b` | `aca97e9c808fa610ef8717c16433b7e900a8130726eadf1c4279dc40a0b39f12` | 2676     |

Snapshots não são commits nem congelamento contínuo. Este documento foi incluído
depois da captura e não está retroativamente representado pelo hash MCP acima.
O inventário conserva `authorizesRelease:false`.

Na regressão padrão (UTC 22:01:00–22:01:41), o inventário
`persona-chain-sources-656d588c5d43489cb88dede18229f129.json` também ficou estável.
Commit-base e contagens permanecem os mesmos; hash MCP nessa captura:
`667082bbb371760d0cf2d5244177da12b0c96f2e5b8fa062bdbb0245e1eef6be`.
Hashes de hub/agente são os da tabela acima. Não se intercambiam snapshots.

Imagem de runtime, explicitamente reutilizada sem publicação:
`sha256:1f856f5fc85d49b6396cb29ec2eaad517e0fd4d84402a0dd88f6a0d57371491d`.
A proteção está no controlador host, não no runtime da imagem. PostgreSQL,
SQL Server e SQL Anywhere são as fixtures próprias do runner; a rodada usa o
companion com cofre nativo, não o instalador antigo ou uma base cadastrada pelo
usuário. O instalador de outra revisão não recebe certificação por este ensaio.

Versões nativas registradas pela RPC estrutural na regressão padrão:
PostgreSQL **17.0.11**, SQL Server **16.00.4236** e SQL Anywhere **16.00.0000**.
Arquivos de driver conferidos localmente nesta rodada (registro
`manual-session-access-driver-versions.json` no cache):

| Driver            | Versão               | SHA-256                                                            |
| ----------------- | -------------------- | ------------------------------------------------------------------ |
| `podbc35w.dll`    | 18.00.0000           | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| `dbodbc16.dll`    | 16.0.0.2043 (64-bit) | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| `msodbcsql18.dll` | 2018.0186.0001.01    | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

| Registro local em node_modules/.cache           | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `manual-session-access-validation.log`          | `d0966c52b03b388571ff30543d056dd12f8b5e066a7ba5aa7e1f37c486a285bd` |
| `manual-session-access-chain.log`               | `3b68b995889131505440ab9b4a8315d222985bb863e51a131cbb38f268709534` |
| `manual-session-access-release-check.log`       | `aaa83cf772ca63eb12aa174c7c5101e5f694d0b1d1c715dffbf9977cd0153c11` |
| `manual-session-access-tests-with-services.log` | `5f46e3aa508701e03e49dbe8d585140a3220a2ca3c10553d7cd1b6e2da1c876f` |
| `manual-session-access-default-chain.log`       | `63572a17928176ecfa9e38151398e7480b981d14d32b15f395b3224836910cb1` |

## Limites de conclusão

Ensaio automatizado não substitui treinamento humano, avaliação separada da IA,
instalação/recuperação completa, HTTPS ou ChatGPT. Nenhum gate foi aceito. O
manifesto permanece `ready:false`, com treze gates exigidos e nenhum concluído.
O [plano restante](../remaining-plan.md) conserva as demais etapas abertas.
