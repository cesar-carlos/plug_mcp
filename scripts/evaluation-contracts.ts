import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerTools, type ToolUseCases } from "../src/infrastructure/mcp/register-tools.js";
import { testConfig } from "../src/config/env.js";
import type { LoggerPort } from "../src/domain/ports/logger.port.js";
// Collect the actual public registrations; handlers remain the real application use cases.
export const evaluationContracts = () => {
  const schemas = new Map<string, { name: string; description: string; inputSchema: z.ZodType }>();
  const recorder = {
    registerTool: (name: string, options: { description?: string; inputSchema: z.ZodType }) => {
      schemas.set(name, {
        name,
        description: options.description ?? "",
        inputSchema: options.inputSchema,
      });
      return { remove: () => undefined };
    },
    registerPrompt: () => undefined,
    registerResource: () => undefined,
  };
  registerTools(
    recorder as unknown as McpServer,
    testConfig(),
    {} as ToolUseCases,
    {} as LoggerPort,
  );
  return new Map(
    [...schemas].filter(([name]) =>
      [
        "obter_treinamento_base",
        "buscar_contexto",
        "obter_skill",
        "validar_consulta",
        "consultar_dados",
      ].includes(name),
    ),
  );
};
