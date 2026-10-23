# Rotação do cofre persona-v2

Manutenção de operador disponível em desenvolvimento. Não é uma ferramenta MCP,
rota administrativa, job automático ou permissão delegável por token. Não muda
Bearer, credencial de negócio, treinamento, concessões ou resultado de operação.
Deploy continua bloqueado. O comando legado `vault:rotate` não cobre o domínio v2.

## Escopo e proteção

O inventário fechado cobre dezesseis colunas em onze tabelas: três credenciais da
fonte, credencial da integração, delegação do responsável, payload SQL,
payload/result externo, destino/segredo de outbox, contexto de setup, registro
OAuth, payload da biblioteca editorial, destino/segredo de notificações e
payload cifrado dos anexos compartilhados. Anexos mantêm handle por hash,
origem, consumidor e prazo; recifrar não autoriza nem estende download.
Valores nulos permanecem nulos.
Não abre o ERP, hub, agente ou serviço externo e não importa cifras legadas.
Cofre v2 exige envelope AES-GCM `v2.<keyId>...`; formato v1 é recusado.

O operador decifra, recifra e verifica igualdade em memória. Conteúdo claro,
cifras e valores de chave não aparecem nos relatórios, erros ou journal. O
envelope mantém nonce aleatório e AAD de versão/ID. O banco guarda apenas IDs
de chave, tags HMAC de confirmação com contexto próprio, cursores e contagens.
Um ID não pode receber outro material de chave; mudar só o ID não constitui
rotação e é recusado quando reutiliza material conhecido no keyring/chave ativa.

Migrações aditivas `0030_vault_rotation.sql` e `0031_vault_rotation_integrity.sql`
acrescentam estado ativo, journal, autorização interna e guards. Não alteram
migrations anteriores. O inventário de colunas cifradas no catálogo PostgreSQL
deve coincidir com o do operador; coluna nova não coberta impede execução.
Migrations 0032/0033 acrescentam a configuração de notificações ao final do
inventário e recusam upgrade concorrente com rotação. Concluir a rodada antes
de migrar; não reinterpretar um cursor antigo com outra ordem de tabelas.
Migration 0039 acrescenta anexos ao final e também recusa rotação em andamento.

As exceções aos guards imutáveis exigem papel PostgreSQL de operador, lock de
sessão, job vigente e autorização interna vinculada ao backend, transação,
relação e hashes das linhas completas antes/depois. A função só aceita colunas
cifradas existentes, não nulas, da lista fechada. Substituição fora do inventário
ou divergência do CAS é recusada. Nada desabilita triggers durante a rotação.
Versões de negócio, hashes de publicação, deadlines, estados, aprovações,
comprovantes e metadados de retenção permanecem iguais, inclusive em desconhecidos.
O banco comprova escopo/CAS e autoridade do operador; a equivalência do conteúdo
criptográfico é verificada pelo comando, que é parte confiável da manutenção.

## Papel do operador

O DBA cria uma vez o papel `persona_v2_vault_operator` sem login e concede a um
login dedicado de manutenção. O login do servidor/worker não pode ser membro,
superusuário, dono das tabelas privadas de manutenção ou ter permissão de criar
papéis/funções nesse escopo. Conhecer um ID ou definir um GUC não autoriza rotação.
Migrations não criam logins, senhas ou papéis globais automaticamente.

Exemplo de grants para o papel, na base MCP v2 dedicada:

```sql
CREATE ROLE persona_v2_vault_operator NOLOGIN;
GRANT USAGE ON SCHEMA public TO persona_v2_vault_operator;
GRANT SELECT ON mcp_schema_generation, _persona_v2_migrations TO persona_v2_vault_operator;
GRANT SELECT, INSERT ON persona_vault_key_binding_v2 TO persona_v2_vault_operator;
GRANT SELECT, INSERT, UPDATE ON persona_vault_active_key_v2, persona_vault_rotation_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(email_enc, senha_enc, client_token_enc) ON fonte_credencial TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(credencial_enc) ON integracao TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(credential_enc) ON responsavel_delegacao_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(payload_enc) ON operacao_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(payload_enc, result_enc) ON external_action_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(destino_enc, segredo_enc) ON outbox_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(contexto_enc) ON setup_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(conteudo_enc) ON oauth_registro_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(payload_enc) ON knowledge_library_version_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(destino_enc, segredo_enc) ON persona_notification_endpoint_v2 TO persona_v2_vault_operator;
GRANT SELECT, UPDATE(payload_enc) ON persona_attachment_v2 TO persona_v2_vault_operator;
```

