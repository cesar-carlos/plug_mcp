import { describe, expect, it } from "vitest";
import {
  clearSourceCredentials,
  draftSourceRestrictions,
  emptySourceCredentials,
  emptySourceRestriction,
  hasSourceCredentials,
  isSourceIdentityDirty,
  isSourceSettingsDirty,
  publishedSourceRestrictions,
  sourceImpactUrl,
  sourceSettingsSnapshot,
} from "./source-settings";

describe("edição de cadastro da fonte", () => {
  it("converte recortes para rascunho textual e devolve o valor tipado ao salvar", () => {
    const drafts = draftSourceRestrictions([
      { table: "pedidos", column: "filial", parameter: "__scope_filial", value: 12 },
      { table: "pedidos", column: "ativo", parameter: "__scope_ativo", value: true },
      { table: "pedidos", column: "nome", parameter: "__scope_nome", value: "a" },
    ]);
    expect(drafts).toEqual([
      {
        table: "pedidos",
        column: "filial",
        parameter: "__scope_filial",
        value: "12",
        type: "number",
      },
      {
        table: "pedidos",
        column: "ativo",
        parameter: "__scope_ativo",
        value: "true",
        type: "boolean",
      },
      {
        table: "pedidos",
        column: "nome",
        parameter: "__scope_nome",
        value: "a",
        type: "string",
      },
    ]);
    expect(publishedSourceRestrictions(drafts)).toEqual([
      { table: "pedidos", column: "filial", parameter: "__scope_filial", value: 12 },
      { table: "pedidos", column: "ativo", parameter: "__scope_ativo", value: true },
      { table: "pedidos", column: "nome", parameter: "__scope_nome", value: "a" },
    ]);
    expect(emptySourceRestriction()).toEqual({
      table: "",
      column: "",
      parameter: "__scope_",
      value: "",
      type: "string",
    });
  });

  it("marca sujeira só com identidade ou credencial local, sem persistir segredo", () => {
    const form = { name: "ERP", purpose: "consulta", environment: "desenvolvimento" };
    const restrictions = draftSourceRestrictions([]);
    const initial = sourceSettingsSnapshot(form, restrictions);
    const credentials = emptySourceCredentials();
    expect(isSourceIdentityDirty(form, restrictions, initial)).toBe(false);
    expect(isSourceSettingsDirty(form, restrictions, initial, credentials)).toBe(false);
    form.name = "Novo";
    expect(isSourceIdentityDirty(form, restrictions, initial)).toBe(true);
    form.name = "ERP";
    credentials.password = "segredo";
    expect(hasSourceCredentials(credentials)).toBe(true);
    expect(isSourceIdentityDirty(form, restrictions, initial)).toBe(false);
    expect(isSourceSettingsDirty(form, restrictions, initial, credentials)).toBe(true);
    clearSourceCredentials(credentials);
    expect(credentials).toEqual(emptySourceCredentials());
    expect(isSourceSettingsDirty(form, restrictions, initial, credentials)).toBe(false);
  });

  it("fixa a versão esperada no pedido de impacto", () => {
    expect(sourceImpactUrl("/api/personas/p1", "fonte-1", 4)).toBe(
      "/api/personas/p1/fontes/fonte-1/impacto?expectedVersion=4",
    );
  });
});
