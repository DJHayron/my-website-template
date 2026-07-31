import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteTextFile } from "@/lib/admin/articles/atomic-write";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("atomic article writes", () => {
  it("keeps the previous file and removes its temp file when rename fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "admin-atomic-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "main.md");
    await writeFile(filePath, "old source", "utf8");

    await expect(
      atomicWriteTextFile(filePath, "new source", {
        rename: async () => {
          throw new Error("injected rename failure");
        },
      }),
    ).rejects.toThrow(/injected rename failure/);

    await expect(readFile(filePath, "utf8")).resolves.toBe("old source");
    await expect(readdir(directory)).resolves.toEqual(["main.md"]);
  });
});
