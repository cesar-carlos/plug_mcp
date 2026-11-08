import { PersonaV2Error } from "./model.js";

const messages = {
  invalid_response: "A integração externa devolveu uma resposta incompatível com o protocolo.",
  rpc_error: "O servidor MCP externo recusou a chamada JSON-RPC.",
  tool_error: "A ferramenta MCP externa informou falha na execução.",
  listing_incomplete: "O catálogo MCP externo está incompleto ou contém duplicações.",
  http_status: "O serviço externo retornou um status HTTP de falha.",
  response_limit: "A resposta externa excedeu o limite permitido.",
  response_encoding: "A resposta externa usa uma codificação não permitida.",
} as const;

/** No remote message, destination, tool name or data is retained. */
export class ExternalFailure extends PersonaV2Error {
  readonly details: Readonly<Record<string, string | number>>;
  constructor(
    readonly reason: keyof typeof messages,
    readonly stage: "external_http" | "external_mcp",
    code?: number,
  ) {
    super("CAPABILITY_UNAVAILABLE", messages[reason], {
      source: "mcp",
      hint: "Informe o supportId ao responsável pela integração. Não reconecte o OAuth nem repita automaticamente. Para ações já enviadas, consulte o estado original; falha não comprova rollback.",
    });
    this.details = {
      externalReason: reason,
      ...(reason === "rpc_error" && Number.isSafeInteger(code) && code! >= -32768 && code! <= -32000
        ? { rpcCode: code! }
        : {}),
      ...(reason === "http_status" && Number.isInteger(code) && code! >= 300 && code! <= 599
        ? { httpStatus: code! }
        : {}),
    };
  }
}
