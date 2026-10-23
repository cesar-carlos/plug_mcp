import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ConsumerIdentity, AdministrativePermission } from "../../domain/persona-v2/model.js";
import type { PersonaCatalog } from "../../application/persona-v2/catalog.js";
import {
  draftInputSchema,
  caseInputSchema,
  editableSkillCaseSchema,
  sqlExampleInputSchema,
  deactivateSqlExampleSchema,
} from "../../application/persona-v2/catalog.js";
import {
  proposeForSkillSchema,
  ownProposalsSchema,
  type PersonaKnowledgeTraining,
} from "../../application/persona-v2/knowledge-training.js";
import type { PersonaDelegatedTokens } from "../../application/persona-v2/delegated-tokens.js";
import {
  type PersonaExternalIntegrations,
  externalDraftCreateSchema,
  externalDraftUpdateSchema,
  externalImportSchema,
} from "../../application/persona-v2/external-integrations.js";
import {
  integrationManagementConfirmationSchema,
  type PersonaIntegrationManagement,
} from "../../application/persona-v2/integration-management.js";
import type { PersonaSchemaInspection } from "../../application/persona-v2/schema-inspection.js";
import {
  templateDraftImportSchema,
  templateReadSchema,
} from "../../application/persona-v2/knowledge-library-schema.js";
import {
  proposePhysicalForSkillSchema,
  ownPhysicalProposalsSchema,
  type PersonaPhysicalCuration,
} from "../../application/persona-v2/physical-curation.js";
import {
  schemaInspectionSchema,
  composeStructureEvidenceSchema,
} from "../../domain/persona-v2/source-schema.js";
import {
  delegatedTokenEditSchema,
  delegatedTokenReferenceSchema,
} from "../../application/persona-v2/delegated-tokens.js";

