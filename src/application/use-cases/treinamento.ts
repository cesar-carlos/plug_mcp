import { inferirSensibilidadeColuna } from "../../domain/entities/privacidade.js";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { TreinamentoRepositoryPort } from "../../domain/ports/treinamento-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import { parseParametroSkillList } from "../../domain/entities/skill.js";
import { z } from "zod";
import type { Skill } from "../../domain/entities/skill.js";
import { parseEscopoSkill } from "../../domain/entities/escopo.js";
import { requireAcesso, requireUsuario } from "./shared/guards.js";
import { textoSeguro, capturaSqlSegura } from "./shared/curadoria-segura.js";
import {
  validarFixturesTipadas,
  casoArmazenado,
  casoSchema,
  gateTestes,
  hashTreino,
  skillTesteHash,
} from "./shared/casos-treino.js";
import { TREINAMENTO_BASE } from "./shared/treinamento-base.js";
import { fluxoEFaltasForAcessoSkill } from "./shared/fluxo-treino.js";
import { validarSqlNoEscopo } from "./shared/validar-escopo.js";
import { assertFanoutSeguro } from "./shared/assert-fanout.js";
function fail(message: string, code: string = ERROR_CODES.VALIDATION_ERROR): never {
  throw new DomainError({
    code: code as typeof ERROR_CODES.VALIDATION_ERROR,
    message,
    hint: "Revise o conteúdo e gere um novo preview.",
  });
}
export interface ConfirmacaoTreino {
  confirmadoPeloUsuario?: boolean;
  confirmacaoHash?: string;
}
const approved = (
  content: unknown,
  input: ConfirmacaoTreino,
): { confirmacaoPendente: true; confirmacaoHash: string } | null => {
  const hash = hashTreino(content);
  if (!input.confirmadoPeloUsuario || !input.confirmacaoHash)
    return { confirmacaoPendente: true, confirmacaoHash: hash };
  if (input.confirmacaoHash !== hash)
    fail("Confirmação desatualizada.", ERROR_CODES.CONFIRMACAO_DESATUALIZADA);
  return null;
};
const safeDocument = (value: unknown): boolean =>
  typeof value === "string"
    ? textoSeguro(value)
    : Array.isArray(value)
      ? value.every(safeDocument)
      : value && typeof value === "object"
        ? Object.entries(value).every(
            ([k, v]) =>
              !/(?:password|senha|client_token|bearer|secret|handle|amostra|perfil)/i.test(k) &&
              safeDocument(v),
          )
        : true;
