import {
  canonicalJson,
  type PublishedPackage,
  type PublicationPreviewResult,
} from "../../domain/persona-v2/catalog.js";
import type { ExternalPackage } from "../../domain/persona-v2/external-contract.js";
import type { PhysicalProfile } from "../../domain/persona-v2/physical-profile.js";

/** Stable identities prevent array reordering from appearing as changed business definitions. */
export function publicationReview(
  before: PublishedPackage | ExternalPackage | PhysicalProfile | null,
  after: PublishedPackage | ExternalPackage | PhysicalProfile,
): PublicationPreviewResult["review"]["sections"] {
  interface Change {
    kind: "added" | "removed" | "changed";
    path: string;
    label: string;
    before?: unknown;
    after?: unknown;
  }
  const groups: Record<string, { id: string; label: string; changes: Change[] }> =
    Object.fromEntries(
      [
        ["identity", "Finalidade e fonte"],
        ["structure", "Estrutura e relacionamentos"],
        ["examples", "Exemplos SQL"],
        ["parameters", "Parâmetros"],
        ["rules", "Regras e limites"],
        ["dependencies", "Versões e dependências"],
        ["capabilities", "Capacidades"],
      ].map(([id, label]) => [id!, { id: id!, label: label!, changes: [] }]),
    );
  const record = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const key = (v: unknown): string | undefined => {
    if (!record(v)) return undefined;
    if (typeof v.id === "string") return v.id;
    if (typeof v.name === "string")
      return `${typeof v.table === "string" ? v.table : ""}:${v.name}`;
    if (typeof v.publicationId === "string") return v.publicationId;
    if (typeof v.from === "string" && typeof v.to === "string")
      return `${v.from}→${v.to}:${canonicalJson(v.keys)}`;
    return undefined;
  };
  const visit = (a: unknown, b: unknown, path: string) => {
    if (a === undefined && b === undefined) return;
    if (a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b)) return;
    if ((record(a) || a === undefined) && (record(b) || b === undefined)) {
      const left = a ?? {},
        right = b ?? {};
      if (!Object.keys(left).length && !Object.keys(right).length) {
        add(a, b, path);
        return;
      }
      for (const field of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort())
        visit(left[field], right[field], path ? `${path}/${field}` : field);
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const previous: unknown[] = a,
        next: unknown[] = b;
      if (![...previous, ...next].every((v) => key(v) !== undefined)) {
        add(a, b, path);
        return;
      }
      const left = new Map(previous.map((v) => [key(v)!, v])),
        right = new Map(next.map((v) => [key(v)!, v]));
      if (left.size === a.length && right.size === b.length) {
        // Unlike table/field definitions, execution steps have semantic order.
        if (/(?:^|\/)steps$/.test(path)) {
          const previousOrder = previous.map(key),
            nextOrder = next.map(key);
          if (canonicalJson(previousOrder) !== canonicalJson(nextOrder))
            add(previousOrder, nextOrder, `${path}/order`);
        }
        for (const id of [...new Set([...left.keys(), ...right.keys()])].sort())
          visit(left.get(id), right.get(id), `${path}/${id}`);
        return;
      }
    }
    add(a, b, path);
  };
  const labels: Readonly<Record<string, string>> = {
    training: "Treinamento",
    semantics: "Semântica comercial",
    metrics: "Métricas",
    synonyms: "Sinônimos revisados",
    tables: "Tabelas",
    columns: "Campos",
    relationships: "Relacionamentos",
    meaning: "Significado",
    name: "Nome",
    purpose: "Finalidade",
    rules: "Regras",
    parameters: "Parâmetros",
    examples: "Exemplos",
    sqlModel: "SQL principal",
    sql: "SQL",
    requiredCapabilities: "Capacidades exigidas",
    commonTraining: "Base técnica",
    dependencies: "Dependências",
    sourceId: "Fonte",
    sourceFingerprint: "Versão física da fonte",
    type: "Tipo",
    classification: "Classificação",
    keys: "Pares de chaves",
    from: "Origem",
    to: "Destino",
    cardinality: "Cardinalidade",
    nullable: "Aceita nulo",
    required: "Obrigatório",
    scope: "Recortes e escopo",
    maxRows: "Limite de linhas",
    maxAffected: "Limite de alterações",
    approval: "Aprovação",
    mode: "Modo",
    steps: "Etapas",
    order: "Ordem de execução",
    effect: "Comando",
    table: "Tabela",
    values: "Valores gravados",
    where: "Filtros obrigatórios",
    binding: "Origem do valor",
    outputs: "Saídas tipadas",
    column: "Coluna",
    rows: "Linhas diretamente afetadas",
    min: "Mínimo",
    max: "Máximo",
    maxAffectedRows: "Limite de linhas diretamente afetadas",
    timeoutMs: "Prazo em milissegundos",
    identity: "Identidade dos registros",
    concurrency: "Condição de concorrência",
    writable: "Permissão de escrita",
    indirectEffects: "Efeitos indiretos",
    reconciliation: "Procedimento de conciliação",
    reconciliationQuery: "Consulta do marcador",
    adaptiveFilters: "Filtros adaptáveis",
    budget: "Limites",
    dialect: "Dialeto",
    grain: "Grão",
    identityColumns: "Identidade do registro",
    primary: "Principal",
    state: "Estado editorial",
    explanation: "Explicação",
    cases: "Casos de teste",
    id: "Identificador",
    format: "Formato",
    hash: "Hash",
    version: "Versão",
    revision: "Revisão",
    input: "Entrada",
    output: "Saída",
    inputSchema: "Schema remoto de entrada",
    outputSchema: "Schema remoto de saída",
    transport: "Transporte",
    integrationId: "Integração",
    operationId: "Identidade da operação externa",
    destination: "Destino",
    credentialVersion: "Versão da credencial",
    path: "Rota fixa",
    tool: "Ferramenta remota",
    effectDescription: "Efeitos da ação",
    reconciliationCheck: "Leitura de conciliação",
    guarantee: "Garantia revisada",
    bindings: "Vínculos à entrada original",
    evidence: "Evidência exigida",
    countField: "Campo de contagem",
    completeField: "Campo de completude",
    statusField: "Campo de estado terminal",
    appliedValue: "Estado esperado",
    maxResponseBytes: "Resposta máxima em bytes",
  };
  const add = (a: unknown, b: unknown, path: string) => {
    const group = /tables|columns|relationships|scope/.test(path)
      ? "structure"
      : /examples|sqlModel/.test(path)
        ? "examples"
        : path.includes("parameters") ||
            /(?:^|\/)(?:input|output|inputSchema|outputSchema|bindings)(?:\/|$)/.test(path)
          ? "parameters"
          : /commonTraining|dependencies|sourceFingerprint|credentialVersion|destination|integrationId/.test(
                path,
              )
            ? "dependencies"
            : path.includes("requiredCapabilities")
              ? "capabilities"
              : /rules|steps|budget|approval|mode|timeout|maxAffected|indirectEffects|reconciliation/.test(
                    path,
                  )
                ? "rules"
                : "identity";
    groups[group]!.changes.push({
      kind: a === undefined ? "added" : b === undefined ? "removed" : "changed",
      path,
      label: path
        .split("/")
        .map((part) => labels[part] ?? part.replace(/^:/, ""))
        .join(" › "),
      ...(a === undefined ? {} : { before: a }),
      ...(b === undefined ? {} : { after: b }),
    });
  };
  visit(before ?? {}, after, "");
  return Object.values(groups).filter((g) => g.changes.length);
}