export const registerPersonaAdministrativeTools = (
  server: McpServer,
  input: {
    identity: ConsumerIdentity;
    permissions: readonly AdministrativePermission[];
    catalog: PersonaCatalog;
    tokens: PersonaDelegatedTokens;
    externalIntegrations?: PersonaExternalIntegrations;
    integrationManagement?: PersonaIntegrationManagement;
    inspection?: PersonaSchemaInspection;
    knowledgeTraining?: PersonaKnowledgeTraining;
    physicalCuration?: PersonaPhysicalCuration;
    run: (
      action: () => Promise<unknown>,
    ) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
  },
): void => {
  const { identity, catalog, run } = input;
  const scope = z.strictObject({ skillId: z.uuid() });
  const annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  if (input.externalIntegrations) {
    const external = input.externalIntegrations;
    if (input.permissions.includes("treinar")) {
      server.registerTool(
        "listar_rascunhos_externos",
        {
          description:
            "Lista rascunhos somente das integrações concedidas para gestão. Não autoriza execução.",
          inputSchema: z.strictObject({}),
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async () => run(() => external.drafts(identity, identity.personaId)),
      );
      server.registerTool(
        "obter_rascunho_externo",
        {
          description: "Lê contrato editorial da integração concedida, sem credenciais.",
          inputSchema: scope,
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async ({ skillId }) => run(() => external.detail(identity, identity.personaId, skillId)),
      );
    }
    if (input.permissions.includes("gerenciar_integracoes")) {
      server.registerTool(
        "propor_contrato_externo",
        {
          description:
            "Interpreta OpenAPI JSON sem buscar URLs ou descobre initialize/tools/list do MCP remoto concedido. Retorna propostas, sem salvar, executar ou publicar.",
          inputSchema: z.strictObject({ import: externalImportSchema }),
          annotations: {
            ...annotations,
            readOnlyHint: true,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async ({ import: proposal }) =>
          run(() => external.importCandidates(identity, identity.personaId, proposal)),
      );
      server.registerTool(
        "criar_skill_externa",
        {
          description:
            "Cria somente rascunho na integração concedida; não publica, concede acesso ou envia efeito.",
          inputSchema: externalDraftCreateSchema,
          annotations,
        },
        async (args) => run(() => external.create(identity, identity.personaId, args)),
      );
      server.registerTool(
        "editar_skill_externa",
        {
          description:
            "Edita rascunho externo por revisão. Contratos publicados exigem nova skill/operação.",
          inputSchema: externalDraftUpdateSchema.extend({ skillId: z.uuid() }),
          annotations,
        },
        async ({ skillId, ...args }) =>
          run(() => external.update(identity, identity.personaId, skillId, args)),
      );
    }
    if (input.permissions.includes("publicar")) {
      server.registerTool(
        "revisar_publicacao_externa",
        {
          description:
            "Prepara revisão exata com relatório atual e prazo previamente definido pelo responsável. Não publica.",
          inputSchema: scope,
          annotations,
        },
        async ({ skillId }) => run(() => external.preview(identity, identity.personaId, skillId)),
      );
      server.registerTool(
        "publicar_skill_externa",
        {
          description:
            "Consome prévia vigente da mesma autoridade; não concede execução nem aprova efeitos.",
          inputSchema: scope.extend({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) }),
          annotations,
        },
        async ({ skillId, confirmationHash }) =>
          run(() => external.publish(identity, identity.personaId, skillId, confirmationHash)),
      );
    }
  }
  if (input.permissions.includes("gerenciar_integracoes") && input.integrationManagement) {
    const management = input.integrationManagement;
    server.registerTool(
      "listar_integracoes_administraveis",
      {
        description:
          "Lista somente integrações explicitamente concedidas para gestão. Não retorna credenciais nem autoriza execução.",
        inputSchema: z.strictObject({}),
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async () => run(() => management.list(identity, identity.personaId)),
    );
    server.registerTool(
      "revisar_gestao_integracao",
      {
        description:
          "Lê impacto e fingerprint da integração concedida para gestão; diagnóstico não reserva autoridade.",
        inputSchema: z.strictObject({ integrationId: z.uuid() }),
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async ({ integrationId }) =>
        run(() => management.review(identity, identity.personaId, integrationId)),
    );
    server.registerTool(
      "alterar_estado_integracao",
      {
        description:
          "Suspende ou recupera integração concedida usando versão e fingerprint revisados. Recuperar não reativa contratos, concessões ou operações. Não executa efeitos nem repete operações desconhecidas.",
        inputSchema: integrationManagementConfirmationSchema.extend({
          integrationId: z.uuid(),
          suspended: z.boolean(),
        }),
        annotations: { ...annotations, destructiveHint: true },
      },
      async ({ integrationId, suspended, ...confirmation }) =>
        run(() =>
          management.state(identity, identity.personaId, integrationId, suspended, confirmation),
        ),
    );
  }
  if (input.permissions.includes("treinar")) {
    const caseKinds: z.ZodType<"consulta" | "operacao_sql" | "cruzamento" | "acao_externa"> =
      input.externalIntegrations
        ? z.enum(["consulta", "operacao_sql", "cruzamento", "acao_externa"])
        : z.enum(["consulta", "operacao_sql", "cruzamento"]);
    server.registerTool(
      "obter_template_treinamento",
      {
        description:
          "Lê uma versão/hash exatos de template editorial para a fonte concedida e seu dialeto. Exige treinar, delegação/consentimento e papel editorial no catálogo. Não lista biblioteca, devolve datasets, executa SQL ou concede autorização.",
        inputSchema: templateReadSchema,
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async (value) => run(() => catalog.readTemplate(identity, identity.personaId, value)),
    );
    server.registerTool(
      "obter_testes_skill",
      {
        description:
          "Lê casos e relatórios nos recursos concedidos, com revisão e paginação. Ação externa exige contrato publicado exato concedido. Exige treinar e delegação vigente; não executa runner nem aprova evidências.",
        inputSchema: scope.extend({
          kind: caseKinds,
          after: z.uuid().optional(),
        }),
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async ({ skillId, kind, after }) =>
        run(() =>
          kind === "acao_externa"
            ? input.externalIntegrations!.tests(identity, identity.personaId, skillId, after)
            : kind === "consulta"
              ? catalog.queryTests(identity, identity.personaId, skillId, after)
              : kind === "operacao_sql"
                ? catalog.operationTests(identity, identity.personaId, skillId, after)
                : catalog.federationTests(identity, identity.personaId, skillId, after),
        ),
    );
    server.registerTool(
      "editar_caso_skill",
      {
        description:
          "Cria, altera ou remove caso por revisão. Ação externa exige contrato publicado exato concedido; entradas são sintéticas. Não executa testes, aprova relatório ou altera publicação ativa. Remoção exige ID do caso.",
        inputSchema: scope.extend(editableSkillCaseSchema.shape).extend({ kind: caseKinds }),
        annotations: { ...annotations, destructiveHint: true },
      },
      async ({ skillId, kind, ...value }) =>
        run(() =>
          kind === "acao_externa"
            ? input.externalIntegrations!.changeCase(identity, identity.personaId, skillId, value)
            : kind === "consulta"
              ? catalog.editQueryCase(identity, identity.personaId, skillId, value)
              : kind === "operacao_sql"
                ? catalog.editOperationCase(identity, identity.personaId, skillId, value)
                : catalog.editFederationCase(identity, identity.personaId, skillId, value),
        ),
    );
    server.registerTool(
      "criar_rascunho_de_template",
      {
        description:
          "Importa versões e hashes editoriais exatos para novo rascunho de consulta na própria persona. Exige treinar, fonte concedida, delegação/consentimento e papel colaborador/curador no catálogo. Exemplos ficam candidatos; dataset só é referenciado, sem devolver linhas. Não navega no catálogo, executa SQL, publica ou concede acesso.",
        inputSchema: templateDraftImportSchema,
        annotations,
      },
      async (value) => run(() => catalog.createFromTemplate(identity, identity.personaId, value)),
    );
    if (input.physicalCuration) {
      const physical = input.physicalCuration;
      server.registerTool(
        "listar_minhas_propostas_particularidade",
        {
          description:
            "Lista até vinte propostas físicas desta conexão no perfil concedido à skill. before usa cursor próprio. Revalida acesso remoto à base; não abre fila do curador nem entrega conteúdo ou identidade interna.",
          inputSchema: ownPhysicalProposalsSchema,
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async (value) => run(() => physical.listOwn(identity, value)),
      );
      server.registerTool(
        "propor_particularidade_fisica",
        {
          description:
            "Propõe conhecimento ao perfil físico adotado pela skill concedida. Exige treinar, delegação/consentimento, papel e acesso remoto vigente à mesma base. Não publica nem incorpora automaticamente.",
          inputSchema: proposePhysicalForSkillSchema,
          annotations,
        },
        async (value) => run(() => physical.proposeForSkill(identity, value)),
      );
      server.registerTool(
        "obter_proposta_particularidade",
        {
          description:
            "Estado da proposta física deste token e skill. includeContent:true relê o conteúdo original da mesma conexão e referências do perfil/base. Revalida acesso à base; não abre catálogo, rascunho ou revisão do curador.",
          inputSchema: scope.extend({
            proposalId: z.uuid(),
            includeContent: z.boolean().default(false),
          }),
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async ({ skillId, proposalId, includeContent }) =>
          run(() => physical.getForSkill(identity, skillId, proposalId, includeContent)),
      );
    }
    if (input.knowledgeTraining) {
      const knowledge = input.knowledgeTraining;
      server.registerTool(
        "listar_minhas_propostas_conhecimento",
        {
          description:
            "Lista até vinte propostas desta conexão na skill e versão-base concedidas. before pagina por cursor autorizado. Exige treinar/delegação/papel vigente; não lista catálogo, conteúdo ou revisões do curador.",
          inputSchema: ownProposalsSchema,
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async (value) => run(() => knowledge.listOwn(identity, value)),
      );
      server.registerTool(
        "propor_conhecimento",
        {
          description:
            "Envia proposta explícita ao padrão-base de uma skill publicada e concedida. Exige treinar, delegação vigente e papel colaborador/curador no catálogo. Não publica, aprova significado ou copia particularidades automaticamente.",
          inputSchema: proposeForSkillSchema,
          annotations,
        },
        async (value) => run(() => knowledge.propose(identity, value)),
      );
      server.registerTool(
        "obter_proposta_conhecimento",
        {
          description:
            "Estado de proposta enviada por este token à skill concedida. includeContent:true relê somente conteúdo submetido pela mesma conexão e sua versão-base, sem abrir catálogo, rascunhos ou revisão do curador.",
          inputSchema: scope.extend({
            proposalId: z.uuid(),
            includeContent: z.boolean().default(false),
          }),
          annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
        },
        async ({ skillId, proposalId, includeContent }) =>
          run(() => knowledge.get(identity, skillId, proposalId, includeContent)),
      );
    }
    server.registerTool(
      "registrar_exemplo_sql",
      {
        description:
          "Adiciona exemplo candidato ao rascunho de consulta, por revisão; replace:true substitui explicitamente o mesmo ID e retorna ao estado candidato. Valida SQL sem executar. Não altera publicação, parâmetros ou permissões; exige revisão editorial antes de publicar.",
        inputSchema: scope.extend(sqlExampleInputSchema.shape),
        annotations,
      },
      async ({ skillId, ...value }) =>
        run(() => catalog.registerSqlExample(identity, identity.personaId, skillId, value)),
    );
    server.registerTool(
      "inativar_exemplo_sql",
      {
        description:
          "Inativa explicitamente um exemplo no rascunho de consulta por exampleId e expectedRevision. Preserva conteúdo, modelo, parâmetros e publicação ativa. Não executa SQL, aprova, publica ou altera conhecimento compartilhado; exige treinar e delegação vigente.",
        inputSchema: scope.extend(deactivateSqlExampleSchema.shape),
        annotations,
      },
      async ({ skillId, ...value }) =>
        run(() => catalog.deactivateSqlExample(identity, identity.personaId, skillId, value)),
    );
    const inspection = input.inspection;
    if (inspection) {
      server.registerTool(
        "compor_inspecoes_estrutura",
        {
          description:
            "Combina páginas imutáveis da mesma fonte, identidade e versões. Não executa SQL de negócio, amplia validade, publica ou adota conhecimento.",
          inputSchema: composeStructureEvidenceSchema.extend({ fonteId: z.uuid() }),
          annotations,
        },
        async ({ fonteId, ...value }) =>
          run(() => inspection.compose(identity, identity.personaId, fonteId, value)),
      );
      server.registerTool(
        "inspecionar_estrutura",
        {
          description:
            "Inspeciona somente metadados autorizados pelo hub/agente. Não aceita SQL, aprova significado ou habilita execução compartilhada.",
          inputSchema: schemaInspectionSchema.extend({ fonteId: z.uuid() }),
          annotations,
        },
        async ({ fonteId, ...value }) =>
          run(() => inspection.inspect(identity, identity.personaId, fonteId, value)),
      );
    }
    server.registerTool(
      "listar_rascunhos",
      {
        description: "Rascunhos nas fontes concedidas. Não autorizam execução.",
        inputSchema: z.strictObject({}),
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async () => run(() => catalog.list(identity, identity.personaId)),
    );
    server.registerTool(
      "criar_rascunho_skill",
      {
        description:
          "Registra treinamento explícito da própria persona nas fontes concedidas; não captura consultas automaticamente.",
        inputSchema: draftInputSchema,
        annotations,
      },
      async (value) => run(() => catalog.create(identity, identity.personaId, value)),
    );
    server.registerTool(
      "editar_rascunho_skill",
      {
        description: "Edita rascunho por revisão, sem mudar publicação ativa.",
        inputSchema: scope.extend({
          name: z.string().trim().min(1).max(200),
          training: z.json(),
          expectedRevision: z.number().int().positive(),
        }),
        annotations,
      },
      async ({ skillId, ...value }) =>
        run(() => catalog.update(identity, identity.personaId, skillId, value)),
    );
    server.registerTool(
      "registrar_caso_skill",
      {
        description: "Registra caso declarativo. Não aprova relatório nem executa SQL.",
        inputSchema: scope.extend(caseInputSchema.shape),
        annotations,
      },
      async ({ skillId, ...value }) =>
        run(() => catalog.addCase(identity, identity.personaId, skillId, value)),
    );
  }
  if (input.permissions.includes("publicar")) {
    server.registerTool(
      "revisar_publicacao_skill",
      {
        description:
          "Prepara revisão exata com hash, testes exigidos e validade; exige prazo futuro definido pelo responsável no console para este conteúdo. Não define data nem publica.",
        inputSchema: scope,
        annotations,
      },
      async ({ skillId }) => run(() => catalog.preview(identity, identity.personaId, skillId)),
    );
    server.registerTool(
      "publicar_skill",
      {
        description:
          "Confirma a revisão exata vigente. Não concede novas capacidades aos tokens nem aprova lançamentos.",
        inputSchema: scope.extend({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) }),
        annotations,
      },
      async ({ skillId, confirmationHash }) =>
        run(() => catalog.publish(identity, identity.personaId, skillId, confirmationHash)),
    );
    server.registerTool(
      "suspender_publicacao_skill",
      {
        description: "Suspende a publicação e suas dependências afetadas.",
        inputSchema: scope,
        annotations: { ...annotations, destructiveHint: true },
      },
      async ({ skillId }) =>
        run(async () => {
          await catalog.suspend(identity, identity.personaId, skillId);
          return { suspended: true };
        }),
    );
  }
  if (input.permissions.includes("gerenciar_tokens")) {
    server.registerTool(
      "listar_tokens_delegados",
      {
        description:
          "Metadados dos tokens administráveis dentro do teto de delegação; nunca retorna Bearer.",
        inputSchema: z.strictObject({}),
        annotations: { ...annotations, readOnlyHint: true, idempotentHint: true },
      },
      async () => run(() => input.tokens.list(identity)),
    );
    server.registerTool(
      "editar_token_delegado",
      {
        description:
          "Altera token de menor privilégio com versão, prazo limitado e invalidação dos derivados. Não permite autoelevação.",
        inputSchema: delegatedTokenEditSchema,
        annotations,
      },
      async (value) => run(() => input.tokens.edit(identity, value)),
    );
    server.registerTool(
      "revogar_token_delegado",
      {
        description: "Revoga token administrável e seus derivados, com controle de versão.",
        inputSchema: delegatedTokenReferenceSchema,
        annotations: { ...annotations, destructiveHint: true },
      },
      async (value) => run(() => input.tokens.revoke(identity, value)),
    );
  }
};
