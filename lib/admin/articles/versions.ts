import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AdminApiError } from "@/lib/admin/http";

export const MAX_ARTICLE_VERSION_FILES = 5;
export const MAX_ARTICLE_HISTORY_FILES = MAX_ARTICLE_VERSION_FILES - 1;

type VersionFileSnapshot = {
  atimeSeconds: number;
  mode: number;
  mtimeSeconds: number;
  source: string;
};

type StagedFile = {
  filePath: string;
};

export type ArticleVersionTransactionOptions = {
  remove?: typeof fs.rm;
  rename?: typeof fs.rename;
};

export function getArticleHistoryFilePath(mainFilePath: string, version: number) {
  if (!Number.isInteger(version) || version < 1 || version > MAX_ARTICLE_HISTORY_FILES) {
    throw new RangeError("Article history version is outside the retained range.");
  }

  const extension = path.extname(mainFilePath);
  const basename = path.basename(mainFilePath, extension);
  return path.join(path.dirname(mainFilePath), `${basename}.${version}${extension}`);
}

async function readVersionFile(
  filePath: string,
  { required }: { required: boolean },
): Promise<VersionFileSnapshot | null> {
  try {
    const stats = await fs.lstat(filePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new AdminApiError(
        409,
        "unsafe_article_history",
        "文章版本路徑不是安全的一般檔案。",
      );
    }

    return {
      atimeSeconds: stats.atimeMs / 1_000,
      mode: stats.mode,
      mtimeSeconds: stats.mtimeMs / 1_000,
      source: await fs.readFile(filePath, "utf8"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return null;
    }

    throw error;
  }
}

async function stageTextFile(
  targetPath: string,
  source: string,
  purpose: "next" | "rollback",
  metadata?: Pick<VersionFileSnapshot, "atimeSeconds" | "mode" | "mtimeSeconds">,
): Promise<StagedFile> {
  const filePath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.${purpose}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;

  try {
    handle = await fs.open(filePath, "wx", 0o600);
    await handle.writeFile(source, "utf8");

    if (metadata) {
      await handle.chmod(metadata.mode & 0o777);
      await handle.utimes(metadata.atimeSeconds, metadata.mtimeSeconds);
    }

    await handle.sync();
    await handle.close();
    handle = undefined;
    return { filePath };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function cleanupStagedFiles(stagedFiles: Iterable<StagedFile>) {
  await Promise.all(
    Array.from(stagedFiles, ({ filePath }) =>
      fs.rm(filePath, { force: true }).catch(() => undefined),
    ),
  );
}

/**
 * Commits main.md and its four retained snapshots as one recoverable operation.
 * Every next value and rollback value is staged before the first live path is
 * changed. A caught commit failure restores the exact prior file set and bytes.
 */
export async function writeArticleWithHistory(
  mainFilePath: string,
  expectedCurrentSource: string,
  nextSource: string,
  options: ArticleVersionTransactionOptions = {},
) {
  const rename = options.rename ?? fs.rename;
  const remove = options.remove ?? fs.rm;
  const historyPaths = Array.from(
    { length: MAX_ARTICLE_HISTORY_FILES },
    (_, index) => getArticleHistoryFilePath(mainFilePath, index + 1),
  );
  const targetPaths = [mainFilePath, ...historyPaths];
  const [mainSnapshot, ...historySnapshots] = await Promise.all([
    readVersionFile(mainFilePath, { required: true }),
    ...historyPaths.map((filePath) => readVersionFile(filePath, { required: false })),
  ]);

  if (!mainSnapshot || mainSnapshot.source !== expectedCurrentSource) {
    throw new AdminApiError(409, "revision_conflict", "文章已被其他編輯更新。");
  }

  const originalSnapshots: Array<VersionFileSnapshot | null> = [
    mainSnapshot,
    ...historySnapshots,
  ];
  const nextSources: Array<string | null> = [
    nextSource,
    mainSnapshot.source,
    historySnapshots[0]?.source ?? null,
    historySnapshots[1]?.source ?? null,
    historySnapshots[2]?.source ?? null,
  ];
  const nextStages = new Map<string, StagedFile>();
  const rollbackStages = new Map<string, StagedFile>();
  let preserveFailedRollbackStages = false;

  try {
    for (let index = 0; index < targetPaths.length; index += 1) {
      const targetPath = targetPaths[index];
      const nextValue = nextSources[index];
      const original = originalSnapshots[index];

      if (nextValue !== null) {
        nextStages.set(targetPath, await stageTextFile(targetPath, nextValue, "next"));
      }

      if (original) {
        rollbackStages.set(
          targetPath,
          await stageTextFile(targetPath, original.source, "rollback", original),
        );
      }
    }

    const commitOrder = [...historyPaths].reverse().concat(mainFilePath);

    try {
      for (const targetPath of commitOrder) {
        const nextStage = nextStages.get(targetPath);

        if (nextStage) {
          await rename(nextStage.filePath, targetPath);
          nextStages.delete(targetPath);
        } else {
          await remove(targetPath, { force: true });
        }
      }
    } catch (commitError) {
      const rollbackErrors: unknown[] = [];

      for (const targetPath of targetPaths) {
        const rollbackStage = rollbackStages.get(targetPath);

        try {
          if (rollbackStage) {
            await rename(rollbackStage.filePath, targetPath);
            rollbackStages.delete(targetPath);
          } else {
            await remove(targetPath, { force: true });
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (rollbackErrors.length > 0) {
        preserveFailedRollbackStages = true;
        throw new AggregateError(
          [commitError, ...rollbackErrors],
          "Article version commit failed and rollback was incomplete.",
        );
      }

      throw commitError;
    }
  } finally {
    await cleanupStagedFiles([
      ...nextStages.values(),
      ...(preserveFailedRollbackStages ? [] : rollbackStages.values()),
    ]);
  }
}
