import { describe, expect, it } from "vitest";
import {
  mascararLinhas,
  REDACTED,
  TEXTO_OCULTO,
} from "../../src/application/use-cases/shared/mascarar-linhagem.js";
import { tryParseSelect } from "../../src/application/use-cases/shared/sql-ast.js";

describe("mascaramento por linhagem", () => {
  it("pseudonimiza PII, oculta texto livre e redige segredo mesmo com alias", () => {
    const ast = tryParseSelect(
      "SELECT c.nome AS cliente, c.senha AS secret, c.observacao AS obs, c.valor AS total FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    const { rows, colunasMascaradas } = mascararLinhas({
      columns: ["cliente", "secret", "obs", "total"],
      rows: [{ cliente: "Maria", secret: "abc", obs: "ligou ontem", total: 10 }],
      ast,
      sessaoId: "sess-1",
      lookup: (_tabela, coluna) => {
        if (coluna.toLowerCase() === "nome") return "pessoal";
        if (coluna.toLowerCase() === "senha") return "segredo";
        if (coluna.toLowerCase() === "observacao") return "sensivel";
        return "livre";
      },
    });
    expect(rows[0]?.cliente).toMatch(/^p_/);
    expect(rows[0]?.cliente).not.toBe("Maria");
    expect(rows[0]?.secret).toBe(REDACTED);
    expect(rows[0]?.obs).toBe(TEXTO_OCULTO);
    expect(rows[0]?.total).toBe(10);
    expect(colunasMascaradas).toEqual(expect.arrayContaining(["cliente", "secret", "obs"]));
    const again = mascararLinhas({
      columns: ["cliente"],
      rows: [{ cliente: "Maria" }],
      ast,
      sessaoId: "sess-1",
      lookup: () => "pessoal",
    });
    expect(again.rows[0]?.cliente).toBe(rows[0]?.cliente);
  });

  it("em consulta analítica só redige segredo", () => {
    const { rows } = mascararLinhas({
      columns: ["nome", "token"],
      rows: [{ nome: "Ana", token: "xyz" }],
      ast: null,
      sessaoId: "s",
      lookup: (_t, coluna) => (coluna === "token" ? "segredo" : "pessoal"),
      incluirPessoal: false,
    });
    expect(rows[0]?.nome).toBe("Ana");
    expect(rows[0]?.token).toBe(REDACTED);
  });

  it("resolve alias do FROM para o nome físico da tabela", () => {
    const ast = tryParseSelect(
      "SELECT c.obs_interna AS nota FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(ast).not.toBeNull();
    const seen: string[] = [];
    mascararLinhas({
      columns: ["nota"],
      rows: [{ nota: "x" }],
      ast,
      sessaoId: "s",
      lookup: (tabela, coluna) => {
        seen.push(`${tabela ?? ""}:${coluna}`);
        if (tabela?.toLowerCase() === "cliente" && coluna.toLowerCase() === "obs_interna") {
          return "sensivel";
        }
        return "livre";
      },
    });
    expect(seen.some((item) => item.toLowerCase() === "cliente:obs_interna")).toBe(true);
  });
});
