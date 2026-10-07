import { describe, expect, it } from "vitest";
import { assertPrivacidadeAntesDoHub } from "../../src/application/use-cases/shared/assert-privacidade.js";
import { lookupSensibilidadeGrafo } from "../../src/application/use-cases/shared/mascarar-linhagem.js";
import { tryParseSelect } from "../../src/application/use-cases/shared/sql-ast.js";
import {
  inferirSensibilidadeColuna,
  sensibilidadeGravadaEfetiva,
} from "../../src/domain/entities/privacidade.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const acessoId = "22222222-2222-4222-8222-222222222222";
const usuarioId = "33333333-3333-4333-8333-333333333333";

describe("classificação de colunas projetáveis", () => {
  it("só infere segredo pelo nome", () => {
    for (const nome of [
      "telefone",
      "celular",
      "email",
      "endereco",
      "bairro",
      "cep",
      "nome",
      "cpf",
      "cnpj",
      "cidade",
      "nascimento",
      "observacao",
      "historico",
    ]) {
      expect(inferirSensibilidadeColuna(nome), nome).toBe("livre");
    }
    expect(inferirSensibilidadeColuna("memo")).toBe("livre");
    for (const nome of ["senha", "password", "token", "api_key", "chave", "hash"]) {
      expect(inferirSensibilidadeColuna(nome), nome).toBe("segredo");
    }
  });

  it("rebaixa pessoal e sensível inferidos e preserva confirmação", () => {
    expect(
      sensibilidadeGravadaEfetiva({
        nome: "cpf",
        gravada: "pessoal",
        origem: "inferido",
      }),
    ).toBe("livre");
    expect(
      sensibilidadeGravadaEfetiva({
        nome: "observacao",
        gravada: "sensivel",
        origem: "validado_execucao",
      }),
    ).toBe("livre");
    expect(
      sensibilidadeGravadaEfetiva({
        nome: "cpf",
        gravada: "pessoal",
        origem: "confirmado_usuario",
      }),
    ).toBe("pessoal");
    expect(
      sensibilidadeGravadaEfetiva({
        nome: "senha",
        gravada: "segredo",
        origem: "inferido",
      }),
    ).toBe("segredo");
  });

  it("permite projetar pessoal e sensível e recusa segredo", () => {
    const livre = tryParseSelect(
      "SELECT c.nome, c.cpf, c.telefone, c.observacao FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(livre).not.toBeNull();
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: livre!,
        lookup: () => null,
        negar: ["pessoal", "segredo"],
      }),
    ).not.toThrow();

    const segredo = tryParseSelect("SELECT c.senha FROM cliente c WHERE c.codcli > 0", "mssql");
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: segredo!,
        lookup: () => null,
        negar: ["pessoal", "segredo"],
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.PRIVACIDADE_NEGADA }));
  });

  it("não bloqueia pessoal já gravado por inferência", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela } = await grafo.mergeTabela({
      acessoId,
      nome: "cliente",
      origem: "inferido",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId,
      tabelaId: tabela.id,
      nome: "cpf",
      tipo: "varchar",
      sensibilidade: "pessoal",
      origem: "inferido",
      autorUsuarioId: usuarioId,
    });
    const lookup = await lookupSensibilidadeGrafo(grafo, acessoId, ["cliente"]);
    expect(lookup("cliente", "cpf")).toBe("livre");
    const ast = tryParseSelect("SELECT c.cpf FROM cliente c WHERE c.codcli > 0", "mssql");
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: ast!,
        lookup,
        negar: ["pessoal", "segredo"],
      }),
    ).not.toThrow();
  });
});
