import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArticleStore } from "@/lib/admin/articles/store";
import { writeArticleWithHistory } from "@/lib/admin/articles/versions";
import { parseFrontmatter, serializeFrontmatter } from "@/lib/content/frontmatter";
import type { AdminArticleInput } from "@/types/admin";

let temporaryRoot = "";

const draft: AdminArticleInput = {
  content: "## 背景\n\n這是一篇用於隔離測試的繁體中文草稿。",
  date: "2026-07-31",
  description: "說明後台文章服務的安全寫入與衝突處理。",
  published: false,
  tags: ["Next.js", "CMS"],
  title: "後台文章服務實作",
};

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "admin-store-"));
});

afterEach(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

function getStore() {
  return createArticleStore({
    blogDirectory: path.join(temporaryRoot, "content", "blog"),
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    trashDirectory: path.join(temporaryRoot, "content", ".trash", "blog"),
  });
}

describe("admin article store", () => {
  it("creates, reads, searches, and filters drafts in an isolated content root", async () => {
    const store = getStore();
    const created = await store.create("engineering/admin-cms", draft, "editor");

    expect(created).toMatchObject({
      description: draft.description,
      published: false,
      slug: "engineering/admin-cms",
      title: draft.title,
    });
    expect(created.revision).toMatch(/^[a-f0-9]{64}$/);
    await expect(store.read("engineering/admin-cms")).resolves.toEqual(created);
    await expect(store.list({ query: "安全寫入", status: "draft" })).resolves.toHaveLength(1);
    await expect(store.list({ status: "published" })).resolves.toEqual([]);
  });

  it("lists and manages existing articles without renaming legacy slugs", async () => {
    const store = getStore();
    const legacySlugs = [
      "CaseStudy/Overview",
      "LeetCodeEssential150/1.TwoSums",
      "8.StringToInteger(atoi)",
      "LeetCode/模板",
      "155.Min Stack",
    ];

    for (const slug of legacySlugs) {
      const articleDirectory = path.join(store.blogDirectory, ...slug.split("/"));
      await mkdir(articleDirectory, { recursive: true });
      await writeFile(
        path.join(articleDirectory, "main.md"),
        serializeFrontmatter(
          {
            date: draft.date,
            published: false,
            summary: `${slug} legacy summary`,
            tags: draft.tags,
            title: `${slug} legacy title`,
          },
          draft.content,
        ),
        "utf8",
      );
    }

    const listed = await store.list();
    expect(listed.map((article) => article.slug).sort()).toEqual([...legacySlugs].sort());

    const current = await store.read("LeetCode/模板");
    await expect(store.read("leetcode/模板")).rejects.toMatchObject({
      code: "article_not_found",
      status: 404,
    });
    const updated = await store.update(
      current.slug,
      {
        ...draft,
        content: `${draft.content}\n\nLegacy update`,
        revision: current.revision,
      },
      "editor",
      "autosave",
    );
    await expect(store.readRevision(current.slug)).resolves.toMatchObject({
      revision: updated.revision,
    });
    await expect(
      readFile(path.join(store.blogDirectory, "LeetCode", "模板", "main.md"), "utf8"),
    ).resolves.toContain("Legacy update");

    const archive = await store.archive("155.Min Stack", "admin");
    expect(archive.slug).toBe("155.Min Stack");
    await expect(store.read("155.Min Stack")).rejects.toMatchObject({
      code: "article_not_found",
      status: 404,
    });
    await expect(
      readFile(
        path.join(
          store.trashDirectory,
          archive.archiveId,
          "155.Min Stack",
          "main.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("155.Min Stack legacy title");

    await expect(store.create("CaseStudy/new-post", draft, "editor")).rejects.toMatchObject({
      code: "invalid_slug",
      status: 400,
    });
    await expect(store.create("casestudy/new-post", draft, "editor")).rejects.toMatchObject({
      code: "slug_case_conflict",
      status: 409,
    });
  });

  it("rejects duplicates, unsafe slugs, and parent article collisions", async () => {
    const store = getStore();
    await store.create("release-notes", draft, "editor");

    await expect(store.create("release-notes", draft, "editor")).rejects.toMatchObject({
      code: "slug_exists",
      status: 409,
    });
    await expect(store.create("../escape", draft, "editor")).rejects.toMatchObject({
      code: "invalid_slug",
      status: 400,
    });
    await expect(store.create("release-notes/v2", draft, "editor")).rejects.toMatchObject({
      code: "slug_parent_is_article",
      status: 409,
    });
  });

  it("fails closed when the configured blog root is not a safe directory", async () => {
    const contentDirectory = path.join(temporaryRoot, "unsafe-content");
    const blogPath = path.join(contentDirectory, "blog");
    await mkdir(contentDirectory, { recursive: true });
    await writeFile(blogPath, "not a directory", "utf8");
    const store = createArticleStore({ blogDirectory: blogPath });

    await expect(store.list()).rejects.toMatchObject({
      code: "unsafe_content_root",
      status: 500,
    });
  });

  it("enforces editor lifecycle restrictions", async () => {
    const store = getStore();

    await expect(
      store.create("published-directly", { ...draft, published: true }, "editor"),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    const created = await store.create("lifecycle", draft, "editor");
    const published = await store.update(
      "lifecycle",
      { ...draft, published: true, revision: created.revision },
      "admin",
    );

    await expect(
      store.update(
        "lifecycle",
        { ...draft, content: `${draft.content}\n變更`, revision: published.revision },
        "editor",
      ),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(store.archive("lifecycle", "editor")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("serializes concurrent mutations and reports a stale revision conflict", async () => {
    const store = getStore();
    const created = await store.create("conflict-test", draft, "editor");
    const updates = await Promise.allSettled([
      store.update(
        "conflict-test",
        { ...draft, content: `${draft.content}\n\n第一位編輯`, revision: created.revision },
        "editor",
      ),
      store.update(
        "conflict-test",
        { ...draft, content: `${draft.content}\n\n第二位編輯`, revision: created.revision },
        "editor",
      ),
    ]);

    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = updates.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: { code: "revision_conflict", status: 409 },
      status: "rejected",
    });
  });

  it("rotates manual saves through four history files while keeping main.md current", async () => {
    const store = getStore();
    let article = await store.create("manual-history", draft, "editor");
    const articleDirectory = path.join(store.blogDirectory, article.slug);
    const markers = ["B", "C", "D", "E", "F", "G"];

    for (const marker of markers) {
      article = await store.update(
        article.slug,
        {
          ...draft,
          content: `${draft.content}\n\nVersion ${marker}`,
          revision: article.revision,
        },
        "editor",
        "manual",
      );
    }

    expect((await readdir(articleDirectory)).sort()).toEqual([
      "main.1.md",
      "main.2.md",
      "main.3.md",
      "main.4.md",
      "main.md",
    ]);
    await expect(readFile(path.join(articleDirectory, "main.md"), "utf8")).resolves.toContain(
      "Version G",
    );
    await expect(readFile(path.join(articleDirectory, "main.1.md"), "utf8")).resolves.toContain(
      "Version F",
    );
    await expect(readFile(path.join(articleDirectory, "main.2.md"), "utf8")).resolves.toContain(
      "Version E",
    );
    await expect(readFile(path.join(articleDirectory, "main.3.md"), "utf8")).resolves.toContain(
      "Version D",
    );
    await expect(readFile(path.join(articleDirectory, "main.4.md"), "utf8")).resolves.toContain(
      "Version C",
    );
  });

  it("restores main.md and every history file when the final manual commit fails", async () => {
    const store = getStore();
    let article = await store.create("manual-rollback", draft, "editor");

    for (const marker of ["B", "C", "D", "E"]) {
      article = await store.update(
        article.slug,
        {
          ...draft,
          content: `${draft.content}\n\nVersion ${marker}`,
          revision: article.revision,
        },
        "editor",
        "manual",
      );
    }

    const articleDirectory = path.join(store.blogDirectory, article.slug);
    const mainPath = path.join(articleDirectory, "main.md");
    const versionFileNames = ["main.md", "main.1.md", "main.2.md", "main.3.md", "main.4.md"];
    const sourcesBefore = new Map(
      await Promise.all(
        versionFileNames.map(async (fileName) => [
          fileName,
          await readFile(path.join(articleDirectory, fileName), "utf8"),
        ] as const),
      ),
    );
    const mtimesBefore = new Map(
      await Promise.all(
        versionFileNames.map(async (fileName) => [
          fileName,
          (await stat(path.join(articleDirectory, fileName))).mtimeMs,
        ] as const),
      ),
    );
    let mainCommitFailed = false;
    const failingStore = createArticleStore({
      blogDirectory: store.blogDirectory,
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      trashDirectory: store.trashDirectory,
      writeArticleWithHistory: (filePath, currentSource, nextSource) =>
        writeArticleWithHistory(filePath, currentSource, nextSource, {
          rename: async (sourcePath, destinationPath) => {
            if (
              !mainCommitFailed &&
              String(destinationPath) === mainPath &&
              String(sourcePath).endsWith(".next.tmp")
            ) {
              mainCommitFailed = true;
              throw new Error("injected main commit failure");
            }

            await rename(sourcePath, destinationPath);
          },
        }),
    });

    await expect(
      failingStore.update(
        article.slug,
        {
          ...draft,
          content: `${draft.content}\n\nVersion F`,
          revision: article.revision,
        },
        "editor",
        "manual",
      ),
    ).rejects.toThrow(/injected main commit failure/);

    expect(mainCommitFailed).toBe(true);
    expect((await readdir(articleDirectory)).sort()).toEqual([...versionFileNames].sort());

    for (const fileName of versionFileNames) {
      const filePath = path.join(articleDirectory, fileName);
      await expect(readFile(filePath, "utf8")).resolves.toBe(sourcesBefore.get(fileName));
      expect(
        Math.abs((await stat(filePath)).mtimeMs - (mtimesBefore.get(fileName) ?? 0)),
      ).toBeLessThan(1);
    }
  });

  it("autosaves only main.md without touching history bytes or timestamps", async () => {
    const store = getStore();
    const created = await store.create("autosave-history", draft, "editor");
    const articleDirectory = path.join(store.blogDirectory, created.slug);
    const initialSource = await readFile(path.join(articleDirectory, "main.md"), "utf8");
    const manuallySaved = await store.update(
      created.slug,
      { ...draft, content: `${draft.content}\n\nManual B`, revision: created.revision },
      "editor",
      "manual",
    );
    const historyPath = path.join(articleDirectory, "main.1.md");
    const fixedHistoryTime = new Date("2020-01-02T03:04:05.000Z");
    await utimes(historyPath, fixedHistoryTime, fixedHistoryTime);
    const historyBefore = await stat(historyPath);

    const autosaved = await store.update(
      created.slug,
      { ...draft, content: `${draft.content}\n\nAutosave C`, revision: manuallySaved.revision },
      "editor",
      "autosave",
    );

    await expect(readFile(historyPath, "utf8")).resolves.toBe(initialSource);
    expect((await stat(historyPath)).mtimeMs).toBe(historyBefore.mtimeMs);
    await expect(readFile(path.join(articleDirectory, "main.2.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(articleDirectory, "main.md"), "utf8")).resolves.toContain(
      "Autosave C",
    );
    expect(autosaved.revision).not.toBe(manuallySaved.revision);
  });

  it("does not create history for stale, forbidden, or lifecycle-changing autosaves", async () => {
    const store = getStore();
    const stale = await store.create("stale-no-history", draft, "editor");
    const staleDirectory = path.join(store.blogDirectory, stale.slug);

    await expect(
      store.update(
        stale.slug,
        { ...draft, content: `${draft.content}\n\nStale`, revision: "0".repeat(64) },
        "editor",
        "manual",
      ),
    ).rejects.toMatchObject({ code: "revision_conflict", status: 409 });
    await expect(readdir(staleDirectory)).resolves.toEqual(["main.md"]);

    await expect(
      store.update(
        stale.slug,
        { ...draft, published: true, revision: stale.revision },
        "admin",
        "autosave",
      ),
    ).rejects.toMatchObject({ code: "autosave_lifecycle_forbidden", status: 422 });
    await expect(readdir(staleDirectory)).resolves.toEqual(["main.md"]);

    const published = await store.create(
      "forbidden-no-history",
      { ...draft, published: true },
      "admin",
    );
    const publishedDirectory = path.join(store.blogDirectory, published.slug);
    await expect(
      store.update(
        published.slug,
        { ...draft, published: true, revision: published.revision },
        "editor",
        "manual",
      ),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(readdir(publishedDirectory)).resolves.toEqual(["main.md"]);
  });

  it("refuses to rotate through a symlinked history file", async (context) => {
    const store = getStore();
    const created = await store.create("unsafe-history", draft, "editor");
    const articleDirectory = path.join(store.blogDirectory, created.slug);
    const mainPath = path.join(articleDirectory, "main.md");
    const mainBefore = await readFile(mainPath, "utf8");
    const outsidePath = path.join(temporaryRoot, "outside-history.md");
    const historyPath = path.join(articleDirectory, "main.1.md");
    await writeFile(outsidePath, "outside source", "utf8");

    try {
      await symlink(outsidePath, historyPath, "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }

    await expect(
      store.update(
        created.slug,
        { ...draft, content: `${draft.content}\n\nUnsafe`, revision: created.revision },
        "editor",
        "manual",
      ),
    ).rejects.toMatchObject({ code: "unsafe_article_history", status: 409 });
    await expect(readFile(mainPath, "utf8")).resolves.toBe(mainBefore);
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("outside source");
  });

  it("shares the mutation queue across store instances for the same content root", async () => {
    const firstStore = getStore();
    const secondStore = getStore();
    const created = await firstStore.create("cross-instance-conflict", draft, "editor");
    const updates = await Promise.allSettled([
      firstStore.update(
        created.slug,
        { ...draft, content: `${draft.content}\n\nStore A`, revision: created.revision },
        "editor",
      ),
      secondStore.update(
        created.slug,
        { ...draft, content: `${draft.content}\n\nStore B`, revision: created.revision },
        "editor",
      ),
    ]);

    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((result) => result.status === "rejected")).toMatchObject([
      { reason: { code: "revision_conflict", status: 409 } },
    ]);
  });

  it("preserves optional and unknown front matter during updates", async () => {
    const store = getStore();
    const articleDirectory = path.join(store.blogDirectory, "preserve-fields");
    await mkdir(articleDirectory, { recursive: true });
    await writeFile(
      path.join(articleDirectory, "main.md"),
      serializeFrontmatter(
        {
          customFlag: true,
          date: draft.date,
          featuredRank: 3,
          published: false,
          summary: draft.description,
          tags: draft.tags,
          title: draft.title,
        },
        draft.content,
      ),
      "utf8",
    );
    const current = await store.read("preserve-fields");
    await store.update(
      "preserve-fields",
      { ...draft, title: "更新後標題", revision: current.revision },
      "editor",
    );
    const source = await readFile(path.join(articleDirectory, "main.md"), "utf8");

    expect(parseFrontmatter(source).data).toMatchObject({
      customFlag: true,
      featuredRank: 3,
      title: "更新後標題",
    });
  });

  it("preserves unknown YAML text that the public parser does not normalize", async () => {
    const store = getStore();
    const articleDirectory = path.join(store.blogDirectory, "preserve-raw-yaml");
    await mkdir(articleDirectory, { recursive: true });
    const source = `---
title: Raw YAML
date: 2026-07-31
summary: Managed summary
tags: [CMS]
published: false
aliases: ["a,b", "c"]
nested:
  enabled: true
  label: "keep: exactly"
---

## Body
`;
    const filePath = path.join(articleDirectory, "main.md");
    await writeFile(filePath, source, "utf8");
    const current = await store.read("preserve-raw-yaml");
    await store.update(
      current.slug,
      { ...draft, revision: current.revision, title: "更新 Raw YAML" },
      "editor",
    );
    const updatedSource = await readFile(filePath, "utf8");

    expect(updatedSource).toContain('aliases: ["a,b", "c"]');
    expect(updatedSource).toContain('nested:\n  enabled: true\n  label: "keep: exactly"');
  });

  it("archives the whole article directory outside the public blog tree", async () => {
    const store = getStore();
    const created = await store.create("archive-me", draft, "editor");
    const assetPath = path.join(store.blogDirectory, "archive-me", "diagram.png");
    await writeFile(assetPath, "asset", "utf8");
    const archive = await store.archive(created.slug, "admin");
    const archiveRoot = path.join(store.trashDirectory, archive.archiveId);

    await expect(store.read("archive-me")).rejects.toMatchObject({
      code: "article_not_found",
      status: 404,
    });
    await expect(store.list()).resolves.toEqual([]);
    await expect(
      readFile(path.join(archiveRoot, "archive-me", "main.md"), "utf8"),
    ).resolves.toContain(draft.title);
    await expect(
      readFile(path.join(archiveRoot, "archive-me", "diagram.png"), "utf8"),
    ).resolves.toBe("asset");
    await expect(readFile(path.join(archiveRoot, "archive.json"), "utf8")).resolves.toContain(
      '"slug": "archive-me"',
    );
  });

  it("refuses to archive through a symlinked trash directory", async (context) => {
    const store = getStore();
    const created = await store.create("safe-before-archive", draft, "editor");
    const outsideDirectory = path.join(temporaryRoot, "outside-trash");
    const trashLink = path.join(temporaryRoot, "content", ".trash");
    await mkdir(outsideDirectory, { recursive: true });

    try {
      await symlink(
        outsideDirectory,
        trashLink,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }

    await expect(store.archive(created.slug, "admin")).rejects.toMatchObject({
      code: "unsafe_trash_root",
      status: 500,
    });
    await expect(store.read(created.slug)).resolves.toMatchObject({ slug: created.slug });
  });
});
