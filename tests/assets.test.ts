import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getBlogAssetResponse } from "@/app/blog/assets/[...asset]/route";
import { GET as getSiteAssetResponse } from "@/app/site/assets/[...asset]/route";
import {
  getBlogAssetUrl,
  getPostAssetFilePath,
  getSafePostMarkdownFilePath,
  getSlugSegments,
  getVersionedBlogAssetUrl,
} from "@/lib/blog/assets";
import {
  getBlogArticleApiPath,
  getBlogArticlePath,
} from "@/lib/blog/slug";
import {
  getSafeResumePdfFilePath,
  getSafeSiteAssetFilePath,
  getSiteAssetUrl,
  getVersionedSiteAssetUrl,
} from "@/lib/site/assets";
import {
  getProjectAssetFilePath,
  getProjectAssetUrl,
  getProjectSlugSegments,
} from "@/lib/projects/assets";

async function createTemporaryBlogAsset() {
  const slug = `route-cache-test-${process.pid}-${Date.now()}`;
  const postDirectory = path.join(process.cwd(), "content", "blog", slug);
  const assetFileName = "diagram.png";
  const assetFilePath = path.join(postDirectory, assetFileName);

  await fs.mkdir(postDirectory, { recursive: true });
  await fs.writeFile(
    path.join(postDirectory, "main.md"),
    `---
title: Route Cache Test
date: 2026-01-01
summary: Test post for asset route cache headers.
tags:
  - Test
published: true
---

Body`,
    "utf8",
  );
  await fs.writeFile(assetFilePath, "fake image bytes");

  const stats = await fs.stat(assetFilePath);

  return {
    assetFileName,
    cleanup: () => fs.rm(postDirectory, { force: true, recursive: true }),
    slug,
    version: `${Math.trunc(stats.mtimeMs)}-${stats.size}`,
  };
}

async function createTemporaryLegacyBlogPost() {
  const slug = `CaseAlias-${process.pid}-${Date.now()}`;
  const postDirectory = path.join(process.cwd(), "content", "blog", slug);
  const filePath = path.join(postDirectory, "main.md");

  await fs.mkdir(postDirectory, { recursive: true });
  await fs.writeFile(
    filePath,
    `---
title: Legacy path boundary test
date: 2026-01-01
summary: Exact path identity test.
tags:
  - Test
published: true
---

Body`,
    "utf8",
  );

  return {
    cleanup: () => fs.rm(postDirectory, { force: true, recursive: true }),
    filePath,
    postDirectory,
    slug,
  };
}

