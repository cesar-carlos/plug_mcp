# Gestão de integrações no console — 2026-10-19

Evidência parcial de desenvolvimento da persona-v2. Escopo: listagem/impacto,
suspensão, recuperação sem reativação e rotação de credenciais pelo responsável.
Não certifica provedor instalado, HTTPS público, conexão ChatGPT, frota, IA
consumidora ou cadeia SQL dos três motores. Deploy permanece bloqueado.

## Implementação

Painel Integrações usa sessão Client e os portões HTTP existentes. Mostra
metadados, estado local, revisões e publicações pelo snapshot; não lê segredos.
Revisão fixa fingerprint e versão de gestão, conferidos na mesma transação da
mutação/auditoria. Prova do hub fica fora dos locks, sem atomicidade distribuída.

Suspensão distinta de aguardar publicação bloqueia rede/publicação e invalida
prévias. Recuperação mantém integração/operações desativadas e publicações
suspensas; não restaura concessões. Rotação reautentica o mesmo Client, fixa
destino/tipo/nome, cifra credencial técnica Bearer/API key/Basic e preserva a
suspensão. Não testa o provedor nem executa ações. Consumer setups mantêm seus
portões de consentimento/delegação e também avançam a revisão de gestão.

Credenciais são descartadas após tentativa, troca de contexto e encerramento.
Formulário protege edição, bloqueia submissão duplicada e exige recarregar o
impacto após falha/confirmação perdida. Reautenticação limita tentativas por
IP/instância; não renova silenciosamente a sessão original. Journals, payloads,
comprovantes e estados desconhecidos não são modificados.

Migration aditiva `0040_integration_lifecycle.sql` mantém os dados existentes e
acrescenta revisão de gestão/suspensão explícita. Não altera migrations aplicadas,
não importa legado ou modifica armazenamento do hub/agente/bases de negócio.
Cadastro inicial por consumidor continua no setup temporário; não foi adicionado
cadastro direto pelo responsável neste bloco.

## Verificação

Fixture própria `se7e-integration-management-d6ce9a487086`, PostgreSQL de controle
em loopback, bancos `_test` e segredos aleatórios. Hub sintético e composição MCP
real. Nenhuma fonte ou credencial do usuário foi utilizada. Fixtures TLS externas
continuam locais, com resolver/CA próprios, sem homologar a rede pública.

PostgreSQL verifica mesmo responsável, tipos de credencial, CAS concorrente,
isolamento por persona, suspender/recuperar sem ressurreição, prévia antiga
recusada e rollback integral quando auditoria falha. Journal desconhecido mantém
conteúdo/estado/fingerprint sem reenvio. Migrations são aplicadas/reaplicadas em
controle vazio; runner legado permanece recusado. Rotação do cofre é verificada
separadamente da rotação da credencial técnica.

Chromium percorre REST/MCP com os três tipos de credenciais, impacto, confirmação,
edição protegida, falha de resposta, descarte de segredos e ausência de restauração
de operações/journals. Verifica ausência de segredo em URL/storage e larguras
360/390/768/1280. Não certifica zoom de 200% ou leitor de tela.

Ambiente: Node 24.21.0, TypeScript real 7.0.2, PostgreSQL 17.11 e Chromium
153.0.8010.12.

| Verificação                                               | Resultado                               | Duração  |
| --------------------------------------------------------- | --------------------------------------- | -------- |
| Chromium completo                                         | 42 aprovados, sem skip                  | 4,2 min  |
| Chromium dirigido de gestão                               | 2 aprovados, sem skip                   | 7,7 s    |
| PostgreSQL: administração, migrations e cofre             | 87 aprovados, sem skip                  | 108,87 s |
| PostgreSQL: migration com prova adicional de upgrade 0039 | 20 aprovados, sem skip                  | 10,97 s  |
| Frontend                                                  | 63 aprovados, sem skip                  | 1,96 s   |
| Suíte geral                                               | 1.486 aprovados; 91 skips preexistentes | 107,83 s |

A prova adicional de upgrade foi acrescentada depois da rodada PostgreSQL de
três arquivos. Reproduz as migrations originais até 0039 num banco novo, com
checksums originais, credencial cifrada e estado ativo; aplicar/reaplicar 0040
preserva os campos anteriores. Não faz downgrade nem altera ledger já aplicado.
Os vinte casos incluem repetições da suíte de migrations; não devem ser somados
aos 87 como casos distintos. Skips da suíte geral não homologam infraestrutura
ou motores ausentes.

Uma rodada intermediária recusou corretamente undefined no contrato da fixture;
o teste foi ajustado para enviar JSON como o navegador. Rodadas finais usam esse
contrato válido e comprovam o consumo da prévia anterior à suspensão. Node,
compiler, tipos/lint servidor e frontend, builds, formatação, `training:check` e
`docs:check` passaram. A regressão completa usa o bundle final do console.

Revisões conferidas: MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985`, agente
`993a69651fd94cb3019f5303697e28daebd6ef6f`. O agente não é exercitado nesta
frente; seu HEAD observado não é certificação da cadeia instalada. O
[inventário SHA-256](2026-10-19-integration-management-files.json) fixa arquivos
e assets desta frente, com alterações locais preservadas. Snapshot não é commit;
evidências históricas não certificam este candidato.

Limpeza confirmada: contêiner exclusivo, dez bancos de fixture, um volume
anônimo e diretório temporário com segredos removidos. Estado do navegador foi
removido após conferir seu vínculo. Três diretórios dos provedores TLS do
navegador foram removidos após conferir nomes/horários exatos e ledger vazio.
Nenhum listener permaneceu na porta 5188; recursos operacionais não foram limpos.

## Liberação

HTTPS e ChatGPT seguem para validação manual. Manifestos dos três projetos
mantêm `ready: false`. Sem branch, commit, push, publicação de imagem ou deploy.
