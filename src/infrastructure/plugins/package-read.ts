import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { PluginFailure } from "./package-diagnostics.js";

const same = (a: Stats, b: Stats): boolean =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;

/** Bounded descriptor read; never follow a final symlink or accept a replaced file. */
export async function readStablePluginFile(path: string | URL, limit: number): Promise<Buffer> {
  const before = await lstat(path);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size > limit
  ) {
    throw new PluginFailure("UNSAFE_FILE");
  }
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
  let failure: PluginFailure | undefined;
  let result!: Buffer;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !same(before, opened)) throw new PluginFailure("FILE_CHANGED");
    const data = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < data.length) {
      const { bytesRead } = await handle.read(data, length, data.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await lstat(path);
    if (
      length !== before.size ||
      !same(before, await handle.stat()) ||
      !same(before, after) ||
      after.isSymbolicLink()
    ) {
      throw new PluginFailure("FILE_CHANGED");
    }
    result = data.subarray(0, length);
  } catch (error) {
    failure = error instanceof PluginFailure ? error : new PluginFailure("FILE_READ_FAILED");
  }
  try {
    await handle.close();
  } catch {
    failure ??= new PluginFailure("FILE_CLOSE_FAILED");
    failure.cleanupFailed = true;
  }
  if (failure) throw failure;
  return result;
}