describe("content path helpers", () => {
  it("validates blog and project slug shapes", () => {
    expect(getSlugSegments("series/post")).toEqual(["series", "post"]);
    expect(getSlugSegments("LeetCodeEssential150/1.TwoSums")).toEqual([
      "LeetCodeEssential150",
      "1.TwoSums",
    ]);
    expect(getSlugSegments("LeetCode/模板")).toEqual(["LeetCode", "模板"]);
    expect(getSlugSegments("155.Min Stack")).toEqual(["155.Min Stack"]);
    expect(getSlugSegments("../post")).toBeNull();
    expect(getSlugSegments("series//post")).toBeNull();
    expect(getSlugSegments("three/levels/deep")).toBeNull();
    expect(getSlugSegments("encoded%2fseparator")).toBeNull();
    expect(getSlugSegments("question?")).toBeNull();
    expect(getSlugSegments("trailing.")).toBeNull();
    expect(getProjectSlugSegments("project-a")).toEqual(["project-a"]);
    expect(getProjectSlugSegments("series/project-a")).toBeNull();
  });

  it("rewrites safe relative asset URLs", () => {
    expect(getBlogAssetUrl("series/post", "diagram.png")).toBe(
      "/blog/assets/series/post/diagram.png",
    );
    expect(getProjectAssetUrl("project-a", "demo.png")).toBe(
      "/projects/assets/project-a/demo.png",
    );
    expect(getBlogAssetUrl("LeetCode/模板", "diagram.png")).toBe(
      "/blog/assets/LeetCode/%E6%A8%A1%E6%9D%BF/diagram.png",
    );
  });

  it.each([
    ["CaseStudy", "/blog/CaseStudy", "/api/blog/posts/CaseStudy"],
    [
      "LeetCode/模板",
      "/blog/LeetCode/%E6%A8%A1%E6%9D%BF",
      "/api/blog/posts/LeetCode/%E6%A8%A1%E6%9D%BF",
    ],
    ["155.Min Stack", "/blog/155.Min%20Stack", "/api/blog/posts/155.Min%20Stack"],
    [
      "legacy/question#1",
      "/blog/legacy/question%231",
      "/api/blog/posts/legacy/question%231",
    ],
  ])("encodes public article slug %s segment by segment", (slug, pathUrl, apiUrl) => {
    expect(getBlogArticlePath(slug)).toBe(pathUrl);
    expect(getBlogArticleApiPath(slug)).toBe(apiUrl);
  });

  it("requires exact on-disk casing for public article paths", async () => {
    const temporaryPost = await createTemporaryLegacyBlogPost();

    try {
      await expect(getSafePostMarkdownFilePath(temporaryPost.slug)).resolves.toBe(
        await fs.realpath(temporaryPost.filePath),
      );
      await expect(
        getSafePostMarkdownFilePath(temporaryPost.slug.toLocaleLowerCase("en-US")),
      ).resolves.toBeNull();
    } finally {
      await temporaryPost.cleanup();
    }
  });

  it("rejects in-root directory symlink aliases for public article paths", async () => {
    const temporaryPost = await createTemporaryLegacyBlogPost();
    const aliasSlug = `legacy-alias-${process.pid}-${Date.now()}`;
    const aliasDirectory = path.join(process.cwd(), "content", "blog", aliasSlug);

    try {
      await fs.symlink(
        temporaryPost.postDirectory,
        aliasDirectory,
        process.platform === "win32" ? "junction" : "dir",
      );
      await expect(getSafePostMarkdownFilePath(aliasSlug)).resolves.toBeNull();
    } finally {
      await fs.unlink(aliasDirectory).catch(async () => {
        await fs.rmdir(aliasDirectory).catch(() => undefined);
      });
      await temporaryPost.cleanup();
    }
  });

  it("adds canonical versions only to safe relative blog asset URLs", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, temporaryAsset.assetFileName),
      ).resolves.toBe(
        `/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=${temporaryAsset.version}`,
      );
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "https://example.com/image.png"),
      ).resolves.toBe("https://example.com/image.png");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "/site/assets/bg.png"),
      ).resolves.toBe("/site/assets/bg.png");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "#diagram"),
      ).resolves.toBe("#diagram");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "../secret.png"),
      ).resolves.toBe("../secret.png");
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("rejects traversal asset filesystem paths", () => {
    expect(getPostAssetFilePath("post", ["..", "secret.png"])).toBeNull();
    expect(getProjectAssetFilePath("project-a", ["..", "secret.png"])).toBeNull();
  });

  it("limits blog asset filesystem paths to images", () => {
    expect(getPostAssetFilePath("post", ["diagram.png"])).not.toBeNull();
    expect(getPostAssetFilePath("post", ["main.md"])).toBeNull();
    expect(getPostAssetFilePath("post", ["main.1.md"])).toBeNull();
    expect(getPostAssetFilePath("post", ["main.4.md"])).toBeNull();
    expect(getPostAssetFilePath("series", ["post", "main.md"])).toBeNull();
    expect(getPostAssetFilePath("post", [".env"])).toBeNull();
  });

  it("never serves retained Markdown versions through the public blog asset route", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      await fs.writeFile(
        path.join(process.cwd(), "content", "blog", temporaryAsset.slug, "main.1.md"),
        "previous private source",
        "utf8",
      );
      const response = await getBlogAssetResponse(
        new Request(`https://example.test/blog/assets/${temporaryAsset.slug}/main.1.md`),
        {
          params: Promise.resolve({ asset: [temporaryAsset.slug, "main.1.md"] }),
        },
      );

      expect(response.status).toBe(404);
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("rewrites and constrains runtime site assets", async () => {
    expect(getSiteAssetUrl("bg.png")).toBe("/site/assets/bg.png");
    expect(getSiteAssetUrl("../secret.png")).toBe("../secret.png");
    await expect(getVersionedSiteAssetUrl("../secret.png")).resolves.toBe("../secret.png");
    await expect(getSafeSiteAssetFilePath(["..", "secret.png"])).resolves.toBeNull();
    await expect(getSafeSiteAssetFilePath(["site.json"])).resolves.toBeNull();
  });

  it("rejects non-canonical site asset versions", async () => {
    const response = await getSiteAssetResponse(
      new Request("https://example.test/site/assets/bg.png?v=wrong"),
      { params: Promise.resolve({ asset: ["bg.png"] }) },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves canonical site asset versions as immutable", async () => {
    const assetPath = path.join(process.cwd(), "content", "site", "assets", "bg.png");
    const stats = await fs.stat(assetPath);
    const version = `${Math.trunc(stats.mtimeMs)}-${stats.size}`;
    const response = await getSiteAssetResponse(
      new Request(`https://example.test/site/assets/bg.png?v=${version}`),
      { params: Promise.resolve({ asset: ["bg.png"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Content-Length")).toBe(String(stats.size));
  });

  it("rejects non-canonical blog asset versions", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      const response = await getBlogAssetResponse(
        new Request(
          `https://example.test/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=wrong`,
        ),
        {
          params: Promise.resolve({
            asset: [temporaryAsset.slug, temporaryAsset.assetFileName],
          }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("serves canonical blog asset versions as immutable", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      const response = await getBlogAssetResponse(
        new Request(
          `https://example.test/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=${temporaryAsset.version}`,
        ),
        {
          params: Promise.resolve({
            asset: [temporaryAsset.slug, temporaryAsset.assetFileName],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, immutable",
      );
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("limits resume PDF resolution to the fixed PDF file", async () => {
    const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    const assetDirectory = path.join(rootDirectory, "assets");
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.writeFile(path.join(assetDirectory, "resume.pdf"), "%PDF-1.4\n");

    const filePath = await getSafeResumePdfFilePath(["resume.pdf"], assetDirectory);

    expect(filePath).toBe(path.join(assetDirectory, "resume.pdf"));
    await expect(getSafeResumePdfFilePath(["..", "resume.pdf"], assetDirectory)).resolves.toBeNull();
    await expect(getSafeResumePdfFilePath(["resume.txt"], assetDirectory)).resolves.toBeNull();
    await fs.rm(rootDirectory, { force: true, recursive: true });
  });

  it("rejects missing resume PDFs and symlinks outside the asset root", async () => {
    const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    const assetDirectory = path.join(rootDirectory, "assets");
    const outsideDirectory = path.join(rootDirectory, "outside");
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.mkdir(outsideDirectory, { recursive: true });

    await expect(getSafeResumePdfFilePath(["resume.pdf"], assetDirectory)).resolves.toBeNull();

    const outsidePdf = path.join(outsideDirectory, "resume.pdf");
    const symlinkPath = path.join(assetDirectory, "resume.pdf");
    await fs.writeFile(outsidePdf, "%PDF-1.4\n");

    try {
      await fs.symlink(outsidePdf, symlinkPath);
    } catch {
      await fs.rm(rootDirectory, { force: true, recursive: true });
      return;
    }

    await expect(getSafeResumePdfFilePath(["resume.pdf"], assetDirectory)).resolves.toBeNull();
    await fs.rm(rootDirectory, { force: true, recursive: true });
  });
});
