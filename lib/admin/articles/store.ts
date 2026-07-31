import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BLOG_CONTENT_DIRECTORY, BLOG_POST_FILE_NAME } from "@/lib/blog/constants";
import { blogFrontmatterSchema, type BlogFrontmatterData } from "@/lib/blog/schema";
import { clearContentCache } from "@/lib/content/cache";
import {
  parseFrontmatter,
  patchFrontmatter,
  serializeFrontmatter,
} from "@/lib/content/frontmatter";
import { AdminApiError } from "@/lib/admin/http";
import { canMutateArticle, getUpdateMutation } from "@/lib/admin/policy";
import { atomicWriteTextFile } from "@/lib/admin/articles/atomic-write";
import { writeArticleWithHistory } from "@/lib/admin/articles/versions";
import { parseArticleSlug } from "@/lib/admin/articles/slug";
import type {
  AdminArticle,
  AdminArticleInput,
  AdminArticleListItem,
  AdminArticleRevision,
  AdminArticleStatus,
  AdminRole,
  AdminSaveMode,
} from "@/types/admin";

type ArticleStoreOptions = {
  blogDirectory?: string;
  now?: () => Date;
  trashDirectory?: string;
  writeArticleWithHistory?: typeof writeArticleWithHistory;
};

type ArticleSource = {
  article: AdminArticle;
  data: BlogFrontmatterData;
  directoryPath: string;
  filePath: string;
  source: string;
};

export type ArchivedArticle = {
  archiveId: string;
  archivedAt: string;
  slug: string;
};

const isInsideDirectory = (parent: string, target: string) =>
  target === parent || target.startsWith(`${parent}${path.sep}`);

const processMutationQueues = new Map<string, Promise<void>>();

const getMutationQueueKey = (directory: string) =>
  process.platform === "win32" ? directory.toLocaleLowerCase("en-US") : directory;

function createRevision(source: string) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function toArticle(
  slug: string,
  source: string,
  data: BlogFrontmatterData,
  updatedAt: string,
): AdminArticle {
  const { content } = parseFrontmatter(source);

  return {
    content,
    date: data.date,
    description: data.summary,
    pathSegments: slug.split("/"),
    published: data.published ?? false,
    revision: createRevision(source),
    slug,
    tags: data.tags ?? [],
    title: data.title,
    updatedAt,
  };
}

function toArticleListItem(article: AdminArticle): AdminArticleListItem {
  return {
    date: article.date,
    description: article.description,
    pathSegments: article.pathSegments,
    published: article.published,
    revision: article.revision,
    slug: article.slug,
    tags: article.tags,
    title: article.title,
    updatedAt: article.updatedAt,
  };
}

