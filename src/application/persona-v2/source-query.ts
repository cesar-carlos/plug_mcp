import { z } from "zod";
import { assertBinaryProjection, decodeBinaryCell, isBinaryColumn } from "./binary-attachment.js";
import type { PersonaQueryReusePort } from "../../domain/ports/persona-query-reuse.port.js";
import type { AuthorizedSourceQuery } from "./consumer-catalog.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import type { ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { uniaoEscopos } from "../../domain/entities/escopo.js";
import type { ParametroSkill } from "../../domain/entities/skill.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import type { SqlExecuteResult } from "../../domain/ports/plug-server-gateway.port.js";
import { assertSourcePagination, validateSourceSql } from "./source-sql.js";
import { SourceExecutionError } from "../../domain/persona-v2/source-execution-error.js";
import { assertFanoutSeguro } from "../use-cases/shared/assert-fanout.js";
import {
  bindNamedParams,
  coerceBoundParams,
  extractNamedParams,
  sqlParaOdbc,
  sqlValidacaoVazia,
} from "../use-cases/shared/sql-modelo.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import type { SqlExecutePagination } from "../../domain/ports/plug-server-gateway.port.js";
import { queryTrainingSchema } from "./query-training.js";
import { assertQueryFieldUses } from "./query-field-uses.js";
import { allowedFieldUses, type FieldUse } from "../../domain/persona-v2/field-use.js";
import {
  QUERY_LIMITS,
  queryLimits,
  type QueryLimits,
} from "../../domain/persona-v2/execution-limits.js";
import { PERSONA_V2_TRAINING_BASE } from "./training-base.js";
import { parseSourceRestrictions, enforceSourceRestrictions } from "./source-restrictions.js";
import { DEFAULT_FEDERATION_BUDGET } from "../../domain/persona-v2/federation.js";
import {
  expectedStructureSchema,
  type ExpectedStructure,
} from "../../domain/persona-v2/source-schema.js";

export interface FederationQueryContext {
  outputUses?: Readonly<Record<string, readonly FieldUse[]>>;
  publicationId: string;
  hash: string;
  columns: readonly string[];
  signal: AbortSignal;
  retainRevalidation: (check: () => Promise<void>) => void;
}
export interface AttachmentQueryCapture {
  evidence: AuthorizedSourceQuery;
  resources: readonly { name: string; type: "table" | "view" }[];
  policyFingerprint: string;
  expectedStructure?: ExpectedStructure;
}
interface AttachmentQueryContext {
  format: "json" | "binary";
  capture: (value: AttachmentQueryCapture) => void;
}

export const sourceQuerySchema = z.strictObject({
  fonteId: z.uuid().optional(),
  skillIds: z
    .array(z.uuid())
    .min(1)
    .max(32)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  sql: z.string().trim().min(1).max(30000).optional(),
  params: z
    .record(
      z.string().regex(/^[a-z_][a-z0-9_$]*$/),
      z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()]),
    )
    .describe(
      "Objeto nomeado: use as chaves dos marcadores :nome sem os dois-pontos, com valores escalares do contrato publicado. Não envie chaves extras nem __scope_*.",
    )
    .optional(),
  options: z
    .strictObject({
      maxRows: z.number().int().min(1).max(5000).optional(),
      maxBytes: z.number().int().min(1).max(QUERY_LIMITS.maxBytes).optional(),
      timeoutMs: z.number().int().min(1).max(60000).optional(),
      page: z
        .number()
        .int()
        .min(1)
        .max(1000000)
        .describe(
          "Exige ORDER BY por nome ou alias simples projetado; prefira alias sem prefixo de tabela. Não use expressão, posição numérica ou limite SQL.",
        )
        .optional(),
      pageSize: z.number().int().min(1).max(5000).optional(),
    })
    .refine(
      (o) => (o.page === undefined) === (o.pageSize === undefined),
      "Informe page e pageSize juntos.",
    )
    .describe(
      "Objeto opcional. Omita se não precisar de limites ou paginação. Para paginar, informe page e pageSize juntos.",
    )
    .optional(),
});
export type SourceQueryInput = z.infer<typeof sourceQuerySchema>;
export interface SourceQueryResponse {
  reuse?: { kind: "fresh" | "cache" | "singleflight" };
  limits?: QueryLimits;
  fonteId: string;
  valid?: true;
  semanticApproval?: false;
  columns?: readonly string[];
  rows?: readonly Record<string, unknown>[];
  pagination?: SqlExecutePagination;
  completeness: { complete: boolean; truncated: boolean };
  provenance: {
    sourceId: string;
    dialect: Dialeto;
    readAt: string;
    publications: readonly { id: string; hash: string }[];
    sharedKnowledge?: readonly {
      catalogId: string;
      publicationId: string;
      hash: string;
      evidenceHash: string;
      profilePublicationId?: string;
      profileHash?: string;
    }[];
  };
}

