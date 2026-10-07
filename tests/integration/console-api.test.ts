import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { registerAccessViaBrowser } from "../helpers/secure-setup.js";

const agentA = "11111111-1111-4111-8111-111111111111";
const agentB = "22222222-2222-4222-8222-222222222222";
const origin = "http://127.0.0.1:3333";

const register = async (
  app: Awaited<ReturnType<typeof compose>>["app"],
  useCases: Awaited<ReturnType<typeof compose>>["useCases"],
  plug: FakePlugServer,
  agentId: string,
  email: string,
) => {
  plug.approve(agentId);
  return registerAccessViaBrowser(app, useCases, {
    email,
    senha: "secret-pass",
    agentId,
    dialeto: "sybase",
    clientToken: `tok-sql-${agentId}`,
  });
};

describe("console HTTP", () => {
  it("begin GET e POST JSON cadastram sem ecoar segredo e amarram um Bearer", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentA);
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const begin = await request(app).post("/app/api/setup/registrar").send({});
      expect(begin.status).toBe(200);
      expect(begin.body.setupUrl).toMatch(/\/setup\//);
      expect(JSON.stringify(begin.body)).not.toMatch(/secret-pass|tok-sql/);

      const code = new URL(begin.body.setupUrl as string).pathname.split("/").at(-1)!;
      const form1 = await request(app).get(`/app/api/setup/${code}`);
      const form2 = await request(app).get(`/app/api/setup/${code}`);
      expect(form1.status).toBe(200);
      expect(form2.status).toBe(200);
      expect(form1.body.purpose).toBe("registrar");
      expect(form1.body.csrf).toBeTruthy();
      expect(form1.body.campos).toEqual(
        expect.arrayContaining(["email", "senha", "agentId", "dialeto", "clientToken", "csrf"]),
      );

      const failed = await request(app)
        .post(`/setup/${code}`)
        .set("Origin", origin)
        .set("Accept", "application/json")
        .send({
          csrf: form2.body.csrf,
          confirmado: "sim",
          email: "client@example.com",
          senha: "short",
          agentId: agentA,
          dialeto: "sybase",
          clientToken: "tok-sql-123456",
        });
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(failed.body.code).toBeTruthy();
      expect(failed.body.message).toBeTruthy();
      expect(failed.body.hint).toBeTruthy();
      expect(JSON.stringify(failed.body)).not.toContain("short");

      const begin2 = await request(app).post("/app/api/setup/registrar").send({});
      const code2 = new URL(begin2.body.setupUrl as string).pathname.split("/").at(-1)!;
      const form = await request(app).get(`/app/api/setup/${code2}`);
      const completed = await request(app)
        .post(`/setup/${code2}`)
        .set("Origin", origin)
        .set("Accept", "application/json")
        .send({
          csrf: form.body.csrf,
          confirmado: "sim",
          email: "client@example.com",
          senha: "secret-pass",
          agentId: agentA,
          dialeto: "sybase",
          clientToken: "tok-sql-12345678",
          nomeAmigavel: "Loja teste",
        });
      expect(completed.status).toBe(200);
      expect(completed.body.token).toBeTruthy();
      expect(completed.body.acessoId).toBeTruthy();
      expect(JSON.stringify(completed.body)).not.toContain("secret-pass");
      expect(JSON.stringify(completed.body)).not.toContain("tok-sql-12345678");

      const denied = await request(app).get("/app/api/acesso");
      expect(denied.status).toBe(401);
      expect(denied.body.code).toBe("UNAUTHENTICATED");

      const listed = await request(app)
        .get("/app/api/acesso")
        .set("Authorization", `Bearer ${completed.body.token}`);
      expect(listed.status).toBe(200);
      expect(listed.body.acessos).toHaveLength(1);
      expect(listed.body.acessos[0].id).toBe(completed.body.acessoId);
      expect(listed.body.acessos[0].agentId).toBe(agentA);
      expect(JSON.stringify(listed.body)).not.toContain("tok-sql-12345678");

      const sibling = await register(app, useCases, plug, agentB, "other@example.com");
      const idor = await request(app)
        .post("/app/api/acesso/verificar")
        .set("Authorization", `Bearer ${completed.body.token}`)
        .send({ acessoId: sibling.acessoId });
      expect(idor.status).toBe(400);
      expect(idor.body.code).toBe("VALIDATION_ERROR");
    } finally {
      await close();
    }
  });

  it("adicionar persona preserva o Bearer atual, rotação o invalida e skill não vaza segredo", async () => {
    const plug = new FakePlugServer();
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const first = await register(app, useCases, plug, agentA, "persona-a@example.com");
      plug.approve(agentB);
      const added = await request(app)
        .post("/app/api/setup/adicionar")
        .set("Authorization", `Bearer ${first.token}`)
        .send({});
      expect(added.status).toBe(200);
      const code = new URL(added.body.setupUrl as string).pathname.split("/").at(-1)!;
      const form = await request(app).get(`/app/api/setup/${code}`);
      const created = await request(app)
        .post(`/setup/${code}`)
        .set("Origin", origin)
        .set("Accept", "application/json")
        .send({
          csrf: form.body.csrf,
          confirmado: "sim",
          email: "persona-a@example.com",
          senha: "secret-pass",
          agentId: agentB,
          dialeto: "postgres",
          clientToken: "tok-sql-persona-b-1234",
        });
      expect(created.status).toBe(200);
      expect(created.body.token).toBeTruthy();
      expect(created.body.token).not.toBe(first.token);
      expect(JSON.stringify(created.body)).not.toContain("secret-pass");
      expect(JSON.stringify(created.body)).not.toContain("tok-sql-persona-b-1234");

      const stillFirst = await request(app)
        .get("/app/api/acesso")
        .set("Authorization", `Bearer ${first.token}`);
      expect(stillFirst.status).toBe(200);
      expect(stillFirst.body.acessos[0].id).toBe(first.acessoId);
      expect(stillFirst.body.acessos[0].agentId).toBe(agentA);

      const second = await request(app)
        .get("/app/api/acesso")
        .set("Authorization", `Bearer ${created.body.token}`);
      expect(second.status).toBe(200);
      expect(second.body.acessos[0].agentId).toBe(agentB);

      const rotateBegin = await request(app)
        .post("/app/api/setup/rotacionar")
        .set("Authorization", `Bearer ${first.token}`)
        .send({});
      const rotateCode = new URL(rotateBegin.body.setupUrl as string).pathname.split("/").at(-1)!;
      const rotateForm = await request(app).get(`/app/api/setup/${rotateCode}`);
      const rotated = await request(app)
        .post(`/setup/${rotateCode}`)
        .set("Origin", origin)
        .set("Accept", "application/json")
        .send({
          csrf: rotateForm.body.csrf,
          confirmado: "sim",
          email: "persona-a@example.com",
          senha: "secret-pass",
        });
      expect(rotated.status).toBe(200);
      expect(rotated.body.token).toBeTruthy();
      expect(rotated.body.token).not.toBe(first.token);

      const oldBearer = await request(app)
        .get("/app/api/acesso")
        .set("Authorization", `Bearer ${first.token}`);
      expect(oldBearer.status).toBe(401);
      const newBearer = await request(app)
        .get("/app/api/acesso")
        .set("Authorization", `Bearer ${rotated.body.token}`);
      expect(newBearer.status).toBe(200);
      expect(newBearer.body.acessos[0].id).toBe(first.acessoId);

      const skills = await request(app)
        .get("/app/api/skills")
        .set("Authorization", `Bearer ${rotated.body.token}`);
      expect(skills.status).toBe(200);
      expect(Array.isArray(skills.body.skills)).toBe(true);
      const refused = await request(app)
        .post("/app/api/skills")
        .set("Authorization", `Bearer ${rotated.body.token}`)
        .send({ slug: "vazia", nome: "Vazia", descricao: "sem tabela", sqlModelo: "SELECT 1" });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.body.code).toBeTruthy();
      expect(JSON.stringify(refused.body)).not.toContain("tok-sql");
    } finally {
      await close();
    }
  });
});
