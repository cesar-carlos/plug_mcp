# Anexos JSON e binários persona-v2

Entrega de desenvolvimento: JSON ou bytes de uma coluna física de consulta
local publicada, exclusivamente por MCP → plug_server → plug_agente. Não há
upload, URL pública assinada, exportação de catálogo, conversão para CSV/PDF/
imagem ou anexo de cruzamento. PDF/imagens já armazenados na base podem ser
baixados pelo contrato binário abaixo. A entrada legada conserva contrato separado.
Deploy permanece bloqueado na [matriz de aceite](acceptance.md).

## Publicação e concessão

O treinamento declara `attachments` com `format: "json"`, `maxBytes` e `ttlMs`.
Todos os campos retornados precisam de `uses: ["exportacao", ...]`, além dos
usos de consulta efetivamente utilizados. Campo livre sem `uses` não autoriza
exportação; pessoal/sensível exige também justificativa publicada. Segredo e
inferido nunca executam. A AST conserva a linhagem dos aliases e expressões;
uma finalidade não concede outra.

Publicação fixa uma capability `attachment-contract:<hash>` com fonte, contrato
e campos exportáveis. Exige concessão explícita no token e consentimento OAuth,
além do pacote completo. Flags de exportação reservadas em contratos antigos
não habilitam anexos. Editar rascunho, republicar ou configurar a interface não
amplia tokens ou concessões existentes.

```json
{
  "attachments": {
    "format": "json",
    "maxBytes": 1048576,
    "ttlMs": 300000
  }
}
```

Esse fragmento complementa o [treinamento de consulta](source-queries.md).

## Coluna binária publicada

`binaryAttachments` é um contrato independente do JSON, fixando tabela qualificada,
coluna, tipos de download, bytes e prazo. Exige projeção e exportação explícitas,
classificação executável e justificativa para pessoal/sensível. Publica uma
capability nova `binary-attachment-contract:<hash>`; tokens ou consentimentos
com exportação JSON não ganham esse acesso. O modelo SQL também precisa retornar
somente essa coluna. Rascunhos/publicações existentes não são reescritos.

```json
{
  "binaryAttachments": {
    "table": "dbo.documentos",
    "column": "arquivo",
    "mimeTypes": ["application/pdf", "image/png"],
    "maxBytes": 1048576,
    "ttlMs": 300000
  }
}
```

`criar_anexo_consulta({format:"binary",query:{skillIds,fonteId,params,sql?,options?}})`
aceita uma única skill, coluna direta, ORDER BY e registro comprovadamente completo.
Não aceita paginação escolhida pelo consumidor, JOIN, UNION, subconsulta,
expressão, conversão, DISTINCT, agrupamento ou limite SQL usado para esconder duplicatas. O servidor
solicita um teto de duas linhas, sem paginação gerenciada, para detectar
ambiguidade. Exige uma linha, resposta sem paginação e `truncated:false`
explícito no caminho verificado por `expectedSource`. O agente preserva esse
sinal nas respostas verificadas; ausência nunca é prova de completude.
Não exige projetar uma chave de ordenação junto do arquivo nem ordena o BLOB.
Orçamento inferior a duas linhas recusa antes do envio, sem aumentar concessões.
Vazio, NULL, arquivo vazio,
múltiplas linhas, truncamento ou completude não comprovada recusam o arquivo.
Filtros e recortes são validados normalmente; adapte apenas dentro do pacote.

O wire existente do agente normaliza bytes como base64. O adapter preserva
`odbc_type` inteiro como `odbcType` e `type_system` como `typeSystem`.
O agente identifica seus discriminantes com `type_system:"odbc_fast"`: somente
o valor 7 comprova bytes nesse namespace. Ele não é o código ODBC nativo 7,
que representa número real. Namespace ausente ou `"odbc"` admite SQL_BINARY
(-2), SQL_VARBINARY (-3) e SQL_LONGVARBINARY (-4). Namespace desconhecido,
discriminante inválido ou tipo contraditório recusam, sem inferência numérica.
Tipos nativos explícitos `bytea`,
`binary`, `varbinary`, `long binary`, `image` e `blob` também são aceitos.
Metadados ausentes, conflitantes, duplicados ou associados a outro alias recusam.
Texto que parece base64 nunca é inferido como arquivo. Somente base64 canônico
do wire é aceito, dentro do limite antes/depois da decodificação; arrays, objetos,
hexadecimal e valores do consumidor não são formatos alternativos.

