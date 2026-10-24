import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function fixture() {
  const proofId = `sha256:${"a".repeat(64)}`;
  const bytes = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: proofId },
  });
  const imageId = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  return {
    proofId,
    bytes,
    image: {
      imageId,
      descriptor: {
        digest: imageId,
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        size: Buffer.byteLength(bytes),
      },
    },
  };
}
function verify(value: ReturnType<typeof fixture>) {
  const module = pathToFileURL(resolve("scripts/tested-image-identity.mjs")).href;
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {verifyLoadedIdentity} from ${JSON.stringify(module)}; import {readFileSync} from 'node:fs'; const f=JSON.parse(readFileSync(0,'utf8')); verifyLoadedIdentity(f.proofId,f.image,()=>Buffer.from(f.bytes));`,
    ],
    { input: JSON.stringify(value), encoding: "utf8", timeout: 10000 },
  ).status;
}
describe("loaded OCI identity", () => {
  it("accepts the exact config digest and its cryptographically bound OCI manifest", () => {
    expect(verify(fixture())).toBe(0);
    const classic = fixture();
    classic.image.imageId = classic.proofId;
    expect(verify(classic)).toBe(0);
  });
  it.each(["proof", "bytes", "size", "descriptor", "mediaType", "invalidId"])(
    "refuses changed %s",
    (kind) => {
      const value = fixture();
      if (kind === "proof") value.proofId = `sha256:${"b".repeat(64)}`;
      if (kind === "bytes") value.bytes = value.bytes.replace("config", "other_");
      if (kind === "size") value.image.descriptor.size += 1;
      if (kind === "descriptor") value.image.descriptor.digest = value.proofId;
      if (kind === "mediaType")
        value.image.descriptor.mediaType = "application/vnd.oci.image.index.v1+json";
      if (kind === "invalidId") value.image.imageId = "../unsafe";
      expect(verify(value)).toBe(1);
    },
  );
});
