import { computed, reactive, ref, watch, type ComputedRef, type Ref } from "vue";
import type { AttachmentDescriptor } from "../../../src/domain/persona-v2/attachments";
import {
  assertGrantedPublication,
  assertTokenPersona,
  mcpAuthorizationHeader,
  parseMcpToolResult,
} from "./mcp-client";
import type { ContextRequests, Persona, Publication, QueryResult } from "./model";
import { queryParameters, type ParameterMode } from "./query-parameters";
import { useQueryAttachment } from "./use-query-attachment";

export function useConsoleQuery(
  requests: ContextRequests,
  run: (action: () => Promise<void>) => Promise<void>,
  bearer: Ref<string>,
  personaId: Ref<string>,
  logged: Ref<boolean>,
  publications: Ref<Record<string, Publication>>,
  message: Ref<string>,
): {
  queryPage: Ref<number>;
  queryPageSize: Ref<number>;
  submittedFilters: Ref<Record<string, unknown>>;
  querySkill: Ref<string>;
  querySql: Ref<string>;
  queryValues: Record<string, string>;
  queryModes: Record<string, ParameterMode>;
  queryDirty: ComputedRef<boolean>;
  grantedQueries: Ref<
    { id: string; name: string; publicationId: string; hash: string }[] | undefined
  >;
  queryPublications: ComputedRef<Record<string, Publication>>;
  active: ComputedRef<Publication | undefined>;
  result: Ref<QueryResult | undefined>;
  attachment: Ref<AttachmentDescriptor | undefined>;
  clearAttachment: () => void;
  clearQuerySession: () => void;
  resetQueryContext: () => void;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  inspectToken: () => Promise<void>;
  query: (validation?: boolean, page?: number) => Promise<void>;
  createAttachment: (format?: "json" | "binary") => Promise<void>;
  downloadAttachment: () => Promise<void>;
} {
  const queryPage = ref(1);
  const queryPageSize = ref(100);
  const submittedFilters = ref<Record<string, unknown>>({});
  const querySkill = ref("");
  const querySql = ref("");
  const queryValues = reactive<Record<string, string>>({});
  const queryModes = reactive<Record<string, ParameterMode>>({});
  const grantedQueries = ref<{ id: string; name: string; publicationId: string; hash: string }[]>();
  const result = ref<QueryResult>();
  const queryDirty = computed(
    () =>
      !!querySql.value ||
      Object.values(queryValues).some((value) => value !== "") ||
      Object.values(queryModes).some((mode) => mode !== "value"),
  );
  const queryPublications = computed(() =>
    Object.fromEntries(
      Object.entries(publications.value).filter(
        ([id, publication]) =>
          grantedQueries.value === undefined ||
          grantedQueries.value.some(
            (granted) =>
              granted.id === id &&
              granted.publicationId === publication.id &&
              granted.hash === publication.hash,
          ),
      ),
    ),
  );
  const active = computed(() => publications.value[querySkill.value]);

  async function mcp<T>(tool: string, args: unknown): Promise<T> {
    const response = await requests.json<{
      result?: { isError?: boolean; content: { text?: string }[] };
      error?: unknown;
    }>(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: mcpAuthorizationHeader(bearer.value),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      },
      "mcp",
    );
    return parseMcpToolResult<T>(response);
  }

  const { attachment, clearAttachment, createAttachment, downloadAttachment } = useQueryAttachment({
    run,
    mcp,
    bearer,
    personaId,
    logged,
    message,
    active,
    querySkill,
    querySql,
    queryValues,
    queryModes,
    queryPage,
    queryPageSize,
  });

  function clearParameterState(): void {
    Object.keys(queryValues).forEach((key) => {
      delete queryValues[key];
    });
    Object.keys(queryModes).forEach((key) => {
      delete queryModes[key];
    });
  }

  function clearQuerySession(): void {
    clearAttachment();
    result.value = undefined;
    querySql.value = "";
    clearParameterState();
  }

  function resetQueryContext(): void {
    clearQuerySession();
    grantedQueries.value = undefined;
    querySkill.value = "";
  }

  async function inspectToken(): Promise<void> {
    await run(async () => {
      grantedQueries.value = undefined;
      result.value = undefined;
      const context = await mcp<Persona>("obter_contexto_persona", {});
      assertTokenPersona(context, personaId.value);
      grantedQueries.value = await mcp<NonNullable<typeof grantedQueries.value>>(
        "listar_skills",
        {},
      );
      if (!queryPublications.value[querySkill.value]) {
        querySkill.value = "";
      }
      message.value =
        "Consultas filtradas pelas publicações concedidas ao token. O servidor revalida todas as permissões a cada execução.";
    });
  }

  async function query(validation = false, page = 1): Promise<void> {
    await run(async () => {
      clearAttachment();
      result.value = undefined;
      const selected = active.value;
      if (!selected || !bearer.value) {
        throw new Error("Escolha uma consulta e informe o token.");
      }
      const context = await mcp<Persona>("obter_contexto_persona", {});
      assertTokenPersona(context, personaId.value);
      const permitted = await mcp<{ id: string; publicationId: string; hash: string }[]>(
        "listar_skills",
        {},
      );
      assertGrantedPublication(permitted, querySkill.value, selected);
      const params = queryParameters(selected.package.training.parameters, queryValues, queryModes);
      const response = await mcp<QueryResult>(validation ? "validar_consulta" : "consultar_dados", {
        fonteId: selected.package.sourceId,
        skillIds: [querySkill.value],
        ...(querySql.value.trim() ? { sql: querySql.value } : {}),
        params,
        options: {
          maxRows: 100,
          timeoutMs: 30000,
          ...(validation ? {} : { page, pageSize: queryPageSize.value }),
        },
      });
      if (validation) {
        message.value =
          "SQL validado tecnicamente. Essa validação não retorna dados nem aprova o significado da consulta.";
      } else {
        queryPage.value = page;
        submittedFilters.value = params;
        result.value = response;
      }
    });
  }

  watch(querySkill, () => {
    Object.keys(queryModes).forEach((key) => {
      delete queryModes[key];
    });
    querySql.value = "";
    result.value = undefined;
    Object.keys(queryValues).forEach((key) => {
      delete queryValues[key];
    });
  });
  watch(
    [querySql, bearer, queryValues],
    () => {
      result.value = undefined;
    },
    { deep: true },
  );
  watch(bearer, () => {
    grantedQueries.value = undefined;
  });
  watch(
    [querySkill, querySql, bearer, queryValues, queryModes, queryPageSize],
    () => {
      clearAttachment();
      result.value = undefined;
      queryPage.value = 1;
      submittedFilters.value = {};
    },
    { deep: true },
  );

  return {
    queryPage,
    queryPageSize,
    submittedFilters,
    querySkill,
    querySql,
    queryValues,
    queryModes,
    queryDirty,
    grantedQueries,
    queryPublications,
    active,
    result,
    attachment,
    clearAttachment,
    clearQuerySession,
    resetQueryContext,
    mcp,
    inspectToken,
    query,
    createAttachment,
    downloadAttachment,
  };
}
