import type { ConhecimentoSkillPublicado, Skill } from "../../../domain/entities/skill.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import type { AnotacaoGrafoRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
} from "../../../domain/entities/relacionamento.js";

export const capturarConhecimentoPublicavel = async (
  grafo: GrafoRepositoryPort,
  anotacoes: AnotacaoGrafoRepositoryPort | undefined,
  acessoId: string,
  skill: Skill,
): Promise<ConhecimentoSkillPublicado> => {
  const tabelas = (await grafo.listTabelas(acessoId)).filter((table) =>
    skill.escopo.tabelas.some((name) => name.toLowerCase() === table.nome.toLowerCase()),
  );
  const nomes = new Map(tabelas.map((table) => [table.id, table.nome]));
  const colunas: ConhecimentoSkillPublicado["colunas"][number][] = [];
  for (const table of tabelas) {
    const authorized =
      Object.entries(skill.escopo.colunasPorTabela).find(
        ([name]) => name.toLowerCase() === table.nome.toLowerCase(),
      )?.[1] ?? [];
    for (const col of await grafo.listColunas(acessoId, table.id)) {
      if (!authorized.some((name) => name.toLowerCase() === col.nome.toLowerCase())) {
        continue;
      }
      const valuesAllowed = col.sensibilidade === "livre" && col.origem !== "inferido";
      colunas.push({
        tabela: table.nome,
        nome: col.nome,
        tipo: col.tipo,
        nullable: col.nullable,
        papel: col.papel,
        dicionario: valuesAllowed ? col.dicionario : null,
        formato: col.formato,
        descricao: col.descricao,
        perfil: valuesAllowed ? col.perfil : null,
        sensibilidade: col.sensibilidade,
        origem: col.origem,
        status: col.status,
      });
    }
  }
  const relacionamentos = (await grafo.listRelacionamentos(acessoId)).flatMap((rel) => {
    const origem = nomes.get(rel.tabelaOrigemId),
      destino = nomes.get(rel.tabelaDestinoId);
    const match =
      origem && destino
        ? skill.escopo.relacionamentos.find(
            (item) =>
              (item.tabelaOrigem.toLowerCase() === origem.toLowerCase() &&
                item.tabelaDestino.toLowerCase() === destino.toLowerCase() &&
                fingerprintPares(paresDoRelacionamento(item)) === fingerprintPares(rel.pares)) ||
              (item.tabelaDestino.toLowerCase() === origem.toLowerCase() &&
                item.tabelaOrigem.toLowerCase() === destino.toLowerCase() &&
                fingerprintPares(paresDoRelacionamento(item)) ===
                  fingerprintParesInvertidos(rel.pares)),
          )
        : undefined;
    return origem && destino && match
      ? [
          {
            origem,
            destino,
            colunaOrigem: rel.colunaOrigem,
            colunaDestino: rel.colunaDestino,
            pares: [...rel.pares],
            tipoJoin: match.tipoJoin ?? rel.tipoJoin,
            cardinalidade: match.cardinalidade ?? null,
            descricao: rel.descricao,
            origemFato: rel.origem,
            escopoValidacao: rel.escopoValidacao,
          },
        ]
      : [];
  });
  const notas = anotacoes
    ? (await anotacoes.list(acessoId)).filter(
        (note) =>
          note.skillId === skill.id || (!note.skillId && note.tabelaId && nomes.has(note.tabelaId)),
      )
    : [];
  colunas.sort((a, b) => `${a.tabela}.${a.nome}`.localeCompare(`${b.tabela}.${b.nome}`));
  relacionamentos.sort((a, b) =>
    `${a.origem}.${a.destino}.${fingerprintPares(a.pares)}`.localeCompare(
      `${b.origem}.${b.destino}.${fingerprintPares(b.pares)}`,
    ),
  );
  notas.sort((a, b) => a.id.localeCompare(b.id));
  return {
    colunas,
    relacionamentos,
    regras: notas.filter((note) => note.tipo === "regra"),
    metricas: notas.filter((note) => note.tipo === "metrica"),
  };
};
