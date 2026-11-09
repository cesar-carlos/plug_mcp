import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { trainingManifest } from "../../src/application/persona-v2/training-topics.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import {
  diagnosePersonaPlugin,
  personaPluginCompatibility,
} from "../../src/infrastructure/plugins/persona-compatibility.js";

it.each(["package", "server"])("valida manifesto presente mesmo sem o outro lado: %s", (side) => {
  const contract = personaPluginCompatibility("portable");
  const invalid = {
    ...trainingManifest(),
    baseHash: "0".repeat(64),
    secret: "synthetic-private-value",
  };
  const result = diagnosePersonaPlugin(
    contract,
    contract,
    side === "package" ? invalid : undefined,
    side === "server" ? invalid : undefined,
  );
  expect(result).toMatchObject({ compatible: false, differences: ["trainingManifest"] });
  expect(JSON.stringify(result)).not.toContain("synthetic-private-value");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("recusa dois manifestos igualmente incompletos mesmo com hashes coerentes", () => {
  const manifest = trainingManifest();
  manifest.topics.pop();
  const contract = {
    ...personaPluginCompatibility("portable"),
    trainingTopicsHash: createHash("sha256").update(canonicalJson(manifest.topics)).digest("hex"),
  };
  expect(diagnosePersonaPlugin(contract, contract, manifest, manifest)).toMatchObject({
    compatible: false,
    differences: ["trainingManifest"],
  });
});
it.each(["hash", "duplicate"])("recusa manifesto unilateral inconsistente: %s", (kind) => {
  const manifest = trainingManifest();
  const contract = personaPluginCompatibility("portable");
  if (kind === "hash") manifest.baseHash = "0".repeat(64);
  else {
    manifest.topics[1] = { ...manifest.topics[0]! };
    contract.trainingTopicsHash = createHash("sha256")
      .update(canonicalJson(manifest.topics))
      .digest("hex");
  }
  expect(diagnosePersonaPlugin(contract, contract, manifest)).toMatchObject({
    compatible: false,
    differences: ["trainingManifest"],
  });
});
it.each(["package", "server", "none"])(
  "ausência opcional não reprova manifesto válido: %s",
  (side) => {
    const contract = personaPluginCompatibility("portable");
    expect(
      diagnosePersonaPlugin(
        contract,
        contract,
        side === "package" ? trainingManifest() : undefined,
        side === "server" ? trainingManifest() : undefined,
      ),
    ).toMatchObject({ compatible: true, installedPackageVerified: false });
  },
);
