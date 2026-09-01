import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { AnexoHandlePort } from "../../../domain/ports/anexo-handle.port.js";
import {
  inferirSensibilidadeColuna,
  type SensibilidadeColuna,
} from "../../../domain/entities/privacidade.js";
import {
  ANEXO_DECODE_MAX_BYTES,
  ANEXO_KIND,
  ANEXO_MAX_CELLS_PER_RESULT,
  ANEXO_TOTAL_MAX_BYTES,
  QUERY_CELL_MAX_CHARS,
  type AnexoStub,
  type OrigemAnexoHandle,
} from "../../../domain/entities/anexo.js";
import { analisarCelulaBinaria } from "./detectar-celula-binaria.js";

export interface SanitizarLinhasConsultaInput {
  readonly rows: readonly Record<string, unknown>[];
  readonly columnTypes?: ReadonlyMap<string, string | null>;
  readonly anexos?: AnexoHandlePort;
  readonly usuarioId: string;
  readonly acessoId: string;
  readonly origem: OrigemAnexoHandle;
  readonly lookupSensibilidade?: (coluna: string) => SensibilidadeColuna | null;
}

export interface SanitizarLinhasConsultaResult {
  readonly rows: Record<string, unknown>[];
  readonly anexos: number;
}

const truncateCell = (value: unknown): unknown => {
  if (typeof value !== "string" || value.length <= QUERY_CELL_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, QUERY_CELL_MAX_CHARS)}…`;
};

const tipoDaColuna = (
  columnTypes: ReadonlyMap<string, string | null> | undefined,
  key: string,
): string | null => columnTypes?.get(key.toLowerCase()) ?? null;

const orcamentoAnexo = (message: string, hint: string): DomainError =>
  DomainError.anexo({
    code: ERROR_CODES.CONSULTA_ORCAMENTO,
    message,
    hint,
    category: "budget",
  });

const stubSemHandle = (): AnexoStub => ({
  kind: ANEXO_KIND,
  truncated: true,
});

/**
 * Extrai blobs **antes** de `QUERY_CELL_MAX_CHARS` e do cache Redis.
 * Rows ficam só com stub `{ kind: "anexo", truncated: true }` (+ handle só em
 * `consultar_dados` livre). Inspeção nunca faz `put` (stub sem handle).
 */
export const sanitizarLinhasConsulta = (
  input: SanitizarLinhasConsultaInput,
): SanitizarLinhasConsultaResult => {
  let anexos = 0;
  let totalBytes = 0;
  const rows = input.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const analysed = analisarCelulaBinaria(value, tipoDaColuna(input.columnTypes, key));
      if (!analysed) {
        next[key] = truncateCell(value);
        continue;
      }
      if (analysed.outcome === "teto") {
        throw orcamentoAnexo(
          "Célula binária excede o teto de anexo.",
          "Recorte o SELECT a uma linha e uma coluna de anexo (TOP/LIMIT 1). Não reescreva o SQL: o teto é de mídia no MCP, não do validador do pacote.",
        );
      }
      if (analysed.outcome === "omitir") {
        anexos += 1;
        next[key] = stubSemHandle();
        continue;
      }
      const extracted = analysed.value;
      if (extracted.bytes.length > ANEXO_DECODE_MAX_BYTES) {
        throw orcamentoAnexo(
          "Célula binária excede o teto de anexo.",
          "Recorte o SELECT a uma linha e uma coluna de anexo (TOP/LIMIT 1). Não reescreva o SQL: o teto é de mídia no MCP, não do validador do pacote.",
        );
      }
      anexos += 1;
      totalBytes += extracted.bytes.length;
      if (anexos > ANEXO_MAX_CELLS_PER_RESULT || totalBytes > ANEXO_TOTAL_MAX_BYTES) {
        throw orcamentoAnexo(
          "Resultado com demasiados anexos.",
          "Peça uma linha/coluna de anexo por vez. Não aumente max_rows para baixar fotos. Não reescreva o SQL por este teto.",
        );
      }
      const sensibilidade = input.lookupSensibilidade?.(key) ?? inferirSensibilidadeColuna(key);
      const omitirHandle =
        input.origem === "inspecionar_consulta" ||
        sensibilidade === "pessoal" ||
        sensibilidade === "segredo";
      if (omitirHandle) {
        next[key] = stubSemHandle();
        continue;
      }
      if (!input.anexos) {
        throw orcamentoAnexo(
          "Célula binária não pode ir nas rows.",
          "Recorte a uma linha/coluna (TOP/LIMIT 1) e chame de novo. O MCP não despeja o blob; use exportar_anexo no handle de consultar_dados.",
        );
      }
      const handle = input.anexos.put({
        usuarioId: input.usuarioId,
        acessoId: input.acessoId,
        bytes: extracted.bytes,
        mimeHint: extracted.mimeHint,
        coluna: key,
        sensibilidade,
        origem: input.origem,
      });
      const stub: AnexoStub = {
        kind: ANEXO_KIND,
        bytes: extracted.bytes.length,
        handle,
        truncated: true,
        ...(extracted.mimeHint ? { mimeHint: extracted.mimeHint } : {}),
      };
      next[key] = stub;
    }
    return next;
  });
  return { rows, anexos };
};

export const avisoAnexos = (
  count: number,
  origem?: OrigemAnexoHandle,
): { code: string; message: string } | undefined => {
  if (count <= 0) {
    return undefined;
  }
  if (origem === "inspecionar_consulta") {
    return {
      code: "ANEXO",
      message:
        "Célula binária omitida das rows (stub kind=anexo, sem handle). Inspeção não emite handle exportável. Foto livre: consultar_dados + exportar_anexo. Não invente bytes. Não use inspeção como segunda via de foto pessoal.",
    };
  }
  return {
    code: "ANEXO",
    message:
      "Célula binária omitida das rows (stub kind=anexo). Chame exportar_anexo com o handle de consultar_dados; não invente bytes. Sem handle: não há bytes para exportar. Foto pessoal: PRIVACIDADE_NEGADA — não use inspecionar_consulta.",
  };
};