O DBA concede a associação ao login escolhido fora deste exemplo. UPDATE nas
colunas cifradas é necessário para locks de linha; não concede alteração de
estados/permissões ou torna mutáveis os registros protegidos. Não conceder acesso
à tabela interna `persona_vault_rewrap_permit_v2`. Functions de manutenção usam
escopo fixo e verificam o login original, inclusive quando são SECURITY DEFINER.
O operador continua sendo uma identidade privilegiada de infraestrutura.

## Procedimento

1. Confirmar backup/restauração e guardar todas as chaves necessárias aos backups.
   Usar primeiro fixture dedicada. Pausar novas escritas e concluir chamadas em
   andamento antes de trocar a configuração das instâncias.
2. Configurar pelo gerenciador de segredos o novo `MCP_ENCRYPTION_KEY` e
   `MCP_ENCRYPTION_KEY_ID`, mantendo as anteriores em
   `MCP_ENCRYPTION_PREVIOUS_KEYS`. Preferir chave aleatória de 256 bits em hex.
   Não colocar material em argumentos, mensagens, examples, pacotes ou logs.
3. Usar `DATABASE_URL` do login de manutenção na base MCP v2 exata. O comando
   verifica geração/checksums, papel e inventário antes de tocar dados. Recusa
   banco vazio/legado/sistema e `NODE_ENV=production` durante a transição.
4. Executar a simulação; nenhum registro, chave ativa ou progresso é gravado:

```sh
npm run vault:rotate:persona-v2 -- --simulate
```

5. Aplicar com confirmação do nome exato do banco. Exemplo apenas de fixture:

```sh
npm run vault:rotate:persona-v2 -- --apply --confirm-database=se7e_persona_fixture_test --batch-size=20
```

O comando faz novamente a preflight completa antes da aplicação. Lock consultivo
de sessão é exclusivo; desconexão o libera. Cada lote de até cem linhas (padrão
vinte) grava cifras e cursor/contagens na mesma transação. Locks de linha esperam
até cinco segundos, sem pular registros; conflito reverte o lote. A simulação
usa snapshot somente leitura; não reserva dados ou autoridade para outra rodada.

Ativar a chave fixa o ID aceito para novas cifras no banco. Escritor desatualizado
é recusado; não pode reintroduzir chaves antigas atrás do cursor. Servidor/worker
revalidam chave ativa e tags ao iniciar; job em andamento exige o keyring registrado
naquela rodada. Não há atualização automática da configuração dos outros processos.
Liberar tráfego somente nas instâncias preparadas; leitores antigos ainda em voo
podem falhar ao encontrar uma cifra nova, sem fallback ou recuperação de segredo.

## Pausa, falha e retomada

`--max-batches=1` pausa deliberadamente após um lote e devolve `status: running`
e `runId`. Interrupção/perda de confirmação não autoriza criar outra rodada.
Consultar o journal pelo operador e retomar explicitamente o ID com o mesmo
keyring, nome de banco e chave de destino:

```sh
npm run vault:rotate:persona-v2 -- --apply --confirm-database=se7e_persona_fixture_test --resume=11111111-1111-4111-8111-111111111111
```

O UUID é ilustrativo: usar o runId realmente gravado. O cursor confirmado é
durável; transação interrompida não registra avanço. Commit incerto é resolvido
lendo o journal na retomada. Não restaurar manualmente cursor, cifras ou status.
Chave faltante, tag GCM inválida, key ID com material divergente, inventário novo
ou CAS incompatível bloqueiam a rodada; corrigir a causa sem retirar chaves antigas.

Ao terminar todas as tabelas, uma nova verificação integral autentica as cifras
atuais e exige ausência de envelopes antigos. Somente então marca `completed`.
IDs de chave e rodadas concluídas são permanentes e não podem ser restaurados
a running. Retomar rodada concluída só confirma o vínculo vigente e seu resultado.
Relatórios guardam contagens de células verificadas/alteradas e ID da rodada;
escritas concorrentes na chave atual podem acrescentar células fora desses totais.

Remover chaves antigas da configuração apenas após conclusão, verificação de
todas as instâncias e teste de restauração dos backups que precisem delas. A
rotação não apaga chaves do gerenciador de segredos, não testa backup automaticamente
e não autoriza deploy. Recuperação de dados/chave perdida exige procedimento de
backup, não captura do Bearer ou de senhas dos clientes.
