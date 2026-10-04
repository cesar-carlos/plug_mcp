import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AnexoConverterPort } from "../../domain/ports/anexo-converter.port.js";
import type { AnexoHandlePort } from "../../domain/ports/anexo-handle.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import {
  ANEXO_EXPORT_KIND,
  isMimeDestinoAnexo,
  type AnexoExportPayload,
} from "../../domain/entities/anexo.js";
import { requireAcesso, refreshAndRequireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";

const origemInvalida = (hint: string): DomainError =>
  DomainError.anexo({
    code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
    message: "Handle de anexo inválido ou expirado.",
    hint,
  });

export class ExportarAnexo {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly anexos: AnexoHandlePort,
    private readonly converter: AnexoConverterPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
    private readonly logger: LoggerPort,
    private readonly grafo?: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      handle?: string;
      mimeDestino?: string;
    },
  ): Promise<AnexoExportPayload> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const handle = input.handle?.trim() ?? "";
    if (!handle) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "handle é obrigatório.",
        hint: "Use o handle do stub kind=anexo devolvido por consultar_dados. Handle de inspecionar_consulta não é exportável. Não invente bytes.",
      });
    }
    const rawMime = input.mimeDestino ?? "image/jpeg";
    if (!isMimeDestinoAnexo(rawMime)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "mimeDestino inválido.",
        hint: "Use image/jpeg, image/png ou application/pdf.",
      });
    }
    const mimeDestino = rawMime;
    const peeked = this.anexos.get(handle, uid);
    if (!peeked) {
      throw origemInvalida(
        "Handle expirado, de outra sessão ou de outro usuário. Chame consultar_dados de novo e use o handle novo. Não invente bytes. Handle de inspeção não é exportável.",
      );
    }
    const boundAcessoId = input.acessoId?.trim() ? input.acessoId : peeked.acessoId;
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, boundAcessoId, uid),
      uid,
    );
    const publicadas = await this.skills.listPublicadas(acesso.id);
    if (publicadas.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "Não há skill publicada neste acesso.",
        hint: "Publique a skill antes. exportar_anexo usa os mesmos portões de consultar_dados.",
      });
    }
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken,
      }),
    );
    const record = peeked;
    if (record.sensibilidade === "pessoal" || record.sensibilidade === "segredo") {
      throw new DomainError({
        code: ERROR_CODES.PRIVACIDADE_NEGADA,
        message: "Anexo pessoal ou segredo não é exportável.",
        hint: "Consulte apenas anexos classificados como livres.",
        nextAction: "consultar_dados",
      });
    }
    const source = record.proveniencia;
    const assertCurrent = async (): Promise<void> => {
      const current = await refreshAndRequireAcessoAprovado(
        this.acessos,
        this.plug,
        this.sessions,
        await requireAcesso(this.acessos, acesso.id, uid),
        uid,
      );
      if (
        !source?.publicacoes.length ||
        source.bearerHash !== current.tokenHash ||
        source.clientTokenHash !== current.clientTokenHash
      ) {
        throw origemInvalida(
          "Autorização de origem inválida. Consulte novamente no pacote vigente.",
        );
      }
      for (const origin of source.publicacoes) {
        const active = await this.skills.findPublicadaById(origin.skillId);
        if (
          active?.acessoId !== acesso.id ||
          active.publicacaoAtivaId !== origin.id ||
          active.publicacaoHash !== origin.hash ||
          !Object.entries(active.escopo.colunasPorTabela).some(
            ([table, cols]) =>
              table.toLowerCase() === source.tabela.toLowerCase() &&
              cols.some((col) => col.toLowerCase() === source.coluna.toLowerCase()),
          )
        ) {
          throw origemInvalida("Publicação de origem revogada ou substituída. Consulte novamente.");
        }
      }
      const fresh = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.getClientTokenPolicy({
          accessToken,
          agentId: current.agentId,
          clientToken: this.crypto.decrypt(current.clientTokenEnc),
        }),
      );
      if (
        !fresh.allTables &&
        !fresh.tables.some((table) => table.toLowerCase() === source.tabela.toLowerCase())
      ) {
        throw origemInvalida("A policy vigente não autoriza a tabela de origem.");
      }
      if (!this.grafo) {
        throw origemInvalida("Classificação vigente indisponível.");
      }
      const table = await this.grafo.findTabelaByNome(acesso.id, source.tabela);
      const column = table ? await this.grafo.findColuna(acesso.id, table.id, source.coluna) : null;
      if (column?.origem !== "confirmado_usuario" || column.sensibilidade !== "livre") {
        throw origemInvalida("A classificação vigente não permite exportação desta coluna.");
      }
    };
    if (
      source &&
      !policy.allTables &&
      !policy.tables.some((table) => table.toLowerCase() === source.tabela.toLowerCase())
    ) {
      throw origemInvalida("Tabela de origem fora da policy.");
    }
    await assertCurrent();
    if (record.acessoId !== acesso.id) {
      throw origemInvalida("O handle não pertence a este acessoId. Confira listar_acessos.");
    }
    if (record.origem === "inspecionar_consulta") {
      throw origemInvalida(
        "Handle de inspecionar_consulta não é exportável. Foto livre: consultar_dados + exportar_anexo. Não use inspeção como segunda via.",
      );
    }
    try {
      const converted = await this.converter.converter({
        bytes: record.bytes,
        mimeDestino,
      });
      await assertCurrent();
      this.logger.info("anexo exported", {
        tool: "exportar_anexo",
        mime: converted.mime,
        bytes: converted.data.byteLength,
        resized: converted.resized,
      });
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "exportar_anexo",
        sqlEnviado: `coluna:${record.coluna};mime:${converted.mime}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: 1,
        duracaoMs: Date.now() - started,
      });
      await assertCurrent();
      return {
        kind: ANEXO_EXPORT_KIND,
        mime: converted.mime,
        bytes: converted.data.byteLength,
        resized: converted.resized,
        aviso: converted.aviso,
        data: converted.data,
      };
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "exportar_anexo",
        sqlEnviado: `coluna:${record.coluna}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.INTERNAL_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      throw error;
    }
  }
}