export class Treinamento {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
    private readonly repository: TreinamentoRepositoryPort,
    private readonly audit: AuditLogPort,
  ) {}
  private async access(uid: string | undefined) {
    return requireAcesso(this.acessos, undefined, requireUsuario(uid));
  }
  private async skill(access: string, id: string): Promise<Skill> {
    const s = await this.skills.findById(id);
    if (s?.acessoId !== access) fail("Skill não encontrada neste acesso.");
    return s;
  }
  async listarConsultas(
    uid: string | undefined,
    input: { skillId?: string; estado?: string; pagina?: number; limite?: number },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const page = await this.aprendizado.paginarConsultas({
      acessoId: a.id,
      skillId: input.skillId,
      estado: input.estado,
      pagina: input.pagina ?? 1,
      limite: input.limite ?? 25,
    });
    return {
      success: true,
      total: page.total,
      pagina: input.pagina ?? 1,
      consultas: page.consultas.map(({ sql: _sql, paramsContrato: _params, ...r }) => r),
    };
  }

  async obterConsulta(uid: string | undefined, id: string): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const c = await this.aprendizado.obterConsulta(a.id, id);
    if (!c) fail("Consulta não encontrada neste acesso.");
    const current = await Promise.all(
      (c.publicacoes ?? []).map(async (p) => {
        const s = await this.skills.findPublicadaById(p.skillId);
        return s?.acessoId === a.id && s.publicacaoAtivaId === p.id && s.publicacaoHash === p.hash;
      }),
    );
    return {
      success: true,
      consulta: c,
      reutilizavel: c.status === "confirmada" && current.length > 0 && current.every(Boolean),
    };
  }
  async inativarConsulta(
    uid: string | undefined,
    input: ConfirmacaoTreino & { consultaAprendidaId: string; motivo: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const c = await this.aprendizado.obterConsulta(a.id, input.consultaAprendidaId);
    if (!c || !textoSeguro(input.motivo)) fail("Consulta ou motivo inválidos.");
    const preview = {
      acessoId: a.id,
      consulta: {
        id: c.id,
        versao: c.versao ?? 1,
        sql: c.sql,
        pergunta: c.pergunta,
        paramsContrato: c.paramsContrato,
        publicacoes: c.publicacoes,
        status: c.status,
      },
      motivo: input.motivo,
    };
    const pending = approved(preview, input);
    if (pending) return { success: true, ...pending, preview };
    return {
      success: true,
      consulta: await this.aprendizado.alterarEstado({
        acessoId: a.id,
        id: c.id,
        expectedVersion: c.versao ?? 1,
        status: "inativa",
        autorUsuarioId: requireUsuario(uid),
        motivo: input.motivo,
        publicacoes: c.publicacoes ?? [],
      }),
    };
  }
  async confirmarGrao(
    uid: string | undefined,
    input: ConfirmacaoTreino & {
      skillId: string;
      tabela: string;
      significado: string;
      chaves: string[];
      evidencia: "declaracao_usuario" | "constraint_banco";
    },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    return this.grafo.withAcessoLock(a.id, async () => {
      const s = await this.skill(a.id, input.skillId);
      const columns = s.escopo.colunasPorTabela[input.tabela];
      if (
        !columns ||
        !input.chaves.length ||
        input.chaves.some((c) => !columns.includes(c)) ||
        !textoSeguro(input.significado)
      )
        fail("Informe tabela e chaves físicas do pacote.");
      const payload = {
        acessoId: a.id,
        skillId: s.id,
        versao: s.versao,
        tabela: input.tabela,
        significado: input.significado,
        chaves: input.chaves,
        evidencia: input.evidencia,
      };
      const pending = approved(payload, input);
      if (pending) return { success: true, ...pending, preview: payload };
      return {
        success: true,
        skill: await this.skills.update(s.id, {
          status: "rascunho",
          escopo: {
            ...s.escopo,
            graosConfirmados: {
              ...s.escopo.graosConfirmados,
              [input.tabela]: {
                significado: input.significado,
                chaves: input.chaves,
                evidencia: input.evidencia,
              },
            },
          },
        }),
        aplicacao:
          "Grão de origem declarado; GROUP BY não comprova unicidade. Evidência de constraint ainda exige verificação no destino.",
      };
    });
  }
  async confirmarConstante(
    uid: string | undefined,
    input: ConfirmacaoTreino & {
      skillId: string;
      tabela: string;
      coluna: string;
      valor: string | number | boolean;
    },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    return this.grafo.withAcessoLock(a.id, async () => {
      const s = await this.skill(a.id, input.skillId),
        published = await this.skills.findPublicadaById(s.id);
      const col = published?.conhecimentoPublicado?.colunas.find(
        (c) => c.tabela === input.tabela && c.nome === input.coluna,
      );
      if (
        !col ||
        (a.escopoPadrao?.bindings ?? []).some(
          (b) => b.tabela === input.tabela && b.coluna === input.coluna,
        ) ||
        inferirSensibilidadeColuna(input.coluna) !== "livre" ||
        !["livre"].includes(String(col.sensibilidade)) ||
        !textoSeguro(String(input.valor))
      )
        fail("Constante exige coluna classificada não pessoal/ secreta e confirmação explícita.");
      const data = {
        acessoId: a.id,
        skillId: s.id,
        versao: s.versao,
        tabela: input.tabela,
        coluna: input.coluna,
        valor: input.valor,
      };
      const pending = approved(data, input);
      if (pending) return { success: true, ...pending, preview: data };
      return {
        success: true,
        skill: await this.skills.update(s.id, {
          status: "rascunho",
          escopo: {
            ...s.escopo,
            constantesNegocio: [
              ...(s.escopo.constantesNegocio ?? []).filter(
                (c) => c.tabela !== input.tabela || c.coluna !== input.coluna,
              ),
              { tabela: input.tabela, coluna: input.coluna, valor: input.valor },
            ],
          },
        }),
      };
    });
  }
  async casos(
    uid: string | undefined,
    input: { skillId?: string; casoId?: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const rows = await this.repository.list(a.id, "caso", input.skillId);
    return {
      success: true,
      casos: input.casoId ? rows.filter((r) => r.id === input.casoId) : rows,
    };
  }
  async salvarCaso(
    uid: string | undefined,
    input: ConfirmacaoTreino & { skillId: string; casoId?: string; versao?: number; caso: unknown },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const s = await this.skill(a.id, input.skillId);
    const caso = casoSchema.parse(input.caso);
    if (caso.dialeto !== a.dialeto || !safeDocument(caso) || !validarFixturesTipadas(caso))
      fail("Caso deve ser sintético, seguro, tipado e no dialeto do acesso.");
    if (caso.sql) {
      if (caso.decisaoEsperada === "permitida") {
        const ast = validarSqlNoEscopo(caso.sql, a.dialeto, s.escopo);
        assertFanoutSeguro(ast, s.escopo);
      }
    }
    const id = input.casoId ?? randomUUID();
    const old = input.casoId
      ? (await this.repository.list(a.id, "caso", s.id)).find((r) => r.id === id)
      : undefined;
    if (input.casoId && !old && input.versao !== 0) fail("Caso inexistente.");
    const body = { ...caso, skillVersao: s.versao, skillHash: skillTesteHash(s) };
    const data = {
      id,
      acessoId: a.id,
      skillId: s.id,
      expectedVersion: input.versao ?? old?.versao ?? 0,
      conteudo: body,
    };
    const pending = approved(data, input);
    if (pending)
      return { success: true, ...pending, casoId: id, versao: data.expectedVersion, preview: body };
    return {
      success: true,
      caso: await this.repository.append({
        ...data,
        tipo: "caso",
        autorUsuarioId: requireUsuario(uid),
      }),
    };
  }
  async arquivarCaso(
    uid: string | undefined,
    input: ConfirmacaoTreino & { casoId: string; skillId: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const old = (await this.repository.list(a.id, "caso", input.skillId)).find(
      (c) => c.id === input.casoId,
    );
    if (!old) fail("Caso inexistente.");
    return this.salvarCaso(uid, {
      ...input,
      versao: old.versao,
      caso: { ...casoArmazenado(old.conteudo), status: "arquivado" },
    });
  }
  async feedback(
    uid: string | undefined,
    input: { execucaoId: string; categoria: string; correcao?: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const e = (await this.audit.listByAcesso(a.id, 10000)).find(
      (r) => r.id === input.execucaoId && r.tool === "consultar_dados" && r.sucesso,
    );
    if (
      !e ||
      !textoSeguro(input.correcao ?? "") ||
      /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i.test(input.correcao ?? "")
    )
      fail("Execução não encontrada ou correção insegura.");
    return {
      success: true,
      feedback: await this.repository.append({
        id: randomUUID(),
        acessoId: a.id,
        skillId: null,
        tipo: "feedback",
        expectedVersion: 0,
        autorUsuarioId: requireUsuario(uid),
        conteudo: {
          execucaoId: e.id,
          publicacoes: e.metadata?.publicacoes ?? [],
          categoria: input.categoria,
          correcao: input.correcao ?? null,
          status: "pendente",
        },
      }),
    };
  }
  async revisarFeedback(
    uid: string | undefined,
    input: ConfirmacaoTreino & {
      feedbackId: string;
      resultado: string;
      skillId?: string;
      consultaAprendidaId?: string;
      casoId?: string;
    },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const feedback = (await this.repository.list(a.id, "feedback")).find(
      (r) => r.id === input.feedbackId,
    );
    if (!feedback) fail("Feedback inexistente neste acesso.");
    if (input.skillId) await this.skill(a.id, input.skillId);
    if (
      input.consultaAprendidaId &&
      !(await this.aprendizado.obterConsulta(a.id, input.consultaAprendidaId))
    )
      fail("Exemplo de outro acesso.");
    if (
      input.casoId &&
      !(await this.repository.list(a.id, "caso")).some((c) => c.id === input.casoId)
    )
      fail("Caso de outro acesso.");
    if (
      input.resultado === "exemplo_inativo" &&
      (!input.consultaAprendidaId ||
        (await this.aprendizado.obterConsulta(a.id, input.consultaAprendidaId))?.status !==
          "inativa")
    )
      fail("Inative o exemplo antes de concluir esta revisão.");
    if (input.resultado === "caso_regressao" && !input.casoId)
      fail("Registre o caso sintético antes de concluir esta revisão.");
    if (input.resultado === "rascunho_corrigido" && !input.skillId)
      fail("Vincule a skill cujo rascunho foi corrigido.");
    const content = {
      ...feedback.conteudo,
      status: "revisado",
      resultado: input.resultado,
      skillId: input.skillId ?? null,
      consultaAprendidaId: input.consultaAprendidaId ?? null,
      casoId: input.casoId ?? null,
    };
    const pending = approved(
      { acessoId: a.id, id: feedback.id, versao: feedback.versao, conteudo: content },
      input,
    );
    if (pending) return { success: true, ...pending, preview: content };
    return {
      success: true,
      feedback: await this.repository.append({
        ...feedback,
        expectedVersion: feedback.versao,
        autorUsuarioId: requireUsuario(uid),
        conteudo: content,
      }),
    };
  }
  async diagnosticar(uid: string | undefined): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const skills = await this.skills.listByAcesso(a.id);
    return {
      success: true,
      treinamentoBase: TREINAMENTO_BASE,
      conflitos: await this.grafo.listConflitos(a.id),
      deriva: skills
        .filter((s) => s.motivoRevalidacao)
        .map((s) => ({ skillId: s.id, diagnostico: s.motivoRevalidacao })),
      skills: await Promise.all(
        skills.map(async (s) => ({
          skillId: s.id,
          publicacaoAtivaId: s.publicacaoAtivaId ?? null,
          statusRascunho: s.status,
          ...(await fluxoEFaltasForAcessoSkill(this.grafo, a.id, s)),

          testes: await gateTestes(this.repository, s),
        })),
      ),
      candidatas: (
        await this.aprendizado.paginarConsultas({
          acessoId: a.id,
          estado: "candidata",
          pagina: 1,
          limite: 1,
        })
      ).total,
      feedbacks: await this.repository.list(a.id, "feedback"),
      lacunas: await this.aprendizado.listarLacunas(a.id, 100),
    };
  }
  async relatorios(uid: string | undefined, skillId?: string): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    return { success: true, relatorios: await this.repository.list(a.id, "relatorio", skillId) };
  }
  async exportarTemplate(
    uid: string | undefined,
    input: ConfirmacaoTreino & { skillId: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid),
      s = await this.skill(a.id, input.skillId);
    const escopo = {
      tabelas: s.escopo.tabelas,
      colunasPorTabela: s.escopo.colunasPorTabela,
      relacionamentos: s.escopo.relacionamentos,
      graoPorTabela: s.escopo.graoPorTabela,
      graoResultado: s.escopo.graoResultado,
      metricasSaida: s.escopo.metricasSaida,
      pacoteVersao: s.escopo.pacoteVersao,
      graosConfirmados: s.escopo.graosConfirmados,
      constantesNegocio: (s.escopo.constantesNegocio ?? []).filter(
        (c) =>
          !(a.escopoPadrao?.bindings ?? []).some(
            (b) => b.tabela === c.tabela && b.coluna === c.coluna,
          ),
      ),
    };
    const template = {
      formato: "se7e-skill-template/v1",
      dialeto: a.dialeto,
      slug: s.slug,
      nome: s.nome,
      descricao: s.descricao,
      sqlModelo: s.sqlModelo,
      params: s.params,
      escopo,
      casosSinteticos: (await this.repository.list(a.id, "caso", s.id))
        .filter((c) => c.conteudo.status === "ativo")
        .map((c) => casoArmazenado(c.conteudo)),
    };
    if (
      !safeDocument(template) ||
      !capturaSqlSegura(s.sqlModelo, a.dialeto, [
        {
          ...s,
          conhecimentoPublicado: (await this.skills.findPublicadaById(s.id))?.conhecimentoPublicado,
        },
      ])
    )
      fail("Template contém valores ou conteúdo não exportável. Parametrize antes de exportar.");
    const pending = approved({ acessoId: a.id, skillId: s.id, versao: s.versao, template }, input);
    return pending
      ? { success: true, ...pending, preview: template }
      : { success: true, template, hash: hashTreino(template) };
  }
  async importarTemplate(
    uid: string | undefined,
    input: ConfirmacaoTreino & { template: Record<string, unknown>; slug: string },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid),
      t = z
        .strictObject({
          formato: z.literal("se7e-skill-template/v1"),
          dialeto: z.enum(["postgres", "mssql", "sybase", "firebird"]),
          slug: z.string(),
          nome: z.string().min(1).max(200),
          descricao: z.string().max(5000),
          sqlModelo: z.string().min(1).max(100000),
          params: z.array(
            z.strictObject({
              nome: z.string(),
              descricao: z.string().optional(),
              obrigatorio: z.boolean().optional(),
              tipo: z
                .enum(["string", "number", "integer", "decimal", "date", "datetime", "boolean"])
                .optional(),
            }),
          ),
          casosSinteticos: z.array(casoSchema).optional(),
          escopo: z.record(z.string(), z.unknown()),
        })
        .parse(input.template);
    if (
      Object.keys(t.escopo).some(
        (k) =>
          ![
            "tabelas",
            "colunasPorTabela",
            "relacionamentos",
            "graoPorTabela",
            "graoResultado",
            "metricasSaida",
            "pacoteVersao",
            "graosConfirmados",
            "constantesNegocio",
          ].includes(k),
      )
    )
      fail("Template contém campos não exportáveis.");
    if (
      t.formato !== "se7e-skill-template/v1" ||
      t.dialeto !== a.dialeto ||
      !safeDocument(t) ||
      (await this.skills.findBySlug(a.id, input.slug))
    )
      fail("Template inválido, dialeto incompatível ou slug existente.");
    const pending = approved({ acessoId: a.id, template: t, slug: input.slug }, input);
    if (pending) return { success: true, ...pending, preview: t };
    const s = await this.skills.create({
      acessoId: a.id,
      slug: input.slug,
      nome: String(t.nome),
      descricao: String(t.descricao),
      sqlModelo: String(t.sqlModelo),
      params: parseParametroSkillList(t.params),
      escopo: {
        ...parseEscopoSkill(t.escopo),
        constantesNegocio: [],
        graosConfirmados: Object.fromEntries(
          Object.entries(parseEscopoSkill(t.escopo).graosConfirmados ?? {}).map(([table, g]) => [
            table,
            { ...g, evidencia: "declaracao_usuario" },
          ]),
        ),
      },
      autorUsuarioId: requireUsuario(uid),
    });
    for (const caso of t.casosSinteticos ?? [])
      await this.repository.append({
        id: randomUUID(),
        acessoId: a.id,
        skillId: s.id,
        tipo: "caso",
        expectedVersion: 0,
        autorUsuarioId: requireUsuario(uid),
        conteudo: { ...caso, skillVersao: s.versao, skillHash: skillTesteHash(s) },
      });
    return {
      success: true,
      skill: s,
      constantesPropostas: t.escopo.constantesNegocio ?? [],
      proximoPasso:
        "Verificar estrutura, parâmetros, dialeto, sensibilidade e relacionamentos no destino; validar e publicar.",
    };
  }
  async exportarDataset(
    uid: string | undefined,
    input: ConfirmacaoTreino & {
      skillId?: string;
      formato?: "json" | "jsonl";
      particao?: "treino" | "desenvolvimento" | "teste";
    },
  ): Promise<Record<string, unknown>> {
    const a = await this.access(uid);
    const cases = (await this.repository.list(a.id, "caso", input.skillId)).filter(
      (c) => c.conteudo.status === "ativo" && c.conteudo.sintetico === true,
    );
    const families = (c: (typeof cases)[number]) =>
      hashTreino(
        (c.conteudo.fixtures as { tabela: string; colunas: unknown }[]).map((f) => ({
          tabela: f.tabela,
          colunas: f.colunas,
        })),
      );
    const split = (c: (typeof cases)[number]) => {
      const bucket = parseInt(families(c).slice(0, 8), 16) % 100;
      return bucket < 70 ? "treino" : bucket < 85 ? "desenvolvimento" : "teste";
    };
    const selected = cases.filter((c) => split(c) === (input.particao ?? "teste"));
    const examples = selected.map((c) => ({
      origem: { casoId: c.id, versao: c.versao, hash: hashTreino(c.conteudo) },
      ...c.conteudo,
    }));
    if (!safeDocument(examples)) fail("Dataset inseguro.");
    const manifest = {
      formato: "se7e-dataset/v1",
      aprovacao: "humana_por_chat",
      verificacao:
        "Relatórios do runner são consultados separadamente; exportação não certifica resultado ou modelo.",
      particao: input.particao ?? "teste",
      treinamentoBase: TREINAMENTO_BASE,
      hash: hashTreino(examples),
      familias: selected.map(families),
    };
    const pending = approved({ acessoId: a.id, manifest, examples }, input);
    return pending
      ? { success: true, ...pending, manifest, quantidade: examples.length }
      : {
          success: true,
          manifest,
          conteudo:
            input.formato === "jsonl"
              ? examples.map((e) => JSON.stringify(e)).join("\n")
              : examples,
        };
  }
}
