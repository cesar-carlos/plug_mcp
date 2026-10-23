import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  compileOperationTraining,
  compileOperationCommand,
  type OperationTraining,
} from "../../../src/application/persona-v2/operation-training.js";
import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { authorizeOperationPublication } from "../../../src/application/persona-v2/operation-authority.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import type { AuthorizationSnapshot } from "../../../src/domain/persona-v2/model.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const source = { ...trainingSource, dialect: "sybase" as const };
const training = (): OperationTraining => {
  const t: OperationTraining = operationTraining();
  t.dialect = "sybase";
  t.maxAffectedRows = 2;
  t.tables[0]!.uniqueKeys = [["version"]];
  t.tables[0]!.columns.find((c) => c.name === "version")!.writable = true;
  t.steps = [
    {
      id: "create",
      effect: "insert",
      table: "orders",
      values: [
        { column: "amount", binding: { kind: "input", name: "amount" } },
        { column: "version", binding: { kind: "input", name: "version" } },
      ],
      where: [],
      outputs: [{ column: "id", type: "integer" }],
      rows: { min: 1, max: 1 },
    },
    {
      ...t.steps[0]!,
      outputs: [{ column: "amount", type: "decimal" }],
      where: [
        { column: "id", binding: { kind: "step_output", stepId: "create", output: "id" } },
        { column: "version", binding: { kind: "input", name: "version" } },
      ],
    },
  ];
  return t;
};
const compile = (t: OperationTraining, s = source) => {
  const pkg = compileOperationTraining(t, s, crypto, "Fixture");
  return { pkg, command: compileOperationCommand(pkg, s, randomUUID(), operationInput, crypto) };
};
it("SQL Anywhere recupera ID gerado por chave UNIQUE e preserva bindings posteriores", () => {
  const { pkg, command } = compile(training());
  expect(command.steps).toHaveLength(4);
  expect(command.steps[0]).toMatchObject({
    id: "__operation_write_0",
    effect: "insert",
    outputs: {},
    affectedRows: { min: 1, max: 1 },
  });
  expect(command.steps[1]).toMatchObject({
    id: "create",
    effect: "select",
    sql: "SELECT [id] FROM [orders] WHERE [version] = :v_version",
    outputs: { id: "integer" },
    expectedRows: { min: 1, max: 1 },
  });
  expect(command.steps[2]!.params.w_id).toEqual({
    kind: "step_output",
    stepId: "create",
    output: "id",
  });
  expect(command.steps[3]!.sql).toBe("SELECT [amount] FROM [orders] WHERE [id] = :w_id");
  expect(pkg.requiredCapabilities).toContain(`source:${source.id}:table:orders:select`);
  expect(command.steps.some((s) => /MAX\(|@@|RETURNING/i.test(s.sql))).toBe(false);
});
it("recusa chave ausente/nula/inválida, saída de várias linhas e colisão de ID interno", () => {
  for (const change of [
    (t: OperationTraining) => {
      delete t.tables[0]!.uniqueKeys;
    },
    (t: OperationTraining) => {
      t.tables[0]!.uniqueKeys = [["missing"]];
    },
    (t: OperationTraining) => {
      t.tables[0]!.uniqueKeys = [["id"]];
    },
    (t: OperationTraining) => {
      t.parameters.find((p) => p.name === "version")!.nullable = true;
    },
    (t: OperationTraining) => {
      t.steps[0]!.rows = { min: 0, max: 1 };
    },
    (t: OperationTraining) => {
      t.steps[0]!.id = "__operation_write_1";
    },
  ]) {
    const t = training();
    change(t);
    expect(() => compile(t)).toThrow();
  }
});
it("recortes são reaplicados na leitura de saídas e não vêm do consumidor", () => {
  const t = training();
  t.tables[0]!.columns.push({
    name: "tenant_id",
    type: "integer",
    writable: false,
    meaning: "Empresa",
  });
  const s = {
    ...source,
    rowRestrictions: [
      { table: "orders", column: "tenant_id", parameter: "__scope_tenant", value: 7 },
    ],
  };
  t.tables[0]!.uniqueKeys = [["version", "tenant_id"]];
  const { command } = compile(t, s);
  expect(command.steps[1]!.sql).toContain("AND [tenant_id] = :__scope_tenant");
  expect(command.steps[3]!.sql).toContain("AND [tenant_id] = :__scope_tenant");
  expect(command.steps[1]!.params.__scope_tenant).toEqual({
    kind: "value",
    scalar: { type: "integer", value: "7" },
  });
});
it("contabiliza SELECTs de saída no teto nativo de 32 comandos", () => {
  const t = training();
  t.maxAffectedRows = 100;
  t.steps = Array.from({ length: 11 }, (_, i) => ({ ...t.steps[0]!, id: `create_${i}` }));
  expect(() => compile(t)).toThrow(/32 comandos/);
});

it("saídas não dispensam concessão SELECT do consumidor nem ampliam tokens antigos", () => {
  const { pkg } = compile(training());
  const identity = {
    personaId: source.personaId,
    tokenId: "token",
    tokenVersion: 1,
    personaVersion: 1,
  };
  const permissions = {
    sourceIds: [source.id],
    skills: [
      {
        skillId: "skill",
        capabilities: [...pkg.requiredCapabilities],
        effects: ["insert", "update"] as ("insert" | "update" | "select")[],
        requireHumanApproval: false,
      },
    ],
    externalOperationIds: [],
    administrative: [],
  };
  const state: AuthorizationSnapshot = {
    persona: {
      id: source.personaId,
      ownerId: "owner",
      name: "Teste",
      specialty: "Teste",
      instructions: "",
      active: true,
      authorizationVersion: 1,
    },
    token: {
      id: "token",
      personaId: source.personaId,
      tokenHash: "hash",
      expiresAt: null,
      revokedAt: null,
      authorizationVersion: 1,
      permissions,
      delegation: permissions,
    },
    sources: [source],
  };
  const publication = {
    id: "publication",
    personaId: source.personaId,
    skillId: "skill",
    revision: 1,
    package: pkg,
    hash: crypto.sha256Hex(canonicalJson(pkg)),
    sourceVersion: 1,
    sourceFingerprint: pkg.sourceFingerprint,
    suspendedAt: null,
  };
  const check = () =>
    authorizeOperationPublication(identity, state, publication, source, crypto, new Date());
  expect(check).toThrow();
  permissions.skills[0]!.effects.push("select");
  expect(check).not.toThrow();
  permissions.skills[0]!.capabilities = permissions.skills[0]!.capabilities.filter(
    (c) => c !== `source:${source.id}:table:orders:select`,
  );
  expect(check).toThrow();
});

it("adapta somente o DML original; consumidor não pode substituir leituras de saída", () => {
  const t = training();
  t.mode = "sql_adaptavel";
  const pkg = compileOperationTraining(t, source, crypto, "Fixture");
  const id = randomUUID();
  const command = compileOperationCommand(
    pkg,
    source,
    id,
    {
      parameters: operationInput,
      sqlByStep: {
        create: "insert into [orders] ([amount], [version]) values (:v_amount, :v_version)",
      },
    },
    crypto,
  );
  expect(command.steps[1]!.sql).toBe("SELECT [id] FROM [orders] WHERE [version] = :v_version");
  for (const sqlByStep of [
    { create: "SELECT [id] FROM [orders] WHERE [version] = :v_version" },
    { __operation_write_0: "INSERT INTO [orders] ([amount]) VALUES (:v_amount)" },
  ])
    expect(() =>
      compileOperationCommand(pkg, source, id, { parameters: operationInput, sqlByStep }, crypto),
    ).toThrow();
});
