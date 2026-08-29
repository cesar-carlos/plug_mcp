import { describe, expect, it } from "vitest";
import { registroOperacoesGlobal } from "../../src/application/use-cases/shared/progresso-operacao.js";

describe("progresso e cancelamento", () => {
  it("cancela só a operação do mesmo usuário", () => {
    const a = registroOperacoesGlobal.iniciar("u1", "treinar_com_sql", 16);
    const b = registroOperacoesGlobal.iniciar("u2", "treinar_com_sql", 16);
    expect(registroOperacoesGlobal.cancelar("u2", a.operacaoId)).toBe(false);
    expect(registroOperacoesGlobal.cancelar("u1", a.operacaoId)).toBe(true);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    registroOperacoesGlobal.finalizar(a.operacaoId);
    registroOperacoesGlobal.finalizar(b.operacaoId);
  });
});
