import type { ParametroSkill } from "./skill.js";
import type { ConsultaAprendida } from "./aprendizado.js";
// Tokenize without changing quoted literals/identifiers or parameter spelling.
export const identidadeConsulta = (input: {
  sql: string;
  paramsContrato: readonly ParametroSkill[];
  publicacoes?: ConsultaAprendida["publicacoes"];
  skillIds: readonly string[];
}): string =>
  JSON.stringify({
    sql: (
      input.sql.match(
        /'(?:''|[^'])*'|"(?:""|[^"])*"|\[[^\]]+\]|:[a-zA-Z_][\w]*|[a-zA-Z_][\w]*|\d+(?:\.\d+)?|[^\s]/g,
      ) ?? []
    ).join(" "),
    params: [...input.paramsContrato].sort((a, b) => a.nome.localeCompare(b.nome)),
    publicacoes: [...(input.publicacoes ?? [])].sort((a, b) => a.skillId.localeCompare(b.skillId)),
    skillIds: [...input.skillIds].sort(),
  });