/** One source per SELECT. Publication validation precedes any hub/network work. */
export class PersonaSourceQueries {
  constructor(
    private readonly catalog: Pick<
      PersonaConsumerCatalog,
      "query" | "revalidateQuery" | "sourceForVerification" | "suspendStructuralQuery"
    >,
    private readonly gateway: SourceQueryGatewayPort,
    private readonly reuse?: PersonaQueryReusePort,
  ) {}

  async verify(
    identity: ConsumerIdentity,
    sourceId: string,
  ): Promise<{
    fonteId: string;
    dialect: Dialeto;
    gatesVerified: true;
    sqlExecuted: false;
    metadataSqlExecuted: true;
    executionAuthority: string;
  }> {
    const source = await this.catalog.sourceForVerification(identity, sourceId);
    const lease = await this.gateway.authorize(source, [], {
      exactResources: true,
      requireDatabase: true,
    });
    await lease.revalidate();
    const current = await this.catalog.sourceForVerification(identity, sourceId);
    // Compare all non-secret source metadata, including credential version and physical fences.
    if (canonicalJson(source) !== canonicalJson(current))
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Fonte alterada durante verificação.");
    return {
      fonteId: source.id,
      dialect: source.dialect,
      gatesVerified: true,
      sqlExecuted: false,
      metadataSqlExecuted: true,
      executionAuthority:
        "Requer publicação vigente e concessões; esta verificação não licencia SQL.",
    };
  }

  capabilities(): Readonly<Record<string, unknown>> {
    return {
      version: PERSONA_V2_TRAINING_BASE.version,
      generation: "persona-v2",
      complete: false,
      localQuery: {
        implemented: true,
        effects: ["select"],
        dialects: ["postgres", "mssql", "sybase"],
        limits: QUERY_LIMITS,
        reducibleLimits: ["skill", "token", "skillGrant", "oauth", "request"],
        parameterTypes: ["string", "number", "integer", "decimal", "date", "datetime", "boolean"],
        sourceRestrictions: true,
        fieldUses: {
          implemented: true,
          purposes: ["projecao", "filtro", "join", "agrupamento", "ordenacao"],
          grantUnit: "whole-publication",
          export: false,
        },
        attachments: false,
        cache: !!this.reuse,
        singleflight: !!this.reuse,
        sharedStructureCache: false,
        realEngineAcceptance: false,
      },
      federation: {
        implemented: true,
        format: "persona-federation-v2",
        limits: DEFAULT_FEDERATION_BUDGET,
        completeInputsRequired: true,
        exactPublishedDependencies: true,
        parallelQueries: 1,
      },
      sqlOperations: false,
      externalActions: false,
      oauth: false,
    };
  }

