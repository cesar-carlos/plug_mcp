import type { McpServer } from "@modelcontextprotocol/server";

/** Technical metadata only. The application still applies every authorization gate. */
export const personaOAuthTools = (server: McpServer): McpServer => {
  const schemes = [{ type: "oauth2", scopes: ["se7e:persona"] }];
  const protocol = server.server;
  const register = protocol.setRequestHandler.bind(protocol);
  protocol.setRequestHandler = (method: string, ...args: unknown[]): void => {
    if (method === "tools/list") {
      const handler = args.at(-1);
      if (typeof handler !== "function") {
        throw new TypeError("tools/list handler ausente");
      }
      args[args.length - 1] = async (...inputs: unknown[]) => {
        const result = (await Reflect.apply(handler, protocol, inputs)) as {
          tools: Record<string, unknown>[];
        };
        return {
          ...result,
          tools: result.tools.map((tool) => ({
            ...tool,
            securitySchemes: schemes,
            _meta: {
              ...(tool._meta as Record<string, unknown> | undefined),
              securitySchemes: schemes,
            },
          })),
        };
      };
    }
    Reflect.apply(register, protocol, [method, ...args]);
  };
  return new Proxy(server, {
    get(target, key) {
      if (key === "registerTool") {
        return (name: string, options: Record<string, unknown>, ...rest: unknown[]): unknown =>
          Reflect.apply(target.registerTool.bind(target), target, [
            name,
            {
              ...options,
              _meta: {
                ...(options._meta as Record<string, unknown> | undefined),
                securitySchemes: schemes,
              },
            },
            ...rest,
          ]);
      }
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? (value.bind(target) as unknown) : value;
    },
  });
};
