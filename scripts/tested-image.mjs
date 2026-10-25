import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifyLoadedIdentity } from "./tested-image-identity.mjs";

function requireThat(condition) {
  if (!condition) throw new Error("Invalid tested image artifact.");
}
function regularFile(path, maximum) {
  const stat = lstatSync(path);
  requireThat(!stat.isSymbolicLink() && stat.isFile() && stat.size > 0 && stat.size <= maximum);
  return stat;
}
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function inspect(reference) {
  requireThat(typeof reference === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:._/-]*$/.test(reference));
  const [image] = JSON.parse(
    execFileSync("docker", ["image", "inspect", reference], {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    }),
  );
  const entry = image.Config?.Entrypoint?.join(" ");
  requireThat(["./docker-entrypoint.sh", "./docker-entrypoint-persona-v2.sh"].includes(entry));
  return {
    imageId: image.Id,
    platform: `${image.Os}/${image.Architecture}`,
    runtime:
      entry === "./docker-entrypoint.sh"
        ? "legacy"
        : image.Config.Labels?.["io.se7e.runtime"] === "persona-v2-test-server"
          ? "persona-v2-test-server"
          : "persona-v2-candidate",
    revision: image.Config.Env.find((value) => value.startsWith("GIT_SHA="))?.slice(8),
    descriptor: image.Descriptor,
  };
}
try {
  const [mode, directory, reference, ...extra] = process.argv.slice(2);
  requireThat(extra.length === 0 && ["record", "verify", "verify-loaded"].includes(mode));
  requireThat(mode === "verify" ? reference === undefined : typeof reference === "string");
  requireThat(typeof directory === "string");
  const root = resolve(directory);
  const stat = lstatSync(root);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink());
  const revision =
    process.env.PERSONA_V2_IMAGE_REVISION ??
    process.env.PERSONA_V2_RELEASE_REVISION ??
    process.env.GITHUB_SHA;
  requireThat(typeof revision === "string" && /^[a-f0-9]{40}$/.test(revision));
  const archive = join(root, "image.tar");
  const proof = join(root, "image-proof.json");
  const size = regularFile(archive, 16 * 1024 ** 3).size;
  const archiveSha256 = await digest(archive);
  if (mode === "record") {
    const image = inspect(reference);
    requireThat(
      image.revision === revision &&
        image.platform === "linux/amd64" &&
        /^sha256:[a-f0-9]{64}$/.test(image.imageId),
    );
    writeFileSync(
      proof,
      JSON.stringify({ schemaVersion: 1, ...image, archiveSha256, archiveBytes: size }) + "\n",
      { flag: "wx" },
    );
  } else {
    regularFile(proof, 4096);
    const data = JSON.parse(readFileSync(proof, "utf8"));
    requireThat(
      data.schemaVersion === 1 && data.revision === revision && data.platform === "linux/amd64",
    );
    requireThat(
      ["legacy", "persona-v2-candidate", "persona-v2-test-server"].includes(data.runtime) &&
        /^sha256:[a-f0-9]{64}$/.test(data.imageId),
    );
    requireThat(data.archiveSha256 === archiveSha256 && data.archiveBytes === size);
    if (mode === "verify-loaded") {
      const image = inspect(reference);
      verifyLoadedIdentity(data.imageId, image, (id) =>
        execFileSync("tar", ["-xOf", archive, `blobs/sha256/${id.slice(7)}`], {
          stdio: "pipe",
          maxBuffer: 65536,
          timeout: 30000,
        }),
      );
      requireThat(["revision", "platform", "runtime"].every((key) => image[key] === data[key]));
    }
  }
  console.log("Tested image artifact verified; no release authorization granted.");
} catch {
  console.error("Tested image refused: missing, altered or inconsistent artifact/revision.");
  process.exitCode = 1;
}
