import { z } from "zod";

// Registration does not contact the destination. Executors must additionally
// resolve and pin public IPs at dispatch; this syntax check is not an SSRF gate.
export const integrationRegistrationSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["rest", "mcp_http"]),
  destination: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const u = new URL(value);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (!u.port || u.port === "443") &&
          /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname) &&
          !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(u.hostname)
        );
      } catch {
        return false;
      }
    }),
});
const secret = z
  .string()
  .min(1)
  .max(8192)
  .refine((s) => !/[\r\n]/.test(s) && !s.includes(String.fromCharCode(0)));
export const integrationCredentialSchema = z.discriminatedUnion("credentialType", [
  z.strictObject({ credentialType: z.literal("bearer"), token: secret }),
  z.strictObject({
    credentialType: z.literal("api_key"),
    header: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9-]{0,99}$/)
      .refine(
        (s) =>
          !/^(?:authorization|proxy-authorization|host|cookie|set-cookie|connection|content-length|content-type|content-encoding|accept|accept-encoding|mcp-session-id|mcp-protocol-version|transfer-encoding|upgrade|trailer|te|origin|referer|forwarded|x-forwarded-.*|sec-.*)$/i.test(
            s,
          ),
      ),
    apiKey: secret,
  }),
  z.strictObject({
    credentialType: z.literal("basic"),
    username: secret.refine((s) => !s.includes(":")),
    password: secret,
  }),
]);
export type IntegrationRegistration = z.infer<typeof integrationRegistrationSchema>;
export type IntegrationCredential = z.infer<typeof integrationCredentialSchema>;
export const integrationReferenceSchema = integrationRegistrationSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export type IntegrationReference = z.infer<typeof integrationReferenceSchema>;

export const parseIntegrationSetup = (
  raw: unknown,
  create: boolean,
): { registration: IntegrationRegistration | undefined; credential: IntegrationCredential } => {
  const schema = z.union(
    integrationCredentialSchema.options.map((variant) =>
      variant.extend({
        ...(create ? integrationRegistrationSchema.shape : {}),
        confirmed: z.literal("save"),
      }),
    ),
  );
  const value = schema.parse(raw);
  const {
    confirmed: _confirmed,
    name,
    kind,
    destination,
    ...credential
  } = value as Record<string, unknown>;
  return {
    registration: create
      ? integrationRegistrationSchema.parse({ name, kind, destination })
      : undefined,
    credential: integrationCredentialSchema.parse(credential),
  };
};
