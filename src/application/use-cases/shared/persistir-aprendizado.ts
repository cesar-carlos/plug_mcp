import type { AnotacaoGrafo, ParametroSkill } from "../../../domain/entities/skill.js";
import type { ConsultaAprendida } from "../../../domain/entities/aprendizado.js";
import { overlayMetricasSaida } from "../../../domain/entities/escopo.js";
import { isDomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../../domain/ports/skill-repository.port.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { isIdentificadorSql } from "./schema-introspection.js";
import { requireSkillDoAcesso } from "./skill-do-acesso.js";

export const TIPOS_APRENDIZADO = new Set([
  "regra",
  "metrica",
  "glossario",
  "dicionario",
  "sinonimo",
  "uso",
]);

export interface ItemAprendizadoInput {
  readonly tipo?: string;
  readonly titulo?: string;
  readonly texto?: string;
  readonly tabela?: string;
  readonly skillId?: string;
}

export const persistirConsultaExecutada = async (input: {
  aprendizado: AprendizadoRepositoryPort;
  acessoId: string;
  skillIds: readonly string[];
  pergunta: string;
  sql: string;
  paramsContrato: readonly ParametroSkill[];
  autorUsuarioId: string;
}): Promise<ConsultaAprendida> =>
  input.aprendizado.salvarConsulta({
    acessoId: input.acessoId,
    skillIds: input.skillIds,
    pergunta: input.pergunta,
    sql: input.sql,
    paramsContrato: input.paramsContrato,
    autorUsuarioId: input.autorUsuarioId,
  });

export const persistirItensAprendizado = async (input: {
  acessoId: string;
  autorUsuarioId: string;
  itens: readonly ItemAprendizadoInput[];
  grafo: GrafoRepositoryPort;
  anotacoes: AnotacaoGrafoRepositoryPort;
  aprendizado: AprendizadoRepositoryPort;
  skills?: SkillRepositoryPort;
  strictMetricas?: boolean;
}): Promise<{
  anotacoes: AnotacaoGrafo[];
  sinonimos: number;
  avisos: { code: string; message: string }[];
}> => {
  const anotacoes: AnotacaoGrafo[] = [];
  let sinonimos = 0;
  const avisos: { code: string; message: string }[] = [];
  for (const item of input.itens) {
    const tipo = (item.tipo?.trim() ? item.tipo.trim() : "uso").toLowerCase();
    const titulo = item.titulo?.trim() ?? "";
    const texto = item.texto?.trim() ?? "";
    if (!titulo || !texto) {
      avisos.push({
        code: "APRENDIZADO_IGNORADO",
        message: "Item de aprendizado sem titulo ou texto foi ignorado.",
      });
      continue;
    }
    if (!TIPOS_APRENDIZADO.has(tipo)) {
      avisos.push({
        code: "APRENDIZADO_IGNORADO",
        message: `tipo "${tipo}" inválido. Use regra, metrica, glossario, dicionario ou sinonimo.`,
      });
      continue;
    }
    const skillId: string | null = item.skillId?.trim() ? item.skillId.trim() : null;
    const skill =
      skillId === null ? null : await requireSkillDoAcesso(input.skills, skillId, input.acessoId);
    if (tipo === "sinonimo") {
      await input.aprendizado.registrarSinonimo({
        acessoId: input.acessoId,
        termo: titulo,
        alvoTipo: skillId ? "skill" : "termo",
        alvoId: skillId ?? texto,
      });
      sinonimos += 1;
      continue;
    }
    let tabelaId: string | null = null;
    if (item.tabela?.trim()) {
      const tabela = await input.grafo.findTabelaByNome(input.acessoId, item.tabela.trim());
      if (!tabela) {
        avisos.push({
          code: "APRENDIZADO_IGNORADO",
          message: `Tabela ${item.tabela.trim()} não está no grafo; anotação não foi gravada como global.`,
        });
        continue;
      }
      tabelaId = tabela.id;
    }
    if (tipo === "dicionario") {
      const colunaNome = titulo;
      if (!tabelaId) {
        avisos.push({
          code: "APRENDIZADO_IGNORADO",
          message: "Dicionário exige tabela e coluna explícitas.",
        });
        continue;
      }
      if (!isIdentificadorSql(colunaNome)) {
        avisos.push({
          code: "APRENDIZADO_IGNORADO",
          message:
            "Título de dicionário não é coluna física; anotação permanece, coluna do grafo não é criada.",
        });
      } else {
        await input.grafo.mergeColuna({
          acessoId: input.acessoId,
          tabelaId,
          nome: colunaNome,
          dicionario: texto,
          origem: "confirmado_usuario",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    if (tipo === "metrica" && skill && input.skills) {
      try {
        const next = overlayMetricasSaida(skill.escopo, [{ alias: titulo, definicao: texto }]);
        await input.skills.update(skill.id, { escopo: next, status: skill.status });
      } catch (err) {
        if (
          input.strictMetricas === false &&
          isDomainError(err) &&
          err.code === ERROR_CODES.COLUNA_FORA_DO_ESCOPO
        ) {
          avisos.push({
            code: "APRENDIZADO_IGNORADO",
            message: err.message,
          });
        } else {
          throw err;
        }
      }
    }
    const anotacao = await input.anotacoes.create({
      acessoId: input.acessoId,
      tabelaId,
      skillId,
      tipo,
      titulo,
      texto,
      autorUsuarioId: input.autorUsuarioId,
    });
    anotacoes.push(anotacao);
  }
  return { anotacoes, sinonimos, avisos };
};
