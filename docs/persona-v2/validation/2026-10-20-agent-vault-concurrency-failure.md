# Falha de concorrência do cofre do agente — 2026-10-20

## Reprodução

Dois processos Flutter de teste usam o adapter real
`FlutterSecureTokenSecretStore` e o backend Windows DPAPI
`flutter_secure_storage_windows` 4.2.2. Cada processo grava cem chaves sintéticas
distintas após uma barreira comum. Um terceiro processo relê as duzentas chaves.
Somente a resolução do diretório de suporte é redirecionada para uma pasta
temporária exclusiva. Não há ODBC, hub, dados de negócio ou cofre operacional.

Runner reproduzível:

```powershell
& scripts/homologation/probe-persona-agent-vault.ps1 `
  -Flutter 'C:/Users/cesar/dev/flutter/bin/flutter.bat' `
  -AgentRoot 'D:/Developer/plug_database/plug_agente'
```

Fixture: `tests/fixtures/native/persona_vault_concurrency_test.dart`.
O runner cria os processos ocultos, coordena a barreira, conserva logs locais
e remove somente o diretório temporário validado. Não repete gravações falhadas.

## Resultado observado

Duas rodadas falharam. Na primeira, o escritor A encontrou falha
`CryptUnprotectData` ao ler o arquivo enquanto outro processo escrevia.
O backend tentou apagar o arquivo considerado corrompido e recebeu erro de
compartilhamento do Windows. O escritor B terminou. A leitura final encontrou
**99 das duzentas chaves ausentes ou diferentes**.

A segunda rodada, usando o runner preservado no projeto, também falhou e
encontrou 99 chaves ausentes/diferentes. Os diretórios temporários de ambas
as rodadas foram removidos. Logs permanecem em `node_modules/.cache`,
prefixo `persona-vault-`, com conteúdo exclusivamente sintético.

## Causa e trabalho necessário

O backend serializa operações somente dentro de sua instância Dart. Sua gravação
reescreve o mapa cifrado inteiro; essa exclusão não coordena processos distintos.
A proteção de instância única do desktop não demonstra proteção de todos os
consumidores do cofre, como manutenção/recuperação.

Implementação pendente: exclusão entre processos para toda operação de
leitura/modificação/gravação, tratamento limitado e explícito de espera/falha,
gravação durável que não exponha arquivo parcial e preservação de conteúdo
quando a decifragem falhar. Conferir todas as entradas de armazenamento,
compatibilidade com as cifras existentes e operações agrupadas de credenciais.

Exigir regressão concorrente e testes de interrupção/retomada antes do aceite.
O teste atual expõe a falha; não constitui correção nem comprova uma falha no
cofre operacional, que não foi acessado. Deploy permanece bloqueado.
