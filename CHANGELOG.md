# Changelog

Todas as mudanças relevantes deste servidor MCP ficam aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Categorias: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

Itens novos entram em **Unreleased**. Só promove para uma versão quando houver release explícito.

## [Unreleased]

### Added

- Cofre de credenciais do Client (`usuario_mcp` + `acesso`): e-mail, senha cifrada, `agentId`, `client_token`, dialeto.
- Token MCP opaco (um por usuário). `registrar_acesso` devolve `setupCode`/`setupUrl`; o token só aparece em `GET /setup/{code}` (HTML one-shot).
- Grafo de schema compartilhado por `agentId` (treino com `treinar_com_sql`).
- Skills (rascunho → validada → publicada) como bússola da consulta ao ERP.
- Adapter REST ao plug-server como o Client do usuário: `sql.execute` (`execution_mode: preserve`), `client_token.getPolicy`.
- Objetivo de produto documentado (`docs/product/objective.md`) e rule `product_objective`.
- Contrato de comunicação com o hub em `docs/plug-server/` alinhado a `plug_server/docs`.
- `CHANGELOG.md` e rule `changelog_and_docs`: mudanças de comportamento atualizam changelog e `docs/` na mesma tarefa.

### Changed

- Identidade: Bearer MCP = hash SHA-256 do token opaco (não JWT de conta MCP).
- Consulta: a IA deve usar `sqlModelo` de skill publicada; sem skill capaz, não inventar SQL.
- Login no hub por usuário do cofre (`UsuarioTokenManager`), não Client de serviço no `.env`.

### Removed

- Authorization Server / OAuth 2.1 próprio do MCP.
- Catálogo seed `Fonte` (`vendas` / `produtos` / `clientes`).
- Client de serviço (`PLUG_SERVER_CLIENT_*`) no ambiente de runtime.

## [0.1.0] - 2026-08-16

### Added

- Commit inicial do servidor MCP Se7e (Streamable HTTP, Express, Drizzle).
