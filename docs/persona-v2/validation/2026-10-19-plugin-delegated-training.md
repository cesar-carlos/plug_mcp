# Treinamento delegado no pacote privado — 2026-10-19

## Entrega

Skill administrativa v2 passa a orientar ferramentas já implementadas de
rascunho, casos/relatórios, template exato e revisão/publicação. Usa schemas
descobertos, revisão/CAS e teto de autoridade; não captura consultas, converte
casos antigos, inventa relatórios ou herda concessões. Prazo futuro é definido
pelo responsável no console; runner permanece separado e aprovação de efeitos
continua humana. Pacote legado e identidades/conexões existentes preservados.

Catálogo do verificador admite essas ferramentas como condicionais à delegação.
Ausência de ferramentas básicas continua reprovando. Instruções não anunciam
gestão editorial irrestrita ou execução de testes pelo MCP.

## Evidência e limites

26 testes dos dois arquivos de empacotamento passaram em 1,45 s, incluindo
variantes v2 portátil/ChatGPT, isolamento legado, manifests, inventário/hashes,
links, segredos e recusa de sobrescrita. Fixture usa domínio/ID sintéticos somente
no teste, sem instalação ou alteração de conexão real. Diretórios removidos pelo
teardown dos testes. Tipo TypeScript conferido.

A primeira tentativa foi bloqueada no rename pelo diretório temporário do
sandbox. Repetição no workspace passou 25 testes e foi bloqueada ao criar link
simbólico. Rodada final autorizada criou/recusou o link na fixture e passou todos,
sem remover o caso ou enfraquecer validação.

training:check passou com leitura autorizada do checkout hub após bloqueio do
sandbox. Referência preservada: 76950497dc386130e13b7d6afc0678e50208e985.
Não foi necessário editar contrato, snapshot ou index do hub.

Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais em skill,
catálogo do pacote e teste. Verificação offline não certifica descoberta em
cliente real, implantação HTTPS, IA ou cadeia dos três motores. Nenhuma
instalação/upload/publicação foi realizada. Deploy continua bloqueado.
