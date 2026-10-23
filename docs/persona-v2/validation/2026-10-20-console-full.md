# Regressão completa do console — 2026-10-20

## Candidato e correção

MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais.
`web/src/persona-v2/PersonaConsole.vue` SHA-256:
`6CBEFB395790B61F3933CBD9BCE790A310F8F4E2BF926E969B3D7EF004DB47C8`.

A primeira rodada encontrou rótulos de consulta alterados incidentalmente pela
exibição dos efeitos de concessões. Anexos JSON, binários e limites não
encontravam as opções pelo nome/revisão. A rodada foi interrompida após três
falhas equivalentes; seu container foi identificado e removido explicitamente,
pois a interrupção não concluiu o finally. O listener de teste não permanecia
ativo. Essa rodada não conta como regressão completa.

Corrigido o seletor de consultas e o rótulo das concessões de consulta para
preservar nome/revisão publicados. Efeitos adicionais permanecem nas concessões
de operações SQL e externas. Nenhuma autorização ou asserção foi removida.

## Rodada final

`npm run test:persona-v2:browser`, pelo wrapper Node 24:
build novo seguido de **49 testes aprovados em 4,5 minutos**, sem filtro.
Tipos e lint web passaram. A rodada final usou fixture nova e o mesmo bundle
durante toda a execução, sem reconstrução intermediária.

Cobertura exercitada: persona, múltiplas fontes, treinamento privado,
curadoria, perfis/adoção, exemplos/casos, publicação, concessões, consultas,
anexos JSON/binários, cruzamentos, preparações SQL/externas, aprovações,
conciliação, integrações, OAuth administrativo, edição pendente e cenários
móveis/teclado existentes. O throttle de login foi preservado.

PostgreSQL 17 real em container próprio, banco de controle e fontes de fixture;
hub/autenticação e provedores externos sintéticos. Credenciais aleatórias
somente no processo. Container final removido no finally; variável de conexão
descartada. Nenhuma fonte operacional utilizada.

Build mantém avisos de comentários Zod e chunk maior que 500 kB. Documentação
de onboarding agora contém roteiro manual de treinamento com resultado por
passo; instrução de saúde do worker foi alinhada ao healthcheck próprio
configurado na composição, sem porta publicada.

## Limites

Não certifica leitor de tela ou zoom real integral, instalação desktop,
imagem final, cadeia persistente dos três motores, HTTPS/ChatGPT ou IA.
Essas evidências permanecem separadas; não converter o teste de UI em aceite
de efeitos externos ou operação instalada.
Gate relacionado: oauth-and-console, ainda aberto. Ready:false e bloqueio de
deploy permanecem inalterados.
