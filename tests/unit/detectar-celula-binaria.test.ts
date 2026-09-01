import { describe, expect, it } from "vitest";
import {
  analisarCelulaBinaria,
  extractBinaryBytes,
  isTipoBinarioHint,
  temMagicMidia,
} from "../../src/application/use-cases/shared/detectar-celula-binaria.js";
import { sanitizarLinhasConsulta } from "../../src/application/use-cases/shared/sanitizar-linhas-consulta.js";
import { MemoryAnexoHandleStore } from "../../src/infrastructure/anexo/memory-anexo-handle.js";
import {
  ANEXO_DECODE_MAX_BYTES,
  ANEXO_KIND,
  ANEXO_MAX_CELLS_PER_RESULT,
  QUERY_CELL_MAX_CHARS,
} from "../../src/domain/entities/anexo.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { REDACTED } from "../../src/application/use-cases/shared/mascarar-linhagem.js";

const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const jpegPadded = Buffer.concat([jpegMagic, Buffer.alloc(80, 1)]);
const jpegShort = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const zipBytes = (): Buffer =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 0)]);

const oleBytes = (): Buffer =>
  Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(40, 1),
  ]);

const store = (): MemoryAnexoHandleStore =>
  new MemoryAnexoHandleStore("secret-anexo-hmac-key-32bytes-min");

describe("detectar célula binária", () => {
  it("reconhece base64 de JPEG (fio do plug_agente)", () => {
    const b64 = jpegPadded.toString("base64");
    const extracted = extractBinaryBytes(b64);
    expect(extracted?.encoding).toBe("base64");
    expect(extracted?.mimeHint).toBe("image/jpeg");
    expect(Buffer.compare(extracted!.bytes, jpegPadded)).toBe(0);
  });

  it("base64 curto + tipo image vira extração (sem piso de 96 chars)", () => {
    const jpegB64 = jpegShort.toString("base64");
    expect(jpegB64.length).toBeLessThan(96);
    expect(extractBinaryBytes(jpegB64)).not.toBeNull();
    const opaque = Buffer.alloc(12, 7).toString("base64");
    expect(opaque.length).toBeLessThan(96);
    expect(extractBinaryBytes(opaque)).toBeNull();
    expect(extractBinaryBytes(opaque, "image")).not.toBeNull();
  });

  it("reconhece Buffer e Uint8Array reais (não só JSON type:Buffer)", () => {
    const fromBuf = extractBinaryBytes(jpegPadded);
    expect(fromBuf?.encoding).toBe("buffer");
    expect(fromBuf?.bytes.length).toBe(jpegPadded.length);
    const fromUa = extractBinaryBytes(new Uint8Array(jpegPadded));
    expect(fromUa?.encoding).toBe("buffer");
    expect(fromUa?.bytes.length).toBe(jpegPadded.length);
  });

  it("reconhece { type: Buffer, data } defensivo", () => {
    const extracted = extractBinaryBytes({ type: "Buffer", data: [...jpegPadded] });
    expect(extracted?.encoding).toBe("buffer_json");
    expect(extracted?.bytes.length).toBe(jpegPadded.length);
  });

  it("reconhece array de números grande", () => {
    const extracted = extractBinaryBytes([...jpegPadded]);
    expect(extracted?.encoding).toBe("byte_array");
  });

  it("não trata texto curto como anexo", () => {
    expect(extractBinaryBytes("foto.jpg")).toBeNull();
    expect(extractBinaryBytes("ok")).toBeNull();
    expect(extractBinaryBytes("12345")).toBeNull();
  });

  it("não trata [redacted] como anexo", () => {
    expect(extractBinaryBytes(REDACTED)).toBeNull();
  });

  it("não trata string já truncada (ellipsis) como anexo", () => {
    const b64 = `${jpegPadded.toString("base64").slice(0, 80)}…`;
    expect(extractBinaryBytes(b64)).toBeNull();
  });

  it("texto longo sem magic e sem tipo binário não vira anexo", () => {
    const texto = "Cliente especial ".repeat(20);
    expect(extractBinaryBytes(texto)).toBeNull();
    expect(extractBinaryBytes(texto, "varchar")).toBeNull();
  });

  it("tipo grafo binario/image/blob/bytea autoriza base64 sem exigir magic", () => {
    expect(isTipoBinarioHint("image")).toBe(true);
    expect(isTipoBinarioHint("varbinary(max)")).toBe(true);
    expect(isTipoBinarioHint("bytea")).toBe(true);
    expect(isTipoBinarioHint("varchar")).toBe(false);
    const opaque = Buffer.alloc(80, 7).toString("base64");
    expect(extractBinaryBytes(opaque)).toBeNull();
    expect(extractBinaryBytes(opaque, "image")).not.toBeNull();
  });

  it("hex de JPEG com magic", () => {
    const hex = jpegPadded.toString("hex");
    const extracted = extractBinaryBytes(hex);
    expect(extracted?.encoding).toBe("hex");
    expect(temMagicMidia(extracted!.bytes)).toBe(true);
  });

  it("string encoded acima do teto não chama decode (teto)", () => {
    const huge = "A".repeat(ANEXO_DECODE_MAX_BYTES * 2 + 32);
    expect(analisarCelulaBinaria(huge, "image")?.outcome).toBe("teto");
  });
});

