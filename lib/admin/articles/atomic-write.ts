import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type AtomicWriteOptions = {
  rename?: typeof fs.rename;
};

export async function atomicWriteTextFile(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {},
) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const rename = options.rename ?? fs.rename;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;

  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
