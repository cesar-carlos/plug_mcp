# Cadastro direto de integrações — 2026-10-19

Evidência parcial de desenvolvimento: responsável cadastra REST ou MCP remoto
diretamente no console. Não certifica provedor real, HTTPS público, ChatGPT,
agente instalado, motores de negócio ou IA consumidora. Deploy continua bloqueado.

## Comportamento

Em Integrações → Cadastrar integração, informar nome, tipo, destino HTTPS público
e credencial técnica Bearer, API key em header ou Basic. Reautenticar o mesmo
Client responsável e confirmar o cadastro. Sessão, CSRF/Host/Origin e autoridade
vigente são conferidos no servidor; chamadas ao hub ficam fora dos locks MCP.
A reautenticação não renova a sessão nem cria delegação de consumidor.

Cadastro/auditoria são atômicos. Credencial técnica fica cifrada; senha/JWT do
hub são transitórios. A integração nasce inativa, sem operações, skills,
publicações, casos, grants ou chamadas ao provedor. Reutiliza persistência
existente, sem nova migration ou alteração de migration aplicada. Setups dos
consumidores conservam consentimento e delegação independentes.

UUID fixo da tentativa impede duplicação concorrente/replay, inclusive com
conteúdo alterado. Após erro, segredos são descartados e novo envio fica bloqueado
até conferir a lista. Perda da confirmação após commit localiza o cadastro original
sem reenviar, recuperar credenciais ou presumir falha da gravação. O navegador
protege edição, descarta respostas de contexto antigo e limpa os segredos no
encerramento. Fechar/recarregar descarta a tentativa em memória: conferir a lista
antes de novo cadastro. Cada endpoint de cadastro/rotação limita dez tentativas
por IP/minuto/instância, além dos controles administrativos.

## Verificações

Fixture exclusiva `se7e-integration-create-4d1c9627b401`: PostgreSQL de controle
em loopback, bancos `_test`, senha aleatória e hub sintético. Composição MCP real,
sem acessar fontes/credenciais do usuário. Cadastro não chama serviço externo.
A suíte de navegador também usa provedor TLS local para cenários preexistentes;
isso não homologa HTTPS público ou um provedor instalado.

PostgreSQL cobre três tipos de credencial, cifra, autoria/auditoria sem segredos,
replay concorrente, recusa de outro conteúdo no mesmo UUID, outra persona,
reautenticação de outro Client, suspensão antes do commit e rollback integral
quando a auditoria falha. HTTP cobre sessão/CSRF/Origin, confirmação explícita,
destino inválido e resposta sem credenciais. Nenhum cadastro habilita operações.

Chromium cria três conexões de cada tipo REST/MCP, confere cifra/inatividade,
ausência de skills/operações e descarte dos segredos. No REST, a primeira gravação
passa pelo servidor real e perde somente a confirmação: conferir a lista encontra
o UUID sem segundo POST. Verifica edição protegida, URL/storage sem segredos e
larguras 360/390/768/1280. Não certifica zoom real de 200% ou leitor de tela.

Ambiente: Node 24.21.0, TypeScript real 7.0.2, PostgreSQL 17.11 e Chromium
153.0.8010.12.

| Verificação               | Resultado                               | Duração |
| ------------------------- | --------------------------------------- | ------- |
| PostgreSQL: administração | 68 aprovados, sem skip                  | 39,60 s |
| Chromium dirigido         | 2 aprovados, sem skip                   | 11,4 s  |
| Chromium completo         | 44 aprovados, sem skip                  | 4,4 min |
| Frontend                  | 63 aprovados, sem skip                  | 886 ms  |
| Suíte geral               | 1.486 aprovados; 91 skips preexistentes | 72,88 s |

Rodadas iniciais apontaram uma expectativa de teste incorreta para recusa CSRF,
uma referência global do navegador e anotações exigidas pelo lint. Corrigidas;
as rodadas finais acima não têm essas falhas. Skips gerais não comprovam
infraestrutura ausente. Os casos dirigidos são subconjunto da rodada completa,
sem somar contagens como se fossem testes distintos.

Node, compiler, tipos/lint servidor e frontend, builds, formatação,
`training:check` e `docs:check` integram a verificação desta frente.

## Candidato e limites

Revisões observadas: MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub
`76950497dc386130e13b7d6afc0678e50208e985`, agente
`993a69651fd94cb3019f5303697e28daebd6ef6f`. Hub/agente não são homologados nesta
frente: autoridade é sintética e cadastro não executa SQL. Alterações locais
foram preservadas; HEAD não identifica sozinho o candidato. O
[inventário SHA-256](2026-10-19-integration-create-files.json) fixa os arquivos
relevantes e o bundle utilizado, sem certificar todo o plano restante.

Limpeza confirmada após encerrar o navegador: contêiner exclusivo, seu volume
anônimo e oito armazenamentos de bancos da fixture removidos, junto aos segredos
temporários e estado do navegador. Dois diretórios TLS próprios foram removidos
após conferir nomes, horários, ausência de links e ledger vazio. Nenhum listener
permaneceu na porta 5188; recursos operacionais não foram limpos.

HTTPS e ChatGPT permanecem para validação manual. Manifestos dos três projetos
conservam `ready: false`, treze gates exigidos e nenhum concluído. Nenhum gate
foi encerrado; sem branch, commit, push, imagem publicada ou deploy.