describe("sanitizar linhas de consulta", () => {
  it("base64 curto + tipo image vira stub", () => {
    const b64 = jpegShort.toString("base64");
    const { rows, anexos } = sanitizarLinhasConsulta({
      rows: [{ foto: b64 }],
      columnTypes: new Map([["foto", "image"]]),
      anexos: store(),
      usuarioId: "u1",
      acessoId: "a1",
      origem: "consultar_dados",
    });
    expect(anexos).toBe(1);
    expect(rows[0]?.foto).toMatchObject({ kind: ANEXO_KIND, truncated: true });
    expect((rows[0]?.foto as { handle?: string }).handle).toMatch(/^[0-9a-f-]{36}\./i);
    expect(JSON.stringify(rows)).not.toContain(b64);
  });

  it("Buffer real não cai em JSON.stringify nas rows", () => {
    const { rows } = sanitizarLinhasConsulta({
      rows: [{ foto: jpegPadded }],
      columnTypes: new Map([["foto", "image"]]),
      anexos: store(),
      usuarioId: "u1",
      acessoId: "a1",
      origem: "consultar_dados",
    });
    expect(JSON.stringify(rows)).not.toMatch(/"type":"Buffer"/);
    expect(rows[0]?.foto).toMatchObject({ kind: ANEXO_KIND, truncated: true });
  });

  it("zip/ole sem tipo não vazam 2048 chars nas rows", () => {
    const longZip = Buffer.concat([zipBytes(), Buffer.alloc(2000, 1)]);
    const zipB64 = longZip.toString("base64");
    expect(zipB64.length).toBeGreaterThan(QUERY_CELL_MAX_CHARS);
    const longOle = Buffer.concat([oleBytes(), Buffer.alloc(2000, 2)]);
    const oleB64 = longOle.toString("base64");
    const { rows } = sanitizarLinhasConsulta({
      rows: [{ blob: zipB64, ole: oleB64 }],
      anexos: store(),
      usuarioId: "u1",
      acessoId: "a1",
      origem: "consultar_dados",
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(zipB64.slice(0, 32));
    expect(serialized).not.toContain(oleB64.slice(0, 32));
    expect(typeof rows[0]?.blob).not.toBe("string");
    expect(typeof rows[0]?.ole).not.toBe("string");
    expect(rows[0]?.blob).toMatchObject({ kind: ANEXO_KIND, truncated: true });
    expect((rows[0]?.blob as { handle?: string }).handle).toBeUndefined();
  });

  it("pessoal/segredo não emite handle útil nem bytes", () => {
    const anexos = store();
    const { rows } = sanitizarLinhasConsulta({
      rows: [{ foto_cpf: jpegPadded }],
      columnTypes: new Map([["foto_cpf", "image"]]),
      anexos,
      usuarioId: "u1",
      acessoId: "a1",
      origem: "consultar_dados",
      lookupSensibilidade: () => "pessoal",
    });
    const cell = rows[0]?.foto_cpf as { kind?: string; handle?: string };
    expect(cell.kind).toBe(ANEXO_KIND);
    expect(cell.handle).toBeUndefined();
    expect(anexos.get("qualquer", "u1")).toBeNull();
  });

  it("CONSULTA_ORCAMENTO de anexo usa source mcp e stage anexo", () => {
    const huge = Buffer.concat([jpegMagic, Buffer.alloc(ANEXO_DECODE_MAX_BYTES)]);
    try {
      sanitizarLinhasConsulta({
        rows: [{ foto: huge }],
        columnTypes: new Map([["foto", "image"]]),
        anexos: store(),
        usuarioId: "u1",
        acessoId: "a1",
        origem: "consultar_dados",
      });
      expect.fail("esperava CONSULTA_ORCAMENTO");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const err = error as DomainError;
      expect(err.code).toBe(ERROR_CODES.CONSULTA_ORCAMENTO);
      expect(err.source).toBe("mcp");
      expect(err.source).not.toBe("sql");
      expect(err.stage).toBe("anexo");
      expect(err.category).toBe("budget");
      expect(err.toJson().error.nextAction).toBe("omitir_coluna_ou_reduzir");
      expect(err.toJson().error.nextAction).not.toBe("agregar_ou_reduzir");
    }
  });

  it("teto de 8 células binárias é CONSULTA_ORCAMENTO source mcp", () => {
    const rows = Array.from({ length: ANEXO_MAX_CELLS_PER_RESULT + 1 }, () => ({
      foto: jpegPadded,
    }));
    try {
      sanitizarLinhasConsulta({
        rows,
        columnTypes: new Map([["foto", "image"]]),
        anexos: store(),
        usuarioId: "u1",
        acessoId: "a1",
        origem: "consultar_dados",
      });
      expect.fail("esperava CONSULTA_ORCAMENTO");
    } catch (error) {
      const err = error as DomainError;
      expect(err.code).toBe(ERROR_CODES.CONSULTA_ORCAMENTO);
      expect(err.source).toBe("mcp");
      expect(err.stage).toBe("anexo");
    }
  });

  it("teto de 8 MiB no resultado é CONSULTA_ORCAMENTO source mcp", () => {
    const chunk = Buffer.concat([jpegMagic, Buffer.alloc(3 * 1024 * 1024, 1)]);
    try {
      sanitizarLinhasConsulta({
        rows: [{ a: chunk, b: chunk, c: chunk }],
        columnTypes: new Map([
          ["a", "image"],
          ["b", "image"],
          ["c", "image"],
        ]),
        anexos: store(),
        usuarioId: "u1",
        acessoId: "a1",
        origem: "consultar_dados",
      });
      expect.fail("esperava CONSULTA_ORCAMENTO");
    } catch (error) {
      const err = error as DomainError;
      expect(err.code).toBe(ERROR_CODES.CONSULTA_ORCAMENTO);
      expect(err.source).toBe("mcp");
      expect(err.stage).toBe("anexo");
    }
  });

  it("inspeção omite handle e não faz put", () => {
    const anexos = store();
    const { rows } = sanitizarLinhasConsulta({
      rows: [{ foto: jpegPadded }],
      columnTypes: new Map([["foto", "image"]]),
      anexos,
      usuarioId: "u1",
      acessoId: "a1",
      origem: "inspecionar_consulta",
    });
    const cell = rows[0]?.foto as { kind?: string; handle?: string; truncated?: boolean };
    expect(cell).toEqual({ kind: ANEXO_KIND, truncated: true });
    expect(cell.handle).toBeUndefined();
    expect(anexos.get("qualquer", "u1")).toBeNull();
  });
});
