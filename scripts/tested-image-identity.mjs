import { createHash } from "node:crypto";

// Classic Docker reports the config digest; containerd reports the OCI manifest
// digest. A matching tag/revision is insufficient: prove the edge in the exact
// archive whose hash was checked before invoking this function.
export function verifyLoadedIdentity(proofId, image, readBlob) {
  const fail = () => {
    throw new Error("Loaded image identity differs from the tested archive.");
  };
  if (!/^sha256:[a-f0-9]{64}$/.test(proofId) || !/^sha256:[a-f0-9]{64}$/.test(image.imageId))
    fail();
  if (image.imageId === proofId) return;
  const descriptor = image.descriptor;
  if (
    descriptor?.digest !== image.imageId ||
    descriptor.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
    !Number.isSafeInteger(descriptor.size) ||
    descriptor.size < 1 ||
    descriptor.size > 65536
  )
    fail();
  const bytes = readBlob(image.imageId);
  if (
    bytes.length !== descriptor.size ||
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== image.imageId
  )
    fail();
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (
    manifest.schemaVersion !== 2 ||
    manifest.mediaType !== descriptor.mediaType ||
    manifest.config?.mediaType !== "application/vnd.oci.image.config.v1+json" ||
    manifest.config.digest !== proofId
  )
    fail();
}
