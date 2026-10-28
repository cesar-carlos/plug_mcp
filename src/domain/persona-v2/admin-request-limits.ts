/** Transport budgets are independent of permission cardinality and authority. */
export const ADMIN_JSON_BYTES = 64 * 1024;
export const TOKEN_JSON_BYTES = 1024 * 1024;
export const TOKEN_REQUEST_TOO_LARGE =
  "As concessões selecionadas excedem o limite de 1 MiB por solicitação. Reduza a seleção ou distribua os acessos entre tokens. Nenhuma alteração foi aplicada; o formulário foi preservado.";

export function isTokenWritePath(path: string, method: string): boolean {
  return (
    method.toUpperCase() === "POST" &&
    /^\/api\/admin\/personas\/[0-9a-f-]{36}\/tokens(?:\/[0-9a-f-]{36}\/(?:editar|rotacionar))?\/?$/i.test(
      path,
    )
  );
}