Assinatura dos bytes escolhe PDF, PNG, JPEG ou WebP somente se o MIME foi
publicado. `application/octet-stream`, quando explicitamente publicado, permite
download opaco `.bin`, inclusive para formatos não reconhecidos. Nome e extensão
são gerados pelo servidor, sem filename/MIME provenientes de campos ou da IA.
Identificar assinatura não certifica integridade, segurança ou validade completa
do arquivo. Não renderizar, executar, extrair ZIP ou converter conteúdo no MCP.

Consultas comuns/JSON não projetam a coluna declarada binária, inclusive sem
metadados de resposta. Demais resultados com metadados binários também são
recusados nessas interfaces. A tool de criação devolve somente descritor;
bytes saem por leitura/download autorizados, com o MIME efetivo e o mesmo
vínculo, cifra, quotas, prazos e revalidação do JSON. Download HTTP usa disposição
`attachment`, `nosniff` e CSP sandbox; MCP devolve resource base64, sem imagem
inline ou promessa de suporte de renderização pelo cliente.
O descritor binário conserva proveniência com fonte, leitura, publicações/hashes
e versões compartilhadas utilizadas, sem SQL, filtros ou valores de parâmetros.

## Criar e ler

- `criar_anexo_consulta({format:"json",query:{skillIds,fonteId,params,sql?,options?}})`:
  ação explícita que executa um SELECT fresco, sem cache/singleflight, com todas
  as validações normais. Não converte resultado de consulta anterior em arquivo.
- `obter_anexo({handle})`: devolve descritor e resource MCP com JSON ou bytes em base64,
  somente após nova autorização. `resources/read` aceita
  `anexo://{personaId}/{handle}`; não há enumeração de handles.
- GET no `downloadPath` devolvido: `/api/consumer/bearer/attachments/{handle}`
  para token manual ou `/api/consumer/oauth/attachments/{handle}` para OAuth.
  Exige Authorization Bearer da mesma conexão, nunca cookie administrativo.
  Host e Origin fornecido são verificados; cliente nativo pode omitir Origin.
  Sem HEAD, ranges, redirects, streaming parcial ou download anônimo.

O arquivo JSON contém colunas, linhas escalares, proveniência, completude, paginação
e limites; não contém SQL, parâmetros, credenciais ou treinamento. Decimais
textuais e nulos são preservados. Uma página/truncamento continua parcial,
sem total inventado. Download não executa novamente SQL de negócio nem renova
o horário da leitura; pode inspecionar metadados fixos pelo hub/agente.

## Isolamento e revalidação

Handle aleatório de 256 bits, sem nomes ou IDs embutidos, ligado à persona e
versão, token e versão e concessão OAuth específica. Bearer manual, outro token
da mesma persona e outra concessão não podem ler o arquivo. Refresh da mesma
concessão não estende a validade original.

Criação e leitura conferem autoridade local, publicação/conhecimento, fonte,
credencial, limites, revisão física, JWT Client, ClientAgentAccess, identidade
e fingerprint da policy vigente. Revalidam antes da entrega; diagnóstico ou
emissão de handle não reserva autorização. Mudança de policy recusa o anexo.
Revogação, suspensão, expiração, fonte substituída, operação pendente/incerta
ou revisão física alterada impedem entrega. Escrita confirmada ou incerta em
outro vínculo da mesma base invalida o anexo sem compartilhar resultados.

Conhecimento compartilhado exige `sourceSchema` e, quando necessário,
`sourceConstraints` vigentes. Antes da entrega, metadados das dependências
utilizadas são conferidos em páginas fixas de até quatro recursos. Prova parcial
ou desconhecida recusa; incompatibilidade comprovada suspende somente as
publicações utilizadas. Mudança em coluna não utilizada não bloqueia sozinha.
Não se afirma snapshot distribuído nem detecção de toda escrita externa ao MCP.

## Limites e armazenamento

Vale o menor limite vigente. Arquivo até 8 MiB; validade até quinze minutos,
reduzida pelo contrato, token e concessão/access original. Tempo total inclui
consulta, verificações e auditoria. Timeout não repete nem promete cancelar SQL
já enviado. O envelope base64 MCP também precisa caber no orçamento de bytes;
se não couber, usar download HTTP autorizado, sem ampliar esse orçamento.

Conteúdo e evidências operacionais ficam cifrados no PostgreSQL de controle v2,
na tabela `persona_attachment_v2` da migration aditiva 0039. Não são auditoria,
cache Redis ou conhecimento compartilhado. O banco conserva somente hashes do
handle/vínculo/origem, prazo e envelope AES-GCM; nenhum handle bruto, SQL ou
resultado em claro. O envelope autenticado fixa também esses hashes e o prazo,
impedindo que copiar uma cifra a outro registro transfira o arquivo.

