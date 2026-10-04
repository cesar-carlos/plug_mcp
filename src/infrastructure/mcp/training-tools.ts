import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Treinamento } from "../../application/use-cases/treinamento.js";
import { casoSchema } from "../../application/use-cases/shared/casos-treino.js";
import { currentAccountId } from "./account-context.js";
import type { createToolRunner } from "./tool-result.js";
const confirmation = {
  confirmadoPeloUsuario: z.boolean().optional(),
  confirmacaoHash: z.string().optional(),
};
export const registerTrainingTools = (
  server: McpServer,
  service: Treinamento,
  run: ReturnType<typeof createToolRunner>,
): void => {
  const register = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    read = false,
  ) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema: z.strictObject(shape),
        annotations: {
          readOnlyHint: read,
          destructiveHint: false,
          idempotentHint: read,
          openWorldHint: false,
        },
      },
      (args) => run(name, () => fn(args)),
    );
  register(
    "listar_consultas_aprendidas",
    "Lista resumos sem SQL; filtra skill/estado e paginação.",
    {
      skillId: z.string().optional(),
      estado: z.enum(["candidata", "confirmada", "inativa"]).optional(),
      pagina: z.number().int().min(1).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
    (a) => service.listarConsultas(currentAccountId(), a),
    true,
  );
  register(
    "obter_consulta_aprendida",
    "Lê SQL parametrizado, contrato, origem e reutilização vigente.",
    { consultaAprendidaId: z.string() },
    (a) => service.obterConsulta(currentAccountId(), a.consultaAprendidaId),
    true,
  );
  register(
    "inativar_consulta_aprendida",
    "Preview e confirmação explícita para retirar exemplo; execução não o reativa.",
    { consultaAprendidaId: z.string(), motivo: z.string().min(1).max(2000), ...confirmation },
    (a) => service.inativarConsulta(currentAccountId(), a),
  );
  register(
    "confirmar_grao",
    "Confirma grão de origem e chaves físicas; GROUP BY/amostra não prova unicidade.",
    {
      skillId: z.string(),
      tabela: z.string(),
      significado: z.string().min(1).max(2000),
      chaves: z.array(z.string()).min(1),
      evidencia: z.enum(["declaracao_usuario", "constraint_banco"]),
      ...confirmation,
    },
    (a) => service.confirmarGrao(currentAccountId(), a),
  );
  register(
    "confirmar_constante_negocio",
    "Confirma constante não sensível no rascunho; exige republicação.",
    {
      skillId: z.string(),
      tabela: z.string(),
      coluna: z.string(),
      valor: z.union([z.string().max(200), z.number(), z.boolean()]),
      ...confirmation,
    },
    (a) => service.confirmarConstante(currentAccountId(), a),
  );
  const caseInput = {
    skillId: z.string(),
    casoId: z.string().uuid().optional(),
    versao: z.number().int().min(0).optional(),
    caso: casoSchema,
    ...confirmation,
  };
  register(
    "registrar_caso_teste",
    "Preview e confirmação humana de fixture sintética e resultado de referência.",
    caseInput,
    (a) => service.salvarCaso(currentAccountId(), a),
  );
  register(
    "atualizar_caso_teste",
    "Nova revisão imutável do caso; relatório anterior fica obsoleto.",
    { ...caseInput, casoId: z.string().uuid(), versao: z.number().int().min(1) },
    (a) => service.salvarCaso(currentAccountId(), a),
  );
  register(
    "listar_casos_teste",
    "Lista casos versionados deste acesso.",
    { skillId: z.string().optional() },
    (a) => service.casos(currentAccountId(), a),
    true,
  );
  register(
    "obter_caso_teste",
    "Lê caso sintético deste acesso.",
    { casoId: z.string().uuid(), skillId: z.string().optional() },
    (a) => service.casos(currentAccountId(), a),
    true,
  );
  register(
    "arquivar_caso_teste",
    "Arquiva via nova revisão confirmada.",
    { casoId: z.string().uuid(), skillId: z.string(), ...confirmation },
    (a) => service.arquivarCaso(currentAccountId(), a),
  );
  register(
    "registrar_feedback_consulta",
    "Abre pendência ligada à execução, sem alterar conhecimento ou publicação.",
    {
      execucaoId: z.string().uuid(),
      categoria: z.enum(["resultado", "semantica", "tool", "cobertura", "seguranca"]),
      correcao: z.string().max(2000).optional(),
    },
    (a) => service.feedback(currentAccountId(), a),
  );
  register(
    "revisar_feedback_consulta",
    "Confirma revisão e vincula correções feitas pelas tools próprias; não altera publicação.",
    {
      feedbackId: z.string().uuid(),
      resultado: z.enum([
        "rascunho_corrigido",
        "exemplo_inativo",
        "caso_regressao",
        "sem_alteracao",
      ]),
      skillId: z.string().optional(),
      consultaAprendidaId: z.string().optional(),
      casoId: z.string().optional(),
      ...confirmation,
    },
    (a) => service.revisarFeedback(currentAccountId(), a),
  );
  register(
    "diagnosticar_treinamento",
    "Consolida base, faltas, candidatas, feedback, lacunas e testes.",
    {},
    () => service.diagnosticar(currentAccountId()),
    true,
  );
  register(
    "listar_relatorios_avaliacao",
    "Lê relatórios do runner confiável; não aceita aprovação enviada por IA.",
    { skillId: z.string().optional() },
    (a) => service.relatorios(currentAccountId(), a.skillId),
    true,
  );
  register(
    "exportar_template_skill",
    "Preview e confirmação de template sanitizado, sem autorização herdada.",
    { skillId: z.string(), ...confirmation },
    (a) => service.exportarTemplate(currentAccountId(), a),
  );
  register(
    "importar_template_skill",
    "Importa template como nova identidade em rascunho neste acesso.",
    {
      slug: z.string().regex(/^[a-z0-9-]+$/),
      template: z.record(z.string(), z.unknown()),
      ...confirmation,
    },
    (a) => service.importarTemplate(currentAccountId(), a),
  );
  register(
    "exportar_dataset_treinamento",
    "Exporta somente casos sintéticos aprovados; manifesto e hash, JSON/JSONL.",
    {
      skillId: z.string().optional(),
      formato: z.enum(["json", "jsonl"]).optional(),
      particao: z.enum(["treino", "desenvolvimento", "teste"]).optional(),
      ...confirmation,
    },
    (a) => service.exportarDataset(currentAccountId(), a),
  );
};