  async run(
    identity: ConsumerIdentity,
    raw: SourceQueryInput,
    validation = false,
    internal?: FederationQueryContext,
    attachment?: AttachmentQueryContext,
  ): Promise<SourceQueryResponse> {
    const started = Date.now();
    const input = sourceQuerySchema.parse(raw);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expire!: (error: PersonaV2Error) => void;
    const expired = new Promise<never>((_resolve, reject) => {
      expire = reject;
    });
    const armDeadline = (timeoutMs: number) => {
      clearTimeout(timer);
      timer = setTimeout(
        () => expire(new PersonaV2Error("BUDGET_EXCEEDED", "Prazo da consulta excedido.")),
        Math.max(0, started + timeoutMs - Date.now()),
      );
    };
    armDeadline(input.options?.timeoutMs ?? QUERY_LIMITS.timeoutMs);
    try {
      return await Promise.race([
        this.execute(identity, input, validation, started, armDeadline, internal, attachment),
        expired,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async exportJson(
    identity: ConsumerIdentity,
    input: SourceQueryInput,
  ): Promise<{
    response: SourceQueryResponse;
    capture: AttachmentQueryCapture;
  }> {
    let capture: AttachmentQueryCapture | undefined;
    const response = await this.run(identity, input, false, undefined, {
      format: "json",
      capture: (value) => {
        capture = value;
      },
    });
    if (!capture)
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Prova de exportação indisponível.");
    return { response, capture };
  }
  async exportBinary(
    identity: ConsumerIdentity,
    input: SourceQueryInput,
  ): Promise<{ response: SourceQueryResponse; capture: AttachmentQueryCapture }> {
    if (input.options?.page !== undefined || input.options?.pageSize !== undefined) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Anexo binário não aceita paginação; selecione um único registro por parâmetros.",
      );
    }
    let capture: AttachmentQueryCapture | undefined;
    const response = await this.run(
      identity,
      {
        ...input,
        options: {
          ...input.options,
          maxRows: Math.min(2, input.options?.maxRows ?? 2),
        },
      },
      false,
      undefined,
      {
        format: "binary",
        capture: (value) => {
          capture = value;
        },
      },
    );
    if (!capture) throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Prova binária indisponível.");
    if (response.rows?.length !== 1 || !response.completeness.complete) {
      throw new PersonaV2Error(
        "INCOMPLETE_INPUT",
        "Anexo binário exige exatamente um registro e resultado completo; refine os filtros.",
      );
    }
    return { response, capture };
  }

  private async execute(
    identity: ConsumerIdentity,
    input: SourceQueryInput,
    validation: boolean,
    started: number,
    armDeadline: (timeoutMs: number) => void,
    internal?: FederationQueryContext,
    attachment?: AttachmentQueryContext,
  ): Promise<SourceQueryResponse> {
    const evidence = await this.catalog.query(identity, {
      ...input,
      cacheFence: !!attachment || (!!this.reuse && !validation && !internal),
    });
    const { source, publications } = evidence;
    const limits = queryLimits(evidence.executionLimits, input.options ?? {});
    if (attachment?.format === "binary" && limits.maxRows < 2) {
      throw new PersonaV2Error(
        "BUDGET_EXCEEDED",
        "Comprovar unicidade do binário exige orçamento para duas linhas.",
      );
    }
    armDeadline(limits.timeoutMs);
    const structuralResources = new Map<string, ExpectedStructure["resources"][number]>();
    for (const publication of publications)
      for (const item of publication.package.sharedKnowledge?.expectedStructure.resources ?? []) {
        const key = canonicalJson(item.resource),
          previous = structuralResources.get(key);
        const columns = new Map((previous?.columns ?? []).map((c) => [c.name, c]));
        for (const column of item.columns) {
          if (
            columns.has(column.name) &&
            canonicalJson(columns.get(column.name)) !== canonicalJson(column)
          )
            throw new PersonaV2Error(
              "INVALID_PLAN",
              "Provas estruturais conflitantes entre publicações.",
            );
          columns.set(column.name, column);
        }
        const constraints = previous?.constraints ?? item.constraints;
        if (
          previous?.constraints &&
          item.constraints &&
          canonicalJson(previous.constraints) !== canonicalJson(item.constraints)
        )
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Constraints conflitantes entre publicações; use skills compatíveis.",
          );
        structuralResources.set(key, {
          resource: item.resource,
          columns: [...columns.values()],
          ...(constraints ? { constraints } : {}),
        });
      }
    const expectedStructure = structuralResources.size
      ? expectedStructureSchema.parse({ version: 1, resources: [...structuralResources.values()] })
      : undefined;
    if (
      internal &&
      (internal.signal.aborted ||
        publications.length !== 1 ||
        publications[0]!.id !== internal.publicationId ||
        publications[0]!.hash !== internal.hash)
    )
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou antes da consulta local.");
    const restrictions = parseSourceRestrictions(source.rowRestrictions);
    if (!input.sql && publications.length !== 1)
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Selecione uma skill para executar o modelo, ou informe SQL no pacote da fonte.",
      );
    const sql = input.sql ?? publications[0]!.package.sqlModel;
    const trainings = publications.map((p) => queryTrainingSchema.parse(p.package.training));
    if (
      attachment &&
      (validation ||
        internal ||
        !evidence.cacheFence ||
        evidence.cacheFence.writePending ||
        (attachment.format === "binary" && publications.length !== 1) ||
        trainings.some((training) =>
          attachment.format === "binary" ? !training.binaryAttachments : !training.attachments,
        ) ||
        publications.some(
          (p) =>
            !p.package.requiredCapabilities.some((c) =>
              c.startsWith(
                attachment.format === "binary"
                  ? "binary-attachment-contract:"
                  : "attachment-contract:",
              ),
            ),
        ))
    ) {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Exportação não publicada ou base sem prova vigente para anexos.",
      );
    }
    const contracts = new Map<string, ParametroSkill>();
    const definitions = new Map<string, string>();
    const resources = new Map<string, { name: string; type: "table" | "view" }>();
    for (const training of trainings) {
      if (training.sourceId !== source.id || training.dialect !== source.dialect)
        throw new PersonaV2Error("INVALID_PLAN", "Pacote incompatível com a fonte.");
      for (const table of training.tables) {
        const key = `table:${table.name}`;
        const definition = canonicalJson({ grain: table.grain, type: table.resourceType });
        if (definitions.has(key) && definitions.get(key) !== definition)
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Grão ou tipo de recurso conflitante entre pacotes.",
          );
        definitions.set(key, definition);
        resources.set(table.name, { name: table.name, type: table.resourceType });
      }
      for (const column of training.columns) {
        const key = `column:${column.table}.${column.name}`;
        const definition = canonicalJson({
          classification: column.classification,
          uses: column.uses,
          usePurpose: column.usePurpose,
        });
        if (definitions.has(key) && definitions.get(key) !== definition)
          throw new PersonaV2Error("INVALID_PLAN", "Classificação conflitante entre pacotes.");
        definitions.set(key, definition);
      }
      for (const relation of training.relationships) {
        const key = `join:${relation.from}:${relation.to}:${canonicalJson(relation.keys)}`;
        const definition = canonicalJson({
          join: relation.join,
          cardinality: relation.cardinality,
        });
        if (definitions.has(key) && definitions.get(key) !== definition)
          throw new PersonaV2Error("INVALID_PLAN", "Relacionamento conflitante entre pacotes.");
        definitions.set(key, definition);
      }
      for (const param of training.parameters) {
        const current = contracts.get(param.name);
        if (current && (current.tipo !== param.type || current.obrigatorio !== param.required))
          throw new PersonaV2Error("INVALID_PLAN", "Parâmetro conflitante entre pacotes.");
        contracts.set(param.name, {
          nome: param.name,
          tipo: param.type,
          obrigatorio: param.required,
          descricao: param.meaning,
        });
      }
    }
    const names = extractNamedParams(sql);
    for (const restriction of restrictions) {
      contracts.set(restriction.parameter, {
        nome: restriction.parameter,
        tipo:
          typeof restriction.value === "number"
            ? "number"
            : typeof restriction.value === "boolean"
              ? "boolean"
              : "string",
        obrigatorio: true,
        descricao: "Recorte físico obrigatório controlado pelo servidor",
      });
    }
    if (
      names.some((name) => !contracts.has(name)) ||
      Object.keys(input.params ?? {}).some(
        (name) => !names.includes(name) || name.startsWith("__scope_"),
      )
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Parâmetros devem corresponder ao SQL e ao contrato publicado.",
      );
    }
    const scope = uniaoEscopos(publications.map((p) => p.package.scope));
    const ast = validateSourceSql(sql, source.dialect, scope);
    if (attachment?.format === "binary")
      assertBinaryProjection(ast, trainings[0]!.binaryAttachments!);
    const binaryFields = new Set(
      trainings.flatMap((training) =>
        training.binaryAttachments
          ? [`${training.binaryAttachments.table}.${training.binaryAttachments.column}`]
          : [],
      ),
    );
    const fields = trainings
      .flatMap((training) => training.columns)
      .map((field) =>
        attachment?.format !== "binary" && binaryFields.has(`${field.table}.${field.name}`)
          ? { ...field, uses: allowedFieldUses(field).filter((use) => use !== "projecao") }
          : field,
      );
    assertQueryFieldUses(ast, fields, internal?.outputUses);
    if (attachment) {
      assertQueryFieldUses(
        ast,
        fields,
        Object.fromEntries(ast.colunas.map((column) => [column.alias, ["exportacao"]])),
      );
    }
    // Field authority (including binary projection) takes precedence over pagination.
    // Both checks still complete before remote authorization or SQL dispatch.
    assertSourcePagination(ast, input.options);
    assertFanoutSeguro(ast, scope);
    enforceSourceRestrictions(ast, scope, restrictions);
    const columns = ast.colunas.map((c) => c.alias);
    if (
      internal &&
      (columns.length !== internal.columns.length ||
        columns.some((c, i) => c.toLowerCase() !== internal.columns[i]))
    )
      throw new PersonaV2Error("INVALID_PLAN", "Projeção local difere do contrato de cruzamento.");
    if (
      columns.some((c) => !c) ||
      new Set(columns.map((c) => c.toLowerCase())).size !== columns.length ||
      ast.temStar
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Declare projeção e aliases únicos; SELECT * não é permitido.",
      );
    }
    const supplied = {
      ...input.params,
      ...Object.fromEntries(restrictions.map((r) => [r.parameter, r.value])),
    };
    const params = coerceBoundParams(bindNamedParams(sql, supplied, [...contracts.values()]), [
      ...contracts.values(),
    ]);
    const options = {
      maxRows: limits.maxRows,
      timeoutMs: limits.timeoutMs,
      ...(input.options?.page ? { page: input.options.page, pageSize: limits.pageSize } : {}),
    };
    const deadline = started + options.timeoutMs;
    const assertDeadline = () => {
      if (Date.now() >= deadline || internal?.signal.aborted)
        throw new PersonaV2Error("BUDGET_EXCEEDED", "Prazo da consulta excedido.");
    };
    assertDeadline();
    const lease = await this.gateway.authorize(source, [...resources.values()], {
      exactResources: true,
      requireDatabase: true,
    });
    if (attachment && !lease.policyFingerprint) {
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Policy verificável indisponível para anexos.",
      );
    }
    internal?.retainRevalidation(async () => {
      await lease.revalidate();
      await this.catalog.revalidateQuery(identity, evidence);
      assertDeadline();
    });
    await this.catalog.revalidateQuery(identity, evidence);
    assertDeadline();
    // Structural proofs still execute on the agent connection; never replace that guard
    // with a cache hit. Volatile SQL, validation and federation also keep fresh execution.
    const reusable = !!(
      this.reuse &&
      !attachment &&
      !validation &&
      !internal &&
      !expectedStructure &&
      evidence.cacheFence &&
      !evidence.cacheFence.writePending &&
      lease.policyFingerprint &&
      !/\b(now|today|tomorrow|yesterday|age|random|rand|newid|uuid|uuid_generate_v4|gen_random_uuid|getdate|getutcdate|sysdatetime|current_timestamp|current_date|current_time|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp|nextval|currval)\b/i.test(
        sql,
      )
    );
    const readFresh = async (): Promise<SourceQueryResponse> => {
      const result = await lease
        .execute(
          sqlParaOdbc(validation ? sqlValidacaoVazia(source.dialect, sql) : sql),
          params,
          validation
            ? { maxRows: 1, timeoutMs: Math.max(1, deadline - Date.now()) }
            : { ...options, timeoutMs: Math.max(1, deadline - Date.now()) },
          expectedStructure,
        )
        .catch(async (error: unknown) => {
          if (
            expectedStructure &&
            error instanceof DomainError &&
            error.details &&
            typeof error.details === "object" &&
            "failureCode" in error.details &&
            error.details.failureCode === "SOURCE_STRUCTURE_MISMATCH"
          ) {
            await this.catalog.suspendStructuralQuery(identity, evidence);
            throw new PersonaV2Error(
              "STALE_AUTHORIZATION",
              "Estrutura divergente; publicações utilizadas foram suspensas. Revise e republique.",
            );
          }
          if (error instanceof DomainError && error.source === "sql_engine")
            throw new SourceExecutionError(
              error,
              input.sql === undefined ? "modelo_publicado" : "sql_fornecido",
              publications.map((publication) => publication.id),
            );
          throw error;
        });
      const readAt = new Date().toISOString();
      assertDeadline();
      this.assertResult(
        result,
        columns,
        validation ? 0 : (options.pageSize ?? options.maxRows),
        attachment?.format === "binary"
          ? Math.min(limits.maxBytes, trainings[0]!.binaryAttachments!.maxBytes)
          : undefined,
      );
      if (
        result.pagination &&
        (!options.page ||
          result.pagination.page !== options.page ||
          result.pagination.pageSize !== options.pageSize)
      )
        throw new PersonaV2Error(
          "INCOMPLETE_INPUT",
          "Paginação da fonte diverge dos limites enviados.",
        );
      await lease.revalidate();
      assertDeadline();
      const limited =
        ast.temLimite ||
        result.truncated === true ||
        result.rows.length >= (result.effectiveMaxRows ?? options.maxRows);
      const response: SourceQueryResponse = {
        fonteId: source.id,
        limits,
        ...(validation
          ? { valid: true, semanticApproval: false }
          : { columns: result.columns, rows: result.rows }),
        ...(result.pagination ? { pagination: result.pagination } : {}),
        completeness: {
          complete:
            validation ||
            (!options.page && !limited && !result.pagination && result.truncated === false),
          truncated: limited,
        },
        provenance: {
          sourceId: source.id,
          dialect: source.dialect,
          readAt,
          publications: publications.map((p) => ({ id: p.id, hash: p.hash })),
          ...(publications.some((p) => p.package.sharedKnowledge)
            ? {
                sharedKnowledge: publications.flatMap((p) => {
                  const ref = p.package.sharedKnowledge;
                  return ref
                    ? [
                        {
                          catalogId: ref.catalogId,
                          publicationId: ref.publicationId,
                          hash: ref.publicationHash,
                          evidenceHash: ref.evidenceHash,
                          ...(ref.profilePublicationId
                            ? {
                                profilePublicationId: ref.profilePublicationId,
                                profileHash: ref.profileHash,
                              }
                            : {}),
                        },
                      ]
                    : [];
                }),
              }
            : {}),
        },
      };
      if (Buffer.byteLength(JSON.stringify(response), "utf8") > limits.maxBytes)
        throw new PersonaV2Error("BUDGET_EXCEEDED", "Resposta excede o limite de bytes vigente.");
      if (reusable) {
        if (
          Buffer.byteLength(
            JSON.stringify({ ...response, reuse: { kind: "singleflight" } }),
            "utf8",
          ) > limits.maxBytes
        )
          throw new PersonaV2Error("BUDGET_EXCEEDED", "Resposta excede o limite de bytes vigente.");
        await this.catalog.revalidateQuery(identity, evidence);
        assertDeadline();
      }
      return response;
    };
    const reused = reusable
      ? await this.reuse.run(
          canonicalJson({
            identity,
            source,
            fence: evidence.cacheFence,
            policy: lease.policyFingerprint,
            publications: publications
              .map((p) => ({ id: p.id, hash: p.hash }))
              .sort((a, b) => a.id.localeCompare(b.id)),
            trainingBase: PERSONA_V2_TRAINING_BASE.version,
            sql,
            params,
            limits,
            options,
          }),
          deadline,
          readFresh,
        )
      : { value: await readFresh(), kind: "fresh" as const };
    const response = reused.value;
    if (reusable) {
      response.reuse = { kind: reused.kind };
      // Each waiter/hit has its own live hub lease and local consumer transaction.
      await lease.revalidate();
      assertDeadline();
    }
    await this.catalog.revalidateQuery(identity, evidence, {
      validation,
      durationMs: Date.now() - started,
      rows: response.rows?.length ?? 0,
      ...(reusable ? { reuseKind: reused.kind } : {}),
    });
    assertDeadline();
    if (attachment)
      attachment.capture({
        evidence,
        resources: [...resources.values()],
        policyFingerprint: lease.policyFingerprint!,
        ...(expectedStructure ? { expectedStructure } : {}),
      });
    return response;
  }

  private assertResult(
    result: SqlExecuteResult,
    expected: readonly string[],
    maxRows: number,
    binaryMaxBytes?: number,
  ): void {
    const valid =
      result.rows.length <= maxRows &&
      result.columns.length === expected.length &&
      result.columns.every((c, i) => c.toLowerCase() === expected[i]!.toLowerCase()) &&
      (binaryMaxBytes !== undefined
        ? result.columns.length === 1 &&
          result.columnsMetadata?.length === 1 &&
          result.columnsMetadata[0]!.name.toLowerCase() === result.columns[0]!.toLowerCase() &&
          isBinaryColumn(result.columnsMetadata[0]!)
        : !result.columnsMetadata?.some(isBinaryColumn)) &&
      result.rows.every(
        (row) =>
          Object.keys(row).length === result.columns.length &&
          result.columns.every((c) => {
            const value = row[c];
            if (binaryMaxBytes !== undefined) {
              decodeBinaryCell(value, binaryMaxBytes);
              return true;
            }
            return (
              value === null ||
              typeof value === "string" ||
              typeof value === "boolean" ||
              (typeof value === "number" && Number.isFinite(value))
            );
          }),
      );
    if (!valid)
      throw new PersonaV2Error(
        "INCOMPLETE_INPUT",
        "Resposta da fonte incompatível com projeção, tipos ou limites. Binários exigem contrato próprio e criação explícita de anexo.",
      );
  }
}