export function createArticleStore(options: ArticleStoreOptions = {}) {
  const blogDirectory = path.resolve(options.blogDirectory ?? BLOG_CONTENT_DIRECTORY);
  const contentDirectory = path.dirname(blogDirectory);
  const trashDirectory = path.resolve(
    options.trashDirectory ?? path.join(blogDirectory, "..", ".trash", "blog"),
  );
  const now = options.now ?? (() => new Date());
  const writeManualArticle = options.writeArticleWithHistory ?? writeArticleWithHistory;

  async function runMutation<T>(task: () => Promise<T>) {
    const realRoot = await ensureBlogRoot();
    const queueKey = getMutationQueueKey(realRoot);
    const previousQueue = processMutationQueues.get(queueKey) ?? Promise.resolve();
    const result = previousQueue.then(task, task);
    const nextQueue = result.then(
      () => undefined,
      () => undefined,
    );
    processMutationQueues.set(queueKey, nextQueue);

    try {
      return await result;
    } finally {
      if (processMutationQueues.get(queueKey) === nextQueue) {
        processMutationQueues.delete(queueKey);
      }
    }
  }

  async function ensureBlogRoot() {
    await fs.mkdir(contentDirectory, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const contentStats = await fs.lstat(contentDirectory);

    if (!contentStats.isDirectory() || contentStats.isSymbolicLink()) {
      throw new AdminApiError(500, "unsafe_content_root", "內容根目錄不可使用。");
    }

    await fs.mkdir(blogDirectory, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stats = await fs.lstat(blogDirectory);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new AdminApiError(500, "unsafe_content_root", "文章儲存目錄不可使用。");
    }

    const [realContentRoot, realBlogRoot] = await Promise.all([
      fs.realpath(contentDirectory),
      fs.realpath(blogDirectory),
    ]);

    if (!isInsideDirectory(realContentRoot, realBlogRoot) || realBlogRoot === realContentRoot) {
      throw new AdminApiError(500, "unsafe_content_root", "文章儲存目錄超出內容根目錄。");
    }

    return realBlogRoot;
  }

  async function ensureTrashRoot() {
    const realBlogRoot = await ensureBlogRoot();
    const realContentRoot = await fs.realpath(contentDirectory);

    if (
      !isInsideDirectory(contentDirectory, trashDirectory) ||
      trashDirectory === contentDirectory ||
      isInsideDirectory(blogDirectory, trashDirectory)
    ) {
      throw new AdminApiError(500, "unsafe_trash_root", "封存目錄必須位於 content 內且在 blog 外。" );
    }

    const relativeSegments = path.relative(contentDirectory, trashDirectory).split(path.sep);
    let currentPath = contentDirectory;

    for (const segment of relativeSegments) {
      currentPath = path.join(currentPath, segment);
      await fs.mkdir(currentPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      const stats = await fs.lstat(currentPath);

      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new AdminApiError(500, "unsafe_trash_root", "封存目錄不可使用符號連結。" );
      }
    }

    const realTrashRoot = await fs.realpath(trashDirectory);

    if (
      !isInsideDirectory(realContentRoot, realTrashRoot) ||
      isInsideDirectory(realBlogRoot, realTrashRoot)
    ) {
      throw new AdminApiError(500, "unsafe_trash_root", "封存目錄超出安全內容邊界。" );
    }

    return realTrashRoot;
  }

  async function resolveLocation(slugValue: string | readonly string[], mustExist: boolean) {
    const { pathSegments, slug } = parseArticleSlug(slugValue);
    const realRoot = await ensureBlogRoot();
    const directoryPath = path.resolve(realRoot, ...pathSegments);

    if (!isInsideDirectory(realRoot, directoryPath) || directoryPath === realRoot) {
      throw new AdminApiError(400, "invalid_slug", "Slug 無法解析為安全路徑。");
    }

    let currentPath = realRoot;

    for (const segment of pathSegments) {
      currentPath = path.join(currentPath, segment);

      try {
        const stats = await fs.lstat(currentPath);

        if (!stats.isDirectory() || stats.isSymbolicLink()) {
          throw new AdminApiError(409, "unsafe_article_path", "文章路徑與既有檔案衝突。");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (mustExist) {
            throw new AdminApiError(404, "article_not_found", "找不到指定文章。");
          }
          break;
        }
        throw error;
      }
    }

    return {
      directoryPath,
      filePath: path.join(directoryPath, BLOG_POST_FILE_NAME),
      pathSegments,
      realRoot,
      slug,
    };
  }

  async function readSource(slugValue: string | readonly string[]): Promise<ArticleSource> {
    const location = await resolveLocation(slugValue, true);
    let source: string;
    let stats;

    try {
      const fileStats = await fs.lstat(location.filePath);

      if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
        throw new AdminApiError(404, "article_not_found", "找不到指定文章。");
      }

      [source, stats] = await Promise.all([
        fs.readFile(location.filePath, "utf8"),
        fs.stat(location.filePath),
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AdminApiError(404, "article_not_found", "找不到指定文章。");
      }
      throw error;
    }

    const parsed = parseFrontmatter(source);
    const frontmatter = blogFrontmatterSchema.safeParse(parsed.data);

    if (!frontmatter.success || !parsed.content.trim()) {
      throw new AdminApiError(500, "invalid_article_source", "文章來源格式不正確。");
    }

    return {
      article: toArticle(location.slug, source, frontmatter.data, stats.mtime.toISOString()),
      data: frontmatter.data,
      directoryPath: location.directoryPath,
      filePath: location.filePath,
      source,
    };
  }

  async function collectSlugs() {
    const realRoot = await ensureBlogRoot();
    const rootEntries = await fs.readdir(realRoot, { withFileTypes: true });
    const slugs: string[] = [];

    for (const rootEntry of rootEntries) {
      if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
        continue;
      }

      try {
        parseArticleSlug(rootEntry.name);
      } catch {
        continue;
      }

      const rootSlug = rootEntry.name;
      const rootPostPath = path.join(realRoot, rootSlug, BLOG_POST_FILE_NAME);

      try {
        const stats = await fs.lstat(rootPostPath);
        if (stats.isFile() && !stats.isSymbolicLink()) {
          slugs.push(rootSlug);
          continue;
        }
        throw new AdminApiError(500, "unsafe_article_path", "文章來源包含不安全的檔案型態。");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        // A directory without main.md may be a two-level series.
      }

      let childEntries;

      try {
        childEntries = await fs.readdir(path.join(realRoot, rootSlug), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }

      for (const childEntry of childEntries) {
        const childSlug = `${rootSlug}/${childEntry.name}`;

        if (!childEntry.isDirectory() || childEntry.isSymbolicLink()) {
          continue;
        }

        try {
          parseArticleSlug(childSlug);
        } catch {
          continue;
        }

        try {
          const stats = await fs.lstat(
            path.join(realRoot, rootSlug, childEntry.name, BLOG_POST_FILE_NAME),
          );
          if (stats.isFile() && !stats.isSymbolicLink()) {
            slugs.push(childSlug);
            continue;
          }
          throw new AdminApiError(500, "unsafe_article_path", "文章來源包含不安全的檔案型態。");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
          // Incomplete series directories are not article records.
        }
      }
    }

    return slugs;
  }

  async function list(input: { query?: string; status?: AdminArticleStatus } = {}) {
    const query = input.query?.trim().toLocaleLowerCase() ?? "";
    const status = input.status ?? "all";
    const articles = await Promise.all((await collectSlugs()).map((slug) => readSource(slug)));

    return articles
      .map(({ article }) => toArticleListItem(article))
      .filter((article) => {
        if (status === "draft" && article.published) return false;
        if (status === "published" && !article.published) return false;
        if (!query) return true;
        return [article.title, article.description, article.slug, ...article.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) satisfies AdminArticleListItem[];
  }

  async function create(slugValue: string, input: AdminArticleInput, role: AdminRole) {
    return runMutation(async () => {
      if (!canMutateArticle(role, input.published ? "create-published" : "create-draft")) {
        throw new AdminApiError(403, "forbidden", "Editor 只能建立草稿。");
      }

      const location = await resolveLocation(slugValue, false);

      try {
        await fs.lstat(location.directoryPath);
        throw new AdminApiError(409, "slug_exists", "這個 slug 已經存在。");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      if (location.pathSegments.length === 2) {
        const parentDirectory = path.dirname(location.directoryPath);
        const parentArticlePath = path.join(parentDirectory, BLOG_POST_FILE_NAME);

        try {
          await fs.access(parentArticlePath);
          throw new AdminApiError(409, "slug_parent_is_article", "父層 slug 已是一篇文章。");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }

        await fs.mkdir(parentDirectory, { recursive: true });
        const parentStats = await fs.lstat(parentDirectory);
        if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
          throw new AdminApiError(409, "unsafe_article_path", "文章父層路徑不可使用。");
        }
      }

      await fs.mkdir(location.directoryPath);

      try {
        const data: BlogFrontmatterData = {
          date: input.date,
          published: input.published,
          summary: input.description,
          tags: [...new Set(input.tags)],
          title: input.title,
        };
        await atomicWriteTextFile(
          location.filePath,
          serializeFrontmatter(data, input.content),
        );
        clearContentCache();
        return (await readSource(location.slug)).article;
      } catch (error) {
        await fs.rmdir(location.directoryPath).catch(() => undefined);
        throw error;
      }
    });
  }

  async function update(
    slugValue: string | readonly string[],
    input: AdminArticleInput & { revision: string },
    role: AdminRole,
    saveMode: AdminSaveMode = "manual",
  ) {
    return runMutation(async () => {
      const current = await readSource(slugValue);
      const mutation = getUpdateMutation(current.article.published, input.published);

      if (!canMutateArticle(role, mutation)) {
        throw new AdminApiError(
          403,
          "forbidden",
          "Editor 不可發布、取消發布或修改已發布文章。",
        );
      }

      if (current.article.revision !== input.revision) {
        throw new AdminApiError(409, "revision_conflict", "文章已被其他編輯更新。", {
          currentRevision: current.article.revision,
          currentUpdatedAt: current.article.updatedAt,
        });
      }

      if (saveMode === "autosave" && current.article.published !== input.published) {
        throw new AdminApiError(
          422,
          "autosave_lifecycle_forbidden",
          "自動儲存不能變更文章的發布狀態。",
        );
      }

      const nextData: BlogFrontmatterData = {
        date: input.date,
        published: input.published,
        summary: input.description,
        tags: [...new Set(input.tags)],
        title: input.title,
      };
      const nextSource = patchFrontmatter(current.source, nextData, input.content);

      if (saveMode === "manual") {
        await writeManualArticle(current.filePath, current.source, nextSource);
      } else {
        await atomicWriteTextFile(current.filePath, nextSource);
      }
      clearContentCache();
      return (await readSource(current.article.slug)).article;
    });
  }

  async function archive(slugValue: string | readonly string[], role: AdminRole) {
    return runMutation(async (): Promise<ArchivedArticle> => {
      if (!canMutateArticle(role, "archive")) {
        throw new AdminApiError(403, "forbidden", "只有 admin 可以封存文章。");
      }

      const current = await readSource(slugValue);
      const archivedAt = now().toISOString();
      const archiveId = `${Date.parse(archivedAt)}-${randomUUID()}`;
      const realTrashRoot = await ensureTrashRoot();
      const archiveRoot = path.join(realTrashRoot, archiveId);
      const archivedDirectory = path.join(archiveRoot, ...current.article.pathSegments);

      await fs.mkdir(path.dirname(archivedDirectory), { recursive: true });

      try {
        await atomicWriteTextFile(
          path.join(archiveRoot, "archive.json"),
          `${JSON.stringify({ archiveId, archivedAt, slug: current.article.slug }, null, 2)}\n`,
        );
        await fs.rename(current.directoryPath, archivedDirectory);
      } catch (error) {
        await fs.rm(archiveRoot, { force: true, recursive: true }).catch(() => undefined);
        throw error;
      }

      if (current.article.pathSegments.length === 2) {
        await fs.rmdir(path.dirname(current.directoryPath)).catch(() => undefined);
      }

      clearContentCache();
      return { archiveId, archivedAt, slug: current.article.slug };
    });
  }

  return {
    archive,
    blogDirectory,
    create,
    list,
    read: async (slugValue: string | readonly string[]) => (await readSource(slugValue)).article,
    readRevision: async (
      slugValue: string | readonly string[],
    ): Promise<AdminArticleRevision> => {
      const { revision, updatedAt } = (await readSource(slugValue)).article;
      return { revision, updatedAt };
    },
    trashDirectory,
    update,
  };
}

export const articleStore = createArticleStore();