Instâncias com o mesmo banco dedicado, origem canônica `PUBLIC_BASE_URL` e
keyring compatível recuperam o anexo após reinício, dentro do prazo original.
Não há configuração adicional nem fallback para memória em caso de falha.
Outra origem, token/versão, persona/versão ou concessão continuam sem acesso.
O consumidor precisa conservar a referência original; não há listagem, busca
ou recuperação de handles perdidos. O console não passa a persistir esses dados.
Cada leitura recuperada percorre os mesmos portões locais e remotos antes da
entrega. Recuperar não refaz SELECT de negócio, renova prazo ou restaura
permissões. Falha/ausência não dispara nova consulta; criação exige outra ação
explícita. Encerrar uma instância não apaga arquivos de outra.

Quotas: oito arquivos/32 MiB cifrados por vínculo de consumidor;
64 arquivos/128 MiB cifrados no banco de controle inteiro, incluindo as instâncias.
Guard transacional serializa inserções sob lock e conta todos os payloads retidos,
inclusive expirados ainda não limpos; worker parado não permite acúmulo sem limite.
Exige isolamento read committed. Excesso recusa sem expulsar arquivos válidos;
aguardar limpeza dos expirados libera espaço.
Payload operacional serializado tem teto de 24 MiB e também precisa caber na
quota cifrada. Inserções usam limites locais de lock/comando de cinco segundos.
Conteúdo, vínculo e deadline são imutáveis; apenas operador autorizado pode
recifrar o payload pelo procedimento do cofre, sem alterar os demais campos.
Upgrade é recusado enquanto existir rotação em andamento.

Expiração é conferida pelo relógio do banco e da aplicação; voltar o relógio da
aplicação não torna utilizável registro expirado no banco. O worker temporário
remove até cem expirados por rodada com lease/CAS e SKIP LOCKED. Remoção física
ocorre no próximo lote disponível; vencimento já impede leitura. Chaves e backups
seguem a política operacional do cofre, sem promessa de apagar cópias de backup
no instante da expiração. Instância incapaz de autenticar a cifra recusa o arquivo
sem destruir a cópia recuperável; acesso revogado/incompatível nunca entrega bytes.

Criação só entrega o handle após armazenamento e auditoria/revalidação. Falha
posterior remove o registro daquele vínculo; se o banco ficar indisponível,
um eventual registro órfão permanece sem handle divulgado e expira normalmente.
Timeout não publica handle tardio nem repete SQL. A implementação em memória
permanece apenas para testes unitários, fora da composição v2.

O papel do servidor precisa de SELECT, INSERT e DELETE nessa tabela; o worker,
SELECT e DELETE. UPDATE não é necessário ao runtime: recifra segue o papel e a
função restritos do [operador do cofre](vault-rotation.md). A implantação deve
conceder esses privilégios explicitamente, sem tornar o runtime operador.

Respostas usam `no-store, private`, `nosniff`, `no-referrer` e nome independente
do handle. Navegador conserva Bearer/descritor apenas em memória, aborta download
e limpa contexto ao mudar consulta/token/persona ou encerrar sessão. O arquivo
que o usuário decidiu salvar fica sob sua guarda; revogação não o apaga.

Migration aditiva 0038 registra ID independente, tamanho, fonte, publicação,
consumidor, horário e resultado em auditoria transacional. Não registra handle,
SQL, parâmetros ou linhas. `attachment.downloaded` comprova autorização e
materialização para entrega; não certifica recebimento pela rede. Sem auditoria
transacional, a aplicação não entrega handle/bytes.

## Validação e pendências

Testes cobrem concessões antigas, finalidade/linhagem, outro consumidor/OAuth,
revogação durante leitura, revisão física, prazo, quotas, corrupção, metadata,
HTTP/MCP/resource e fluxo móvel do console. A [rodada persistente binária](validation/2026-10-16-binary-chain.md)
validou bytes, tipos, completude, isolamento, revogação e reinício pela cadeia
real dos três motores em fixtures próprias, com hub Prisma e cofre DPAPI.
Isso não certifica a implantação ou todas as extensões nativas de BLOB.
HTTPS público e instalação no ChatGPT permanecem para validação manual.
Armazenamento compartilhado e recuperação estão implementados em desenvolvimento;
uma [rodada própria](validation/2026-10-16-shared-attachments.md) passou na cadeia
persistente dos três motores e em testes PostgreSQL nativos de concorrência,
quotas, expiração, worker, rotação e recuperação OAuth. Não encerra gates;
matriz operacional ampliada e candidato final continuam pendentes no
[plano restante](remaining-plan.md).
