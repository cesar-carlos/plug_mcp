# Montagem isolada do aplicativo do agente — 2026-10-23

## Implementação e escopo

O agente recebeu um montador separado para o entrypoint de bootstrap já existente.
Exige commit completo explícito, raiz nova privada, Flutter e cache nativo
explícitos. Exporta os blobs Git sem alterar o checkout original; recusa links,
arquivos de ambiente versionados e mudanças no contrato de bootstrap revisado.
As derivações nativas isolam mutex, classe de janela e diretório de controle.
O contexto de bootstrap é exigido antes desses acessos; o contrato Dart conserva
raiz temporária privada e hub de loopback. A ativação de produção continua falsa.

A prova `application-build.json`, quando produzida, vincula inventários de fontes
e payload; sua leitura reconfere os arquivos. Não é prova de instalação, nem
qualifica retrospectivamente o pacote anterior `bytes_only`. A ligação dessa
prova ao empacotador de ciclo de vida ainda está pendente.

## Rodadas e correções

Commit de aplicação escolhido: `c1f21e992eb82ef1843fea007d671a972f371b6b`.
As alterações concorrentes da outra tarefa não entram nessa exportação. Não
houve uso ou substituição da DLL do checkout original.

- A exportação inicial encontrou três scripts PowerShell convertidos para CRLF
  pelo Git. O montador agora reconstrói LF somente quando o resultado corresponde
  exatamente ao blob escolhido; diferenças de conteúdo continuam recusadas.
- A regressão de caminho do Flutter com espaços falhou antes da correção.
  A chamada foi corrigida e argumentos com operadores de shell são recusados.
- A compilação privada falhou no FileTracker do MSBuild. Uma comparação no mesmo
  projeto mínimo retornou erro com o ambiente filtrado e sucesso acrescentando
  somente `SYSTEMDRIVE`. Essa variável passou à lista permitida; credenciais e
  configurações operacionais permanecem excluídas.
- A nova montagem passou a exportação e a resolução offline com lock obrigatório.
  O CMake recusou o redistribuível Visual C++ **14.42.34438.0**, inferior ao
  compilador **14.43**. A guarda foi preservada. O runtime **14.50.35719.0** do
  System32 não foi utilizado como substituto do componente de redistribuição.

Raízes das duas últimas tentativas, relativas ao agente:

- `build/homologation/windows-lifecycle-app-dcc21b4b9948`: falha do FileTracker.
- `build/homologation/windows-lifecycle-app-1c1ff4a428d9`: recusa do redistribuível.

Os processos terminaram com erro; os logs privados foram preservados. Não há
recibo de aplicativo aprovado nessas raízes. Não houve atualização do Visual
Studio, instalação de pacote, registro de serviço, UAC, commit, push ou deploy.

## Verificações

- **102 testes** do tooling de atualização aprovados, sem omissões, em 19,708 s.
- **14 regressões** do workflow aprovadas, sem omissões, em 0,182 s.
- Compilação de sintaxe dos quatro módulos Python novos aprovada.
- O job Windows existente inclui as regressões novas. Não foi executado CI remoto.

Os testes cobrem blobs e derivações, contrato de bootstrap alterado, ativação
indevida, isolamento de ambiente, recusa de payload alterado na releitura e
alteração das fontes/lock. Não substituem um build bem-sucedido nem execução do
aplicativo instalado. O montador é Python; não houve alteração de código Dart.

## Continuação

Corrigir o componente de redistribuição do compilador no ambiente de build e
repetir em raiz nova. Depois, conferir o recibo real, integrar explicitamente ao
empacotamento privado e homologar instalação/atualização/recuperação com dados de
fixture. A sessão local de treinamento manual documentada anteriormente não foi
alterada por esta rodada. HTTPS e ChatGPT continuam para validação manual.

Nenhum gate de produção foi concluído; `ready:false` permanece obrigatório.
