import { z } from "zod";
import { parseEscopoSkill } from "../../domain/entities/escopo.js";
import { parseConsultaSemantica } from "../../domain/entities/consulta-semantica.js";
import { parsePoliticaConsulta } from "../../domain/entities/politica-consulta.js";
import { parseParametroSkillList, type Skill } from "../../domain/entities/skill.js";

const noteSchema = z.object({
  id: z.string(),
  acessoId: z.string().nullable(),
  tabelaId: z.string().nullable(),
  skillId: z.string().nullable(),
  tipo: z.string(),
  titulo: z.string(),
  texto: z.string(),
  autorUsuarioId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  fonteTipo: z.enum(["usuario", "erp", "documento", "importacao", "legado", "outro"]).optional(),
  fonteReferencia: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  validadoEm: z.coerce.date().nullable().optional(),
  vigenteDe: z.string().nullable().optional(),
  vigenteAte: z.string().nullable().optional(),
  revisarEm: z.string().nullable().optional(),
  periodoRevisaoDias: z.number().nullable().optional(),
  status: z.enum(["vigente", "obsoleta"]).optional(),
});
const knowledgeSchema = z.object({
  colunas: z.array(
    z.object({
      tabela: z.string(),
      nome: z.string(),
      tipo: z.string().nullable(),
      nullable: z.boolean().nullable(),
      papel: z.string().nullable(),
      dicionario: z.string().nullable(),
      formato: z.string().nullable(),
      descricao: z.string().nullable(),
      perfil: z.unknown(),
      sensibilidade: z.string(),
      origem: z.string(),
      status: z.string(),
    }),
  ),
  relacionamentos: z.array(
    z.object({
      origem: z.string(),
      destino: z.string(),
      colunaOrigem: z.string(),
      colunaDestino: z.string(),
      pares: z.array(z.object({ colunaOrigem: z.string(), colunaDestino: z.string() })),
      tipoJoin: z.string(),
      cardinalidade: z.string().nullable(),
      descricao: z.string().nullable(),
      origemFato: z.string(),
      escopoValidacao: z
        .object({ empresa: z.string().optional(), filial: z.string().optional() })
        .nullable(),
    }),
  ),
  regras: z.array(noteSchema),
  metricas: z.array(noteSchema),
});

export const skillDoSnapshot = (
  draft: Skill,
  snapshot: {
    id: string;
    pacote: Readonly<Record<string, unknown>>;
    pacoteHash: string;
    skillVersao: number;
  },
): Skill => {
  const p = snapshot.pacote;
  if (typeof p.sqlModelo !== "string" || typeof p.nome !== "string" || !p.escopo) {
    throw new Error("invalid published snapshot");
  }
  return {
    ...draft,
    conhecimentoPublicado: p.conhecimentoPublicado
      ? knowledgeSchema.parse(p.conhecimentoPublicado)
      : undefined,
    slug: typeof p.slug === "string" ? p.slug : draft.slug,
    nome: p.nome,
    descricao: typeof p.descricao === "string" ? p.descricao : "",
    sqlModelo: p.sqlModelo,
    params: parseParametroSkillList(p.params),
    escopo: parseEscopoSkill(p.escopo),
    pacoteVersao: typeof p.pacoteVersao === "number" ? p.pacoteVersao : 2,
    consultaSemantica: parseConsultaSemantica(p.consultaSemantica),
    politicaConsulta: parsePoliticaConsulta(p.politicaConsulta),
    versao: snapshot.skillVersao,
    status: "publicada",
    statusRascunho: draft.status,
    publicacaoAtivaId: snapshot.id,
    publicacaoHash: snapshot.pacoteHash,
  };
};
