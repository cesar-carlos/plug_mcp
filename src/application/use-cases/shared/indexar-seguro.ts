import type { EscopoCatalogo } from "../../../domain/entities/fonte.js";
import type {
  IndiceContextoPort,
  ItemIndexavel,
} from "../../../domain/ports/indice-contexto.port.js";
import type { LoggerPort } from "../../../domain/ports/logger.port.js";

/** Embedding é complementar: a nota/consulta já persistida não deve falhar se o índice cair. */
export const indexarSeguro = async (
  indice: IndiceContextoPort,
  logger: LoggerPort,
  escopo: EscopoCatalogo,
  item: ItemIndexavel,
): Promise<void> => {
  try {
    await indice.indexar(escopo, item);
  } catch (error) {
    logger.warn("embedding index failed", {
      tipo: item.tipo,
      id: item.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
